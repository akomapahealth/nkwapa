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

/**
 * Single-role identities.
 *
 * The staff user holds SYSTEM_ADMIN plus every clinic role at once, which is convenient for
 * walking the whole product and useless for proving that a role sees only what it should. These
 * hold exactly one seat each, so the browser can show what a doctor, a volunteer, a manager and a
 * director actually get -- including what they are refused.
 */
const doctorUser = {
  id: process.env.E2E_DOCTOR_SUB || '00000000-0000-4000-8000-000000000044',
  username: process.env.E2E_DOCTOR_USERNAME || 'e2e.doctor',
  password: process.env.E2E_DOCTOR_PASSWORD || 'NkwapaDoctor!23',
  email: process.env.E2E_DOCTOR_EMAIL || 'e2e.doctor@nkwapa.local',
  displayName: process.env.E2E_DOCTOR_NAME || 'E2E Doctor',
};

const volunteerUser = {
  id: process.env.E2E_VOLUNTEER_SUB || '00000000-0000-4000-8000-000000000045',
  username: process.env.E2E_VOLUNTEER_USERNAME || 'e2e.volunteer',
  password: process.env.E2E_VOLUNTEER_PASSWORD || 'NkwapaVolunteer!23',
  email: process.env.E2E_VOLUNTEER_EMAIL || 'e2e.volunteer@nkwapa.local',
  displayName: process.env.E2E_VOLUNTEER_NAME || 'E2E Volunteer',
};

const managerUser = {
  id: process.env.E2E_MANAGER_SUB || '00000000-0000-4000-8000-000000000048',
  username: process.env.E2E_MANAGER_USERNAME || 'e2e.manager',
  password: process.env.E2E_MANAGER_PASSWORD || 'NkwapaManager!23',
  email: process.env.E2E_MANAGER_EMAIL || 'e2e.manager@nkwapa.local',
  displayName: process.env.E2E_MANAGER_NAME || 'E2E Manager',
};

const directorUser = {
  id: process.env.E2E_DIRECTOR_SUB || '00000000-0000-4000-8000-000000000049',
  username: process.env.E2E_DIRECTOR_USERNAME || 'e2e.director',
  password: process.env.E2E_DIRECTOR_PASSWORD || 'NkwapaDirector!23',
  email: process.env.E2E_DIRECTOR_EMAIL || 'e2e.director@nkwapa.local',
  displayName: process.env.E2E_DIRECTOR_NAME || 'E2E Director',
};

/**
 * The patient-portal identity.
 *
 * The Playwright suite had no patient, so every spec ran as staff and the portal -- roughly 2,900
 * lines migrated in #86 -- had no automated coverage at all. Its own routes were the least
 * verified part of the product precisely because nobody could sign in as the person who uses them.
 */
const patientUser = {
  id: process.env.E2E_PATIENT_SUB || '00000000-0000-4000-8000-000000000046',
  username: process.env.E2E_PATIENT_USERNAME || 'e2e.patient',
  password: process.env.E2E_PATIENT_PASSWORD || 'NkwapaPatient!23',
  email: process.env.E2E_PATIENT_EMAIL || 'e2e.patient@nkwapa.local',
  displayName: process.env.E2E_PATIENT_NAME || 'E2E Patient',
};

/**
 * A patient who has been invited and has not claimed yet.
 *
 * Distinct from `patientUser`, which the seed links to a record through `Patient.portalUserId`.
 * That link is exactly what makes it useless here: an account with a claimed record is redirected
 * away from /claim-record, so the page could not be reached by any identity the suite had. This
 * one holds no link and no roles, which is the state `whoami` answers with PATIENT_CLAIM_REQUIRED.
 */
const claimantUser = {
  id: process.env.E2E_CLAIMANT_SUB || '00000000-0000-4000-8000-000000000047',
  username: process.env.E2E_CLAIMANT_USERNAME || 'e2e.claimant',
  password: process.env.E2E_CLAIMANT_PASSWORD || 'NkwapaClaimant!23',
  email: process.env.E2E_CLAIMANT_EMAIL || 'e2e.claimant@nkwapa.local',
  displayName: process.env.E2E_CLAIMANT_NAME || 'E2E Claimant',
};

/**
 * Every identity the suite signs in as, keyed by the name the rest of the tooling uses.
 *
 * A table rather than five parallel sequences of upsert / env / output / summary lines, which is
 * what this was: adding an identity meant remembering four places, and forgetting one of them
 * failed somewhere other than where the mistake was.
 */
const identities = {
  staff: staffUser,
  reset: resetUser,
  doctor: doctorUser,
  volunteer: volunteerUser,
  manager: managerUser,
  director: directorUser,
  patient: patientUser,
  claimant: claimantUser,
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

/*
  The e2e harness signs in with the password grant. nkwapa-web refuses it (the grant skips the
  browser flow, so its second factor), so the harness gets its own client, created here and only
  against a local Keycloak: staging and production never have it. It copies nkwapa-web's mappers
  and scopes, so its tokens carry the same claims, aud nkwapa-api included.
*/
const E2E_CLIENT_ID = 'nkwapa-e2e';

async function ensureE2eClient(accessToken) {
  const host = new URL(keycloakBaseUrl).hostname;
  if (!['localhost', '127.0.0.1', 'keycloak'].includes(host)) {
    console.warn(`Not creating ${E2E_CLIENT_ID} on ${host}: it exists only on a local Keycloak.`);
    return;
  }
  const clientsUrl = `${keycloakBaseUrl}/admin/realms/${realm}/clients`;
  const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
  const find = async (clientId) => {
    const response = await fetch(`${clientsUrl}?clientId=${encodeURIComponent(clientId)}`, {
      headers,
    });
    await assertOk(response, `Keycloak client lookup (${clientId})`);
    return (await response.json())[0] ?? null;
  };

  const web = await find('nkwapa-web');
  if (!web) throw new Error(`nkwapa-web is missing from realm ${realm}`);

  // Recreated every run, so a change to nkwapa-web's mappers reaches it.
  const existing = await find(E2E_CLIENT_ID);
  if (existing) {
    const response = await fetch(`${clientsUrl}/${existing.id}`, { method: 'DELETE', headers });
    await assertOk(response, `Keycloak client delete (${E2E_CLIENT_ID})`);
  }
  const response = await fetch(clientsUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      clientId: E2E_CLIENT_ID,
      name: 'E2E password grant (local and CI only)',
      enabled: true,
      publicClient: true,
      directAccessGrantsEnabled: true,
      standardFlowEnabled: false,
      implicitFlowEnabled: false,
      serviceAccountsEnabled: false,
      fullScopeAllowed: web.fullScopeAllowed,
      defaultClientScopes: web.defaultClientScopes,
      optionalClientScopes: web.optionalClientScopes,
      protocolMappers: (web.protocolMappers ?? []).map((mapper) => {
        const copy = { ...mapper };
        delete copy.id;
        return copy;
      }),
    }),
  });
  await assertOk(response, `Keycloak client creation (${E2E_CLIENT_ID})`);
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
  const summary = { realm, keycloakBaseUrl };
  await ensureE2eClient(accessToken);

  for (const [role, user] of Object.entries(identities)) {
    const userId = await upsertUser(accessToken, user);
    await appendGithubEnv(`E2E_${role.toUpperCase()}_SUB`, userId);
    await appendGithubOutput(`${role}-user-id`, userId);
    summary[role] = {
      requestedUserId: user.id,
      userId,
      username: user.username,
      email: user.email,
    };
  }

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
