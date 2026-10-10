/**
 * Apply the nkwapa-api service account to a realm that already exists.
 *
 * The realm export in infra/nkwapa/keycloak/realm-export carries this client, but Keycloak's
 * --import-realm only imports a realm that is *absent*. Staging and production already have
 * one, so redeploying the auth service ships the new export and changes nothing. This closes
 * that gap, once per environment.
 *
 * Idempotent: every step checks before it writes, so re-running is a no-op and a partial run
 * can simply be repeated.
 *
 * Usage:
 *   KEYCLOAK_BASE_URL=https://auth.example.app \
 *   KC_BOOTSTRAP_ADMIN_USERNAME=admin \
 *   KC_BOOTSTRAP_ADMIN_PASSWORD=... \
 *   KEYCLOAK_ADMIN_CLIENT_SECRET=... \
 *   node scripts/apply-keycloak-service-account.mjs [--dry-run]
 */
import 'dotenv/config';

const dryRun = process.argv.includes('--dry-run');

const baseUrl = (
  process.env.KEYCLOAK_BASE_URL ||
  process.env.KEYCLOAK_ADMIN_BASE_URL ||
  ''
).replace(/\/$/, '');
const realm = process.env.KEYCLOAK_REALM || 'nkwapa';
const clientId = process.env.KEYCLOAK_ADMIN_CLIENT_ID || 'nkwapa-api';
const clientSecret = process.env.KEYCLOAK_ADMIN_CLIENT_SECRET || '';
const adminUsername = process.env.KC_BOOTSTRAP_ADMIN_USERNAME || process.env.KEYCLOAK_ADMIN || '';
const adminPassword =
  process.env.KC_BOOTSTRAP_ADMIN_PASSWORD || process.env.KEYCLOAK_ADMIN_PASSWORD || '';

const REQUIRED_ROLE = 'manage-users';

