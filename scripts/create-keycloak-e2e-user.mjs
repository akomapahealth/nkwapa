import 'dotenv/config';
import { appendFile } from 'node:fs/promises';

const keycloakBaseUrl = (
  process.env.KEYCLOAK_BASE_URL ||
  process.env.NEXT_PUBLIC_KEYCLOAK_URL ||
  'http://localhost:8080'
).replace(/\/$/, '');
const realm = process.env.KEYCLOAK_REALM || process.env.NEXT_PUBLIC_KEYCLOAK_REALM || 'nkwapa';
const adminUsername =
  process.env.KC_BOOTSTRAP_ADMIN_USERNAME || process.env.KEYCLOAK_ADMIN || 'admin';
const adminPassword =
  process.env.KC_BOOTSTRAP_ADMIN_PASSWORD || process.env.KEYCLOAK_ADMIN_PASSWORD || 'admin';

const staffUser = {
  id: process.env.E2E_STAFF_SUB || '00000000-0000-4000-8000-000000000042',
  username: process.env.E2E_STAFF_USERNAME || 'e2e.staff',
  password: process.env.E2E_STAFF_PASSWORD || 'NkwapaE2E!23',
  email: process.env.E2E_STAFF_EMAIL || 'e2e.staff@nkwapa.local',
  displayName: process.env.E2E_STAFF_NAME || 'E2E Staff',
};

const resetUser = {
  id: process.env.E2E_RESET_SUB || '00000000-0000-4000-8000-000000000043',
  username: process.env.E2E_RESET_USERNAME || 'e2e.reset',
  password: process.env.E2E_RESET_PASSWORD || 'NkwapaReset!23',
  email: process.env.E2E_RESET_EMAIL || 'e2e.reset@nkwapa.local',
  displayName: process.env.E2E_RESET_NAME || 'E2E Reset',
};

function splitName(displayName) {
  const [firstName, ...lastNameParts] = displayName.trim().split(/\s+/);
  return {
    firstName: firstName || 'E2E',
    lastName: lastNameParts.join(' ') || 'Staff',
  };
}

async function parseJson(response) {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function assertOk(response, context) {
  if (response.ok) {
    return;
  }

  const body = await parseJson(response);
  throwResponseError(response, context, body);
}

function throwResponseError(response, context, body) {
  throw new Error(
    `${context} failed (${response.status} ${response.statusText}): ${JSON.stringify(body)}`,
  );
}

function isPasswordHistoryError(response, body) {
  return (
    response.status === 400 &&
    body &&
    typeof body === 'object' &&
    body.error === 'invalidPasswordHistoryMessage'
  );
}

async function getAdminAccessToken() {
  const body = new URLSearchParams({
    client_id: 'admin-cli',
    grant_type: 'password',
    username: adminUsername,
    password: adminPassword,
  });

  const response = await fetch(`${keycloakBaseUrl}/realms/master/protocol/openid-connect/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  await assertOk(response, 'Keycloak admin token request');

  const payload = await response.json();
  return payload.access_token;
}

async function getUserById(accessToken, userId) {
  const response = await fetch(`${keycloakBaseUrl}/admin/realms/${realm}/users/${userId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (response.status === 404) {
    return null;
  }

  await assertOk(response, 'Keycloak user lookup');
  return response.json();
}

async function findUserByUsername(accessToken, username) {
  const response = await fetch(
    `${keycloakBaseUrl}/admin/realms/${realm}/users?username=${encodeURIComponent(username)}&exact=true`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );
  await assertOk(response, 'Keycloak username lookup');

  const users = await response.json();
  return users[0] ?? null;
}

async function findUserByEmail(accessToken, email) {
  const response = await fetch(
    `${keycloakBaseUrl}/admin/realms/${realm}/users?search=${encodeURIComponent(email)}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );
  await assertOk(response, 'Keycloak email lookup');

  const users = await response.json();
  return (
    users.find(
      (user) => typeof user.email === 'string' && user.email.toLowerCase() === email.toLowerCase(),
    ) ?? null
  );
}

async function upsertUser(accessToken, user) {
  const existingById = await getUserById(accessToken, user.id);
  const existingByUsername = existingById
    ? null
    : await findUserByUsername(accessToken, user.username);
  const existingByEmail =
    existingById || existingByUsername ? null : await findUserByEmail(accessToken, user.email);
  const existingUser = existingById ?? existingByUsername ?? existingByEmail;
  const targetId = existingUser?.id ?? user.id;
  const { firstName, lastName } = splitName(user.displayName);
  const payload = {
    id: targetId,
    username: user.username,
    enabled: true,
    emailVerified: true,
    email: user.email,
    firstName,
    lastName,
  };

  if (existingUser) {
    const response = await fetch(`${keycloakBaseUrl}/admin/realms/${realm}/users/${targetId}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    await assertOk(response, 'Keycloak user update');
  } else {
    const response = await fetch(`${keycloakBaseUrl}/admin/realms/${realm}/users`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (response.status !== 409) {
      await assertOk(response, 'Keycloak user creation');
    }
  }

  const persistedUser =
    (await findUserByUsername(accessToken, user.username)) ??
    (await findUserByEmail(accessToken, user.email));
  if (!persistedUser?.id) {
    throw new Error(
      `Keycloak created "${user.username}" but it could not be looked up afterwards.`,
    );
  }

  const passwordResponse = await fetch(
    `${keycloakBaseUrl}/admin/realms/${realm}/users/${persistedUser.id}/reset-password`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'password',
        value: user.password,
        temporary: false,
      }),
    },
  );
  if (!passwordResponse.ok) {
    const body = await parseJson(passwordResponse);
    if (!isPasswordHistoryError(passwordResponse, body)) {
      throwResponseError(passwordResponse, 'Keycloak password reset', body);
    }
  }

  return persistedUser.id;
}

async function appendGithubEnv(name, value) {
  if (!process.env.GITHUB_ENV) {
    return;
  }

  await appendFile(process.env.GITHUB_ENV, `${name}=${value}\n`);
}

async function appendGithubOutput(name, value) {
  if (!process.env.GITHUB_OUTPUT) {
    return;
  }

  await appendFile(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

async function main() {
  const accessToken = await getAdminAccessToken();
  const staffUserId = await upsertUser(accessToken, staffUser);
  const resetUserId = await upsertUser(accessToken, resetUser);
  await appendGithubEnv('E2E_STAFF_SUB', staffUserId);
  await appendGithubEnv('E2E_RESET_SUB', resetUserId);
  await appendGithubOutput('staff-user-id', staffUserId);
  await appendGithubOutput('reset-user-id', resetUserId);

  console.log(
    JSON.stringify(
      {
        realm,
        keycloakBaseUrl,
        staff: {
          requestedUserId: staffUser.id,
          userId: staffUserId,
          username: staffUser.username,
          email: staffUser.email,
        },
        reset: {
          requestedUserId: resetUser.id,
          userId: resetUserId,
          username: resetUser.username,
          email: resetUser.email,
        },
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
