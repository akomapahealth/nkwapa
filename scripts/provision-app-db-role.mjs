#!/usr/bin/env node
/**
 * Give the unprivileged application role a login.
 *
 * The migration creates `nkwapa_app` without a password, because a migration file is the wrong
 * place for a credential. This grants it LOGIN with a password supplied by the environment, so a
 * local or CI database can be pointed at the role that row level security actually applies to.
 *
 * Run it with the owner credential, after `prisma migrate deploy`.
 */
import { Client } from 'pg';

const ROLE = process.env.APP_DATABASE_ROLE ?? 'nkwapa_app';
const password = process.env.APP_DATABASE_PASSWORD;
const ownerUrl = process.env.DATABASE_URL;

function fail(message) {
  console.error(`provision-app-db-role: ${message}`);
  process.exit(1);
}

if (!ownerUrl) fail('DATABASE_URL is required and must be the owner credential.');
if (!password) fail('APP_DATABASE_PASSWORD is required.');
if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(ROLE))
  fail(`APP_DATABASE_ROLE "${ROLE}" is not a plain identifier.`);

const client = new Client({ connectionString: ownerUrl });

try {
  await client.connect();

  const { rows } = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [ROLE]);
  if (rows.length === 0) {
    fail(`Role "${ROLE}" does not exist. Run the database migrations first.`);
  }

  // ALTER ROLE takes no bind parameters, so the statement is built by the server through format()
  // with %I/%L quoting rather than by string interpolation here.
  const {
    rows: [{ statement }],
  } = await client.query('SELECT format($1::text, $2::text, $3::text) AS statement', [
    'ALTER ROLE %I LOGIN PASSWORD %L',
    ROLE,
    password,
  ]);
  await client.query(statement);

  const { rows: verified } = await client.query(
    'SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = $1',
    [ROLE],
  );
  if (verified[0].rolsuper || verified[0].rolbypassrls) {
    fail(`Role "${ROLE}" holds SUPERUSER or BYPASSRLS and would bypass every policy.`);
  }

  console.log(`Provisioned login for unprivileged application role "${ROLE}".`);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
} finally {
  await client.end().catch(() => {});
}