function fail(message) {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

const missing = [
  ['KEYCLOAK_BASE_URL', baseUrl],
  ['KC_BOOTSTRAP_ADMIN_USERNAME', adminUsername],
  ['KC_BOOTSTRAP_ADMIN_PASSWORD', adminPassword],
  ['KEYCLOAK_ADMIN_CLIENT_SECRET', clientSecret],
]
  .filter(([, value]) => !value)
  .map(([name]) => name);
if (missing.length > 0) fail(`Set ${missing.join(', ')} before running this.`);

async function parseJson(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function adminToken() {
  const response = await fetch(`${baseUrl}/realms/master/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: 'admin-cli',
      grant_type: 'password',
      username: adminUsername,
      password: adminPassword,
    }),
  });
  if (!response.ok) {
    fail(
      `Could not authenticate as realm administrator (${response.status}). Check the admin credentials and that ${baseUrl} is reachable.`,
    );
  }
  return (await response.json()).access_token;
}

let token;
async function api(method, path, body) {
  const response = await fetch(`${baseUrl}/admin/realms/${realm}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, ok: response.ok, body: await parseJson(response) };
}

async function getClient(id) {
  const result = await api('GET', `/clients?clientId=${encodeURIComponent(id)}`);
  if (!result.ok) fail(`Could not read clients (${result.status}). Does realm "${realm}" exist?`);
  return Array.isArray(result.body) && result.body.length > 0 ? result.body[0] : null;
}

const steps = [];
function record(step, state, detail = '') {
  steps.push({ step, state, detail });
  const mark = state === 'created' ? '+' : state === 'already correct' ? '=' : '!';
  console.log(`  ${mark} ${step}${detail ? `: ${detail}` : ''}`);
}

async function main() {
  console.log(`\nApplying the ${clientId} service account to realm "${realm}" at ${baseUrl}`);
  if (dryRun) console.log('DRY RUN: nothing will be written.\n');
  else console.log('');

  token = await adminToken();

  // 1. The confidential client.
  let client = await getClient(clientId);
  if (client) {
    record(`client ${clientId}`, 'already correct', `id ${client.id}`);
  } else if (dryRun) {
    record(`client ${clientId}`, 'would create');
  } else {
    const created = await api('POST', '/clients', {
      clientId,
      name: 'Nkwapa API service account',
      description:
        'Server-side client used only to provision patient portal identities. No browser flow.',
      enabled: true,
      publicClient: false,
      serviceAccountsEnabled: true,
      standardFlowEnabled: false,
      implicitFlowEnabled: false,
      directAccessGrantsEnabled: false,
      frontchannelLogout: false,
      secret: clientSecret,
      redirectUris: [],
      webOrigins: [],
      protocol: 'openid-connect',
      fullScopeAllowed: false,
    });
    if (!created.ok && created.status !== 409) {
      fail(`Could not create the client (${created.status}): ${JSON.stringify(created.body)}`);
    }
    client = await getClient(clientId);
    if (!client) fail('The client was created but could not be read back.');
    record(`client ${clientId}`, 'created', `id ${client.id}`);
  }

  if (dryRun && !client) {
    console.log('\nDry run stops here: the remaining steps need the client to exist.\n');
    return;
  }

  // Keep the secret in step with what the API is configured with. Rotating it here is the
  // whole point of re-running after a secret change.
  if (!dryRun) {
    const current = await api('GET', `/clients/${client.id}/client-secret`);
    if (current.ok && current.body?.value !== clientSecret) {
      const updated = await api('PUT', `/clients/${client.id}`, {
        ...client,
        secret: clientSecret,
      });
      if (!updated.ok) fail(`Could not set the client secret (${updated.status}).`);
      record('client secret', 'created', 'set to KEYCLOAK_ADMIN_CLIENT_SECRET');
    } else {
      record('client secret', 'already correct');
    }
  }

  const realmManagement = await getClient('realm-management');
  if (!realmManagement) fail('The realm-management client is missing, which should be impossible.');

  const serviceAccount = await api('GET', `/clients/${client.id}/service-account-user`);
  if (!serviceAccount.ok)
    fail(`Could not read the service account user (${serviceAccount.status}).`);
  const serviceAccountId = serviceAccount.body.id;

  // 2. The role, and only this role.
  const roleResult = await api('GET', `/clients/${realmManagement.id}/roles/${REQUIRED_ROLE}`);
  if (!roleResult.ok) fail(`Could not read the ${REQUIRED_ROLE} role (${roleResult.status}).`);
  const role = { id: roleResult.body.id, name: roleResult.body.name };

  const held = await api(
    'GET',
    `/users/${serviceAccountId}/role-mappings/clients/${realmManagement.id}`,
  );
  const heldNames = (held.body || []).map((entry) => entry.name);
  if (heldNames.includes(REQUIRED_ROLE)) {
    record(`role ${REQUIRED_ROLE}`, 'already correct');
  } else if (dryRun) {
    record(`role ${REQUIRED_ROLE}`, 'would create');
  } else {
    const granted = await api(
      'POST',
      `/users/${serviceAccountId}/role-mappings/clients/${realmManagement.id}`,
      [role],
    );
    if (!granted.ok) fail(`Could not grant ${REQUIRED_ROLE} (${granted.status}).`);
    record(`role ${REQUIRED_ROLE}`, 'created');
  }

  const extra = heldNames.filter((name) => name !== REQUIRED_ROLE);
  if (extra.length > 0) {
    record(
      'extra realm-management roles',
      'WARNING',
      `${extra.join(', ')} -- remove these; manage-users is the whole ceiling`,
    );
  }

  /*
    3. The scope mapping.

    The step that is easy to miss and hard to read. With fullScopeAllowed false, Keycloak
    leaves any role that is not also in the client's scope out of the issued token: the
    client authenticates perfectly and then every admin call returns 403, which looks like a
    missing role rather than a missing scope.
  */
  const scoped = await api(
    'GET',
    `/clients/${client.id}/scope-mappings/clients/${realmManagement.id}`,
  );
  const scopedNames = (scoped.body || []).map((entry) => entry.name);
  if (scopedNames.includes(REQUIRED_ROLE)) {
    record(`scope mapping for ${REQUIRED_ROLE}`, 'already correct');
  } else if (dryRun) {
    record(`scope mapping for ${REQUIRED_ROLE}`, 'would create');
  } else {
    const mapped = await api(
      'POST',
      `/clients/${client.id}/scope-mappings/clients/${realmManagement.id}`,
      [role],
    );
    if (!mapped.ok) fail(`Could not add the scope mapping (${mapped.status}).`);
    record(`scope mapping for ${REQUIRED_ROLE}`, 'created');
  }

  // 4. Registration must still be closed.
  const realmConfig = await api('GET', '');
  if (realmConfig.ok && realmConfig.body?.registrationAllowed === true) {
    record(
      'registrationAllowed',
      'WARNING',
      'is true; open self-registration lets anyone create an account against a clinic',
    );
  } else {
    record('registrationAllowed', 'already correct', 'false');
  }

  if (dryRun) {
    console.log('\nDry run complete. Re-run without --dry-run to apply.\n');
    return;
  }

  // 5. Prove the ceiling rather than the happy path.
  console.log('\nVerifying what the service account can and cannot do:\n');

  const tokenResponse = await fetch(`${baseUrl}/realms/${realm}/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  if (!tokenResponse.ok)
    fail(`The service account could not authenticate (${tokenResponse.status}). Check the secret.`);
  const serviceToken = (await tokenResponse.json()).access_token;

  const probe = async (method, path) => {
    const response = await fetch(`${baseUrl}/admin/realms/${realm}${path}`, {
      method,
      headers: { Authorization: `Bearer ${serviceToken}`, 'Content-Type': 'application/json' },
      body: method === 'PUT' ? JSON.stringify({}) : undefined,
    });
    return response.status;
  };

  const allowed = await probe('GET', '/users?max=1');
  const checks = [
    ['read users (manage-users)', allowed, 200, true],
    ['list clients', await probe('GET', '/clients'), 403, false],
    ['list realm roles', await probe('GET', '/roles'), 403, false],
    ['update the realm', await probe('PUT', ''), 403, false],
  ];

  let ok = true;
  for (const [label, actual, expected, shouldSucceed] of checks) {
    const pass = actual === expected;
    if (!pass) ok = false;
    console.log(
      `  ${pass ? 'ok  ' : 'FAIL'} ${label}: ${actual} (expected ${expected}${shouldSucceed ? '' : ', must be refused'})`,
    );
  }

  if (!ok) {
    if (allowed === 403) {
      fail(
        'The service account is refused even for users. That is the scope mapping, not the role: re-run this script.',
      );
    }
    fail(
      'The service account can do more than manage-users. Remove the extra roles before using this environment.',
    );
  }

  console.log(`\nDone. Set these on the API service:\n`);
  console.log(`  KEYCLOAK_ADMIN_BASE_URL=${baseUrl}`);
  console.log(`  KEYCLOAK_REALM=${realm}`);
  console.log(`  KEYCLOAK_ADMIN_CLIENT_ID=${clientId}`);
  console.log(`  KEYCLOAK_ADMIN_CLIENT_SECRET=<the value you just used>`);
  console.log(`\nand the same KEYCLOAK_ADMIN_CLIENT_SECRET on the Keycloak service, so a future`);
  console.log(`clean import substitutes it rather than the literal placeholder.\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
