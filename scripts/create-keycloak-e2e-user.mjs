import 'dotenv/config';

const keycloakBaseUrl = (
  process.env.KEYCLOAK_BASE_URL ||
  process.env.NEXT_PUBLIC_KEYCLOAK_URL ||
  'http://localhost:8080'
).replace(/\/$/, '');
const realm = process.env.KEYCLOAK_REALM || process.env.NEXT_PUBLIC_KEYCLOAK_REALM || 'nkwapa';
const adminUsername = process.env.KEYCLOAK_ADMIN || 'admin';
const adminPassword = process.env.KEYCLOAK_ADMIN_PASSWORD || 'admin';

const e2eUser = {
  id: process.env.E2E_STAFF_SUB || '00000000-0000-4000-8000-000000000042',
  username: process.env.E2E_STAFF_USERNAME || 'e2e.staff',
  password: process.env.E2E_STAFF_PASSWORD || 'NkwapaE2E!23',
  email: process.env.E2E_STAFF_EMAIL || 'e2e.staff@nkwapa.local',
  displayName: process.env.E2E_STAFF_NAME || 'E2E Staff',
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
  throw new Error(
    `${context} failed (${response.status} ${response.statusText}): ${JSON.stringify(body)}`,
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

async function upsertUser(accessToken) {
  const existingById = await getUserById(accessToken, e2eUser.id);
  const existingByUsername = existingById
    ? null
    : await findUserByUsername(accessToken, e2eUser.username);
  const existingByEmail =
    existingById || existingByUsername ? null : await findUserByEmail(accessToken, e2eUser.email);
  const targetId = existingById?.id ?? existingByUsername?.id ?? existingByEmail?.id ?? e2eUser.id;
  const { firstName, lastName } = splitName(e2eUser.displayName);
  const payload = {
    id: targetId,
    username: e2eUser.username,
    enabled: true,
    emailVerified: true,
    email: e2eUser.email,
    firstName,
    lastName,
  };

  if (existingById) {
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
    (await findUserByUsername(accessToken, e2eUser.username)) ??
    (await findUserByEmail(accessToken, e2eUser.email));
  if (!persistedUser?.id) {
    throw new Error(
      `Keycloak created "${e2eUser.username}" but it could not be looked up afterwards.`,
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
        value: e2eUser.password,
        temporary: false,
      }),
    },
  );
  await assertOk(passwordResponse, 'Keycloak password reset');

  return persistedUser.id;
}

async function main() {
  const accessToken = await getAdminAccessToken();
  const userId = await upsertUser(accessToken);

  console.log(
    JSON.stringify(
      {
        realm,
        keycloakBaseUrl,
        userId,
        username: e2eUser.username,
        email: e2eUser.email,
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
