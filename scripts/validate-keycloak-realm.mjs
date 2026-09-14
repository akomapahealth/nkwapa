import { access, readFile } from 'node:fs/promises';

const realmPath = new URL(
  '../infra/nkwapa/keycloak/realm-export/realm-nkwapa.json',
  import.meta.url,
);
const themeLoginPath = new URL('../infra/nkwapa/keycloak/themes/nkwapa/login/', import.meta.url);
const realm = JSON.parse(await readFile(realmPath, 'utf8'));
const failures = [];

function assert(condition, message) {
  if (!condition) {
    failures.push(message);
  }
}

function findFlow(alias) {
  return realm.authenticationFlows?.find((flow) => flow.alias === alias);
}

function findExecution(flow, authenticator) {
  return flow?.authenticationExecutions?.find(
    (execution) => execution.authenticator === authenticator,
  );
}

function assertSmtpPlaceholder(key, envName) {
  assert(
    realm.smtpServer?.[key] === `\${${envName}}`,
    `smtpServer.${key} must use the ${envName} placeholder`,
  );
}

async function assertThemeFile(relativePath, root = themeLoginPath) {
  try {
    await access(new URL(relativePath, root));
  } catch {
    failures.push(`theme file must exist: ${relativePath}`);
  }
}

async function assertThemeFileIncludes(relativePath, expectedText, message, root = themeLoginPath) {
  try {
    const contents = await readFile(new URL(relativePath, root), 'utf8');
    assert(contents.includes(expectedText), message);
  } catch {
    failures.push(`theme file must be readable: ${relativePath}`);
  }
}

assert(realm.realm === 'nkwapa', 'realm must be nkwapa');
assert(realm.loginTheme === 'nkwapa', 'loginTheme must be nkwapa');
assert(
  realm.sslRequired === '${KC_SSL_REQUIRED}',
  'sslRequired must use the KC_SSL_REQUIRED placeholder',
);
assert(realm.resetPasswordAllowed === true, 'resetPasswordAllowed must be true');
assert(realm.verifyEmail === true, 'verifyEmail must be true');
// Open self-registration would let anyone create an account against a clinic. Patients are
// provisioned from an invite instead, so this flag staying false is load-bearing.
assert(realm.registrationAllowed === false, 'registrationAllowed must stay false');
assert(
  realm.actionTokenGeneratedByAdminLifespan === 43200,
  'admin action token lifespan must be 43200 seconds',
);
assert(
  realm.attributes?.['actionTokenGeneratedByUserLifespan.reset-credentials'] === '900',
  'reset credentials action token lifespan must be 900 seconds',
);
assert(
  realm.attributes?.['actionTokenGeneratedByUserLifespan.verify-email'] === '86400',
  'verify email action token lifespan must be 86400 seconds',
);

assertSmtpPlaceholder('host', 'KC_SMTP_HOST');
assertSmtpPlaceholder('port', 'KC_SMTP_PORT');
assertSmtpPlaceholder('from', 'KC_SMTP_FROM');
assertSmtpPlaceholder('fromDisplayName', 'KC_SMTP_FROM_DISPLAY_NAME');
assertSmtpPlaceholder('replyTo', 'KC_SMTP_REPLY_TO');
assertSmtpPlaceholder('replyToDisplayName', 'KC_SMTP_REPLY_TO_DISPLAY_NAME');
assertSmtpPlaceholder('envelopeFrom', 'KC_SMTP_ENVELOPE_FROM');
assertSmtpPlaceholder('auth', 'KC_SMTP_AUTH');
assertSmtpPlaceholder('starttls', 'KC_SMTP_STARTTLS');
assertSmtpPlaceholder('ssl', 'KC_SMTP_SSL');
assertSmtpPlaceholder('user', 'KC_SMTP_USER');
assertSmtpPlaceholder('password', 'KC_SMTP_PASSWORD');

assert(
  realm.resetCredentialsFlow === 'reset credentials',
  'resetCredentialsFlow must use the reset credentials flow',
);

const resetFlow = findFlow('reset credentials');
assert(Boolean(resetFlow), 'reset credentials flow must be exported');
assert(
  findExecution(resetFlow, 'reset-credentials-choose-user')?.requirement === 'REQUIRED',
  'reset credentials flow must choose the user',
);

const resetEmailExecution = findExecution(resetFlow, 'reset-credential-email');
assert(
  resetEmailExecution?.requirement === 'REQUIRED',
  'reset credentials flow must send reset email',
);
assert(
  resetEmailExecution?.authenticatorConfig === 'nkwapa-reset-email-force-login',
  'reset email execution must use the force-login config',
);
assert(
  findExecution(resetFlow, 'reset-password')?.requirement === 'REQUIRED',
  'reset credentials flow must include reset-password',
);
assert(
  resetFlow?.authenticationExecutions?.some(
    (execution) =>
      execution.flowAlias === 'Reset - Conditional OTP' &&
      execution.authenticatorFlow === true &&
      execution.requirement === 'CONDITIONAL',
  ),
  'reset credentials flow must include conditional OTP subflow',
);

const forceLoginConfig = realm.authenticatorConfig?.find(
  (config) => config.alias === 'nkwapa-reset-email-force-login',
);
assert(
  forceLoginConfig?.config?.['force-login'] === 'true',
  'reset-credential-email force-login must be true',
);

const updatePasswordAction = realm.requiredActions?.find(
  (action) => action.alias === 'UPDATE_PASSWORD',
);
assert(updatePasswordAction?.enabled === true, 'UPDATE_PASSWORD required action must be enabled');
assert(
  updatePasswordAction?.providerId === 'UPDATE_PASSWORD',
  'UPDATE_PASSWORD required action must use the UPDATE_PASSWORD provider',
);

