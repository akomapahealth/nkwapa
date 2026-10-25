import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { appendFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const COMPONENTS = ['database', 'redis', 'queues', 'email', 'auth', 'web'];
const RETRY_MS = 15_000;
const MAX_MS = 10 * 60_000;

function required(env, key) {
  const value = env[key]?.trim();
  if (!value) throw new Error(`${key} is required for deploy verification`);
  return value;
}

async function getJson(fetcher, url) {
  const response = await fetcher(url, { signal: AbortSignal.timeout(8_000), cache: 'no-store' });
  if (!response.ok) throw new Error(`${new URL(url).pathname}: HTTP ${response.status}`);
  return response.json();
}

export async function verifyOnce(env, { fetcher = fetch, fixtureCheck = checkFixtures } = {}) {
  const webUrl = required(env, 'VERIFY_WEB_URL').replace(/\/$/, '');
  const apiUrl = required(env, 'VERIFY_API_URL').replace(/\/$/, '');
  const authIssuer = required(env, 'VERIFY_AUTH_ISSUER').replace(/\/$/, '');
  const sha = required(env, 'GITHUB_SHA');
  const environment = required(env, 'VERIFY_ENVIRONMENT');
  if (!['staging', 'production'].includes(environment))
    throw new Error('VERIFY_ENVIRONMENT must be staging or production');
  if (environment === 'production') required(env, 'VERIFY_READONLY_DATABASE_URL');
  const failures = [];
  const attempt = async (label, work) => {
    try {
      await work();
    } catch (error) {
      failures.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  await Promise.all([
    attempt('web', async () => {
      const response = await fetcher(webUrl, { signal: AbortSignal.timeout(8_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const version = await getJson(fetcher, `${webUrl}/api/version`);
      if (version.sha !== sha)
        throw new Error(`deployed SHA ${version.sha ?? 'missing'} differs from ${sha}`);
    }),
    attempt('API', async () => {
      const status = await getJson(fetcher, `${apiUrl}/status`);
      if (status.apiSha !== sha)
        failures.push(`API: deployed SHA ${status.apiSha ?? 'missing'} differs from ${sha}`);
      if (status.webSha !== sha)
        failures.push(`API: observed web SHA ${status.webSha ?? 'missing'} differs from ${sha}`);
      if (status.status !== 'operational')
        failures.push(`API: overall state ${status.status ?? 'missing'}`);
      for (const name of COMPONENTS) {
        const component = status.components?.find((item) => item.name === name);
        if (component?.state !== 'operational')
          failures.push(
            `component ${name}: ${component?.state ?? 'missing'} (${component?.reason ?? 'NO_RESULT'})`,
          );
      }
    }),
    attempt('auth', async () => {
      const document = await getJson(fetcher, `${authIssuer}/.well-known/openid-configuration`);
      if (document.issuer !== authIssuer)
        throw new Error(`issuer ${document.issuer ?? 'missing'} differs from target`);
    }),
    attempt('CORS', async () => {
      const response = await fetcher(`${apiUrl}/status`, {
        method: 'OPTIONS',
        signal: AbortSignal.timeout(8_000),
        headers: { Origin: webUrl, 'Access-Control-Request-Method': 'GET' },
      });
      if (!response.ok || response.headers.get('access-control-allow-origin') !== webUrl) {
        throw new Error(`preflight denied (HTTP ${response.status})`);
      }
    }),
    ...(environment === 'production'
      ? [attempt('fixtures', () => fixtureCheck(env.VERIFY_READONLY_DATABASE_URL))]
      : []),
  ]);
  return { ok: failures.length === 0, failures };
}

export async function checkFixtures(databaseUrl) {
  const { Client } = require('pg');
  const {
    SEED_FIXTURE_EMAIL_DOMAIN,
    SEED_FIXTURE_PATIENT_NAMES,
  } = require('../packages/db/dist/src/seed-plan.js');
  const client = new Client({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 5_000,
    query_timeout: 8_000,
  });
  await client.connect();
  try {
    await client.query('BEGIN READ ONLY');
    await client.query("SET LOCAL app.is_system_admin = 'true'");
    await client.query("SET LOCAL app.system_context_reason = 'post-deploy-fixture-check'");
    const privileges = await client.query(`SELECT
      r.rolsuper OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication OR r.rolbypassrls
        OR has_database_privilege(current_user, current_database(), 'CREATE')
        OR has_schema_privilege(current_user, 'public', 'CREATE') AS elevated,
      EXISTS (
        SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
          AND has_table_privilege(current_user, c.oid, 'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
      ) AS table_write
      FROM pg_roles r WHERE r.rolname = current_user`);
    if (privileges.rows[0]?.elevated || privileges.rows[0]?.table_write) {
      throw new Error('fixture credential has write privileges');
    }
    const users = await client.query(
      'SELECT count(*)::int AS count FROM "User" WHERE lower(email) LIKE $1 OR lower("displayName") LIKE $2',
      [`%${SEED_FIXTURE_EMAIL_DOMAIN.toLowerCase()}`, 'e2e %'],
    );
    const values = SEED_FIXTURE_PATIENT_NAMES.flat();
    const tuples = SEED_FIXTURE_PATIENT_NAMES.map(
      (_, index) => `($${index * 2 + 1}, $${index * 2 + 2})`,
    ).join(', ');
    const patients = await client.query(
      `SELECT count(*)::int AS count FROM "Patient" WHERE ("firstName", "lastName") IN (${tuples})`,
      values,
    );
    if (users.rows[0].count || patients.rows[0].count) {
      throw new Error(
        `found ${users.rows[0].count} fixture users and ${patients.rows[0].count} fixture patients`,
      );
    }
  } finally {
    await client.query('ROLLBACK');
    await client.end();
  }
}

export async function verifyWithRetry(env, options = {}) {
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const start = now();
  let result;
  do {
    result = await verifyOnce(env, options);
    if (result.ok) return result;
    if (now() - start >= (options.maxMs ?? MAX_MS)) break;
    await sleep(options.retryMs ?? RETRY_MS);
  } while (true);
  return result;
}

export function markdownReport(result, env) {
  return [
    `### Post-deploy verification: ${result.ok ? 'passed' : 'failed'}`,
    '',
    `Environment: ${env.VERIFY_ENVIRONMENT ?? 'unknown'}`,
    `Commit: ${env.GITHUB_SHA ?? 'unknown'}`,
    '',
    ...(result.ok
      ? ['All required checks passed.']
      : result.failures.map((failure) => `- ${failure}`)),
    '',
  ].join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let result;
  try {
    result = await verifyWithRetry(process.env);
  } catch (error) {
    result = { ok: false, failures: [error instanceof Error ? error.message : String(error)] };
  }
  const report = markdownReport(result, process.env);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, report);
  console.log(report);
  if (!result.ok) process.exitCode = 1;
}
