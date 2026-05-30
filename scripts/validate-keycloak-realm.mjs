import { readFile } from 'node:fs/promises';

const realmPath = new URL(
  '../infra/nkwapa/keycloak/realm-export/realm-nkwapa.json',
  import.meta.url,
);
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

assert(realm.realm === 'nkwapa', 'realm must be nkwapa');
assert(realm.loginTheme === 'nkwapa', 'loginTheme must be nkwapa');
assert(realm.resetPasswordAllowed === true, 'resetPasswordAllowed must be true');
assert(realm.verifyEmail === true, 'verifyEmail must be true');

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

if (failures.length > 0) {
  console.error('Keycloak realm validation failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Keycloak realm validation passed.');