const verifyEmailAction = realm.requiredActions?.find((action) => action.alias === 'VERIFY_EMAIL');
assert(verifyEmailAction?.enabled === true, 'VERIFY_EMAIL required action must be enabled');
assert(
  verifyEmailAction?.providerId === 'VERIFY_EMAIL',
  'VERIFY_EMAIL required action must use the VERIFY_EMAIL provider',
);

const client = realm.clients?.find((candidate) => candidate.clientId === 'nkwapa-web');
assert(Boolean(client), 'nkwapa-web client must be present');
for (const redirectUri of [
  'http://localhost:3000',
  'http://localhost:3000/*',
  'https://staging.nkwapa.app',
  'https://staging.nkwapa.app/*',
  'https://app.nkwapa.app',
  'https://app.nkwapa.app/*',
]) {
  assert(
    client?.redirectUris?.includes(redirectUri),
    `nkwapa-web redirectUris must include ${redirectUri}`,
  );
}

/*
  The public client must gain nothing from the service account being added beside it.

  nkwapa-web ships to the browser, so anything it can do, anyone holding the page can do. The
  provisioning capability belongs to nkwapa-api and must stay there; these are the assertions
  that would fail if a future edit tried to take the shortcut of enabling a service account on
  the client that already exists.
*/
assert(client?.publicClient === true, 'nkwapa-web must stay a public client');
assert(client?.serviceAccountsEnabled !== true, 'nkwapa-web must not enable a service account');
assert(
  client?.authorizationServicesEnabled !== true,
  'nkwapa-web must not enable authorization services',
);
assert(client?.secret === undefined, 'nkwapa-web must not carry a client secret');

const apiClient = realm.clients?.find((candidate) => candidate.clientId === 'nkwapa-api');
assert(Boolean(apiClient), 'nkwapa-api service-account client must be present');
assert(apiClient?.publicClient === false, 'nkwapa-api must be a confidential client');
assert(apiClient?.serviceAccountsEnabled === true, 'nkwapa-api must enable its service account');
assert(
  apiClient?.secret === '${KEYCLOAK_ADMIN_CLIENT_SECRET}',
  'nkwapa-api secret must use the KEYCLOAK_ADMIN_CLIENT_SECRET placeholder',
);
// No browser-facing flow: this client never fronts a login, so every avenue that would let a
// redirect or a password grant reach it stays shut.
assert(apiClient?.standardFlowEnabled === false, 'nkwapa-api must not enable the standard flow');
assert(apiClient?.implicitFlowEnabled === false, 'nkwapa-api must not enable the implicit flow');
assert(
  apiClient?.directAccessGrantsEnabled === false,
  'nkwapa-api must not enable direct access grants',
);
assert(apiClient?.fullScopeAllowed === false, 'nkwapa-api must not allow full scope');
assert(
  Array.isArray(apiClient?.redirectUris) && apiClient.redirectUris.length === 0,
  'nkwapa-api must declare no redirect URIs',
);
assert(
  Array.isArray(apiClient?.webOrigins) && apiClient.webOrigins.length === 0,
  'nkwapa-api must declare no web origins',
);

/*
  The service account's ceiling, asserted as an exact set rather than a membership test.

  manage-users is enough to create a patient identity and send it an action email. Anything
  more -- manage-realm, view-clients, realm-admin -- would make a leaked secret a realm
  takeover instead of a contained incident, so the check fails on any extra role.
*/
const serviceAccount = realm.users?.find(
  (candidate) => candidate.serviceAccountClientId === 'nkwapa-api',
);
assert(Boolean(serviceAccount), 'nkwapa-api service account user must be exported');
assert(serviceAccount?.enabled === true, 'nkwapa-api service account must be enabled');
const serviceAccountClientRoles = serviceAccount?.clientRoles ?? {};
assert(
  Object.keys(serviceAccountClientRoles).join(',') === 'realm-management',
  'nkwapa-api service account must hold client roles on realm-management only',
);
assert(
  [...(serviceAccountClientRoles['realm-management'] ?? [])].sort().join(',') === 'manage-users',
  'nkwapa-api service account must hold exactly manage-users',
);
assert(
  (serviceAccount?.realmRoles ?? []).length === 0,
  'nkwapa-api service account must hold no realm roles',
);

for (const relativePath of [
  'template.ftl',
  'login.ftl',
  'login-reset-password.ftl',
  'login-update-password.ftl',
  'login-verify-email.ftl',
  'info.ftl',
  'error.ftl',
  'login-page-expired.ftl',
  'resources/css/styles.css',
  'resources/js/password-toggle.js',
  'resources/img/auth-clinic.jpg',
  'resources/img/nkwapa-logo.png',
]) {
  await assertThemeFile(relativePath);
}

await assertThemeFileIncludes(
  'theme.properties',
  'scripts=js/password-toggle.js',
  'theme.properties must load the shared password toggle script',
);
await assertThemeFileIncludes(
  'template.ftl',
  'img/nkwapa-logo.png',
  'template.ftl must use the canonical Nkwapa PNG logo',
);
await assertThemeFileIncludes(
  'template.ftl',
  'img/auth-clinic.jpg',
  'template.ftl must use the optimized auth clinic photo',
);
await assertThemeFileIncludes(
  'login-update-password.ftl',
  "messagesPerField.existsError('password','password-new','password-confirm')",
  'login-update-password.ftl must preserve Keycloak password validation messages',
);
await assertThemeFileIncludes(
  'login-verify-email.ftl',
  '${url.loginAction}',
  'login-verify-email.ftl must keep the Keycloak resend-verification action',
);

if (failures.length > 0) {
  console.error('Keycloak realm validation failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Keycloak realm validation passed.');
