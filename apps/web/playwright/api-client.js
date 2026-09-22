const { request: playwrightRequest } = require('@playwright/test');

const { ROLES } = require('./roles');

/**
 * Authenticated API requests as a named role, for assertions the UI cannot reach.
 *
 * The suite could not make one before. Specs sign in through Keycloak in `auth.setup.js` and save
 * a storage state, but the access token lives inside the Keycloak adapter in page memory, so no
 * spec could read it. The consequence shows up as a recurring gap: wherever the UI hides a control
 * the user is not allowed to use, "the API refuses this too" is either missing or approximated by
 * asserting the control is absent. Absence of a button is not refusal of a route.
 *
 * The token comes from Keycloak's direct access grant rather than from the page, using the same
 * credentials `ROLES` already holds. `nkwapa-web` is a public client with `directAccessGrantsEnabled`
 * (see the realm export), so this needs no client secret and, more importantly, no test-only hook
 * in application code: nothing ships to production to make the suite work.
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000';
const KEYCLOAK_URL = process.env.NEXT_PUBLIC_KEYCLOAK_URL || 'http://localhost:8080';
const REALM = process.env.NEXT_PUBLIC_KEYCLOAK_REALM || 'nkwapa';
const CLIENT_ID = process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID || 'nkwapa-web';

/**
 * Cached per worker process, not per test.
 *
 * A Keycloak token lasts minutes and a worker runs many specs, so re-authenticating per request
 * would add a round trip to every assertion for nothing. Re-fetched a little before expiry rather
 * than on a 401, so a long spec cannot fail on a token that aged out mid-test.
 */
const tokens = new Map();
const EXPIRY_MARGIN_MS = 30_000;

async function accessTokenFor(role) {
  const credentials = ROLES[role];
  if (!credentials) {
    throw new Error(`Unknown e2e role: ${role}. Known roles: ${Object.keys(ROLES).join(', ')}`);
  }

  const cached = tokens.get(role);
  if (cached && cached.expiresAt - EXPIRY_MARGIN_MS > Date.now()) return cached.token;

  const context = await playwrightRequest.newContext();
  try {
    const response = await context.post(
      `${KEYCLOAK_URL}/realms/${REALM}/protocol/openid-connect/token`,
      {
        form: {
          grant_type: 'password',
          client_id: CLIENT_ID,
          username: credentials.username,
          password: credentials.password,
          scope: 'openid',
        },
      },
    );

    if (!response.ok()) {
      // Name the role and the realm: the usual cause is a reseed that left this identity behind,
      // and "400 Bad Request" alone sends the reader to the wrong place.
      throw new Error(
        `Could not obtain a token for the "${role}" identity (${credentials.username}) from ` +
          `${KEYCLOAK_URL}/realms/${REALM}: ${response.status()} ${await response.text()}`,
      );
    }

    const body = await response.json();
    tokens.set(role, {
      token: body.access_token,
      expiresAt: Date.now() + body.expires_in * 1000,
    });
    return body.access_token;
  } finally {
    await context.dispose();
  }
}

/**
 * An APIRequestContext that talks to the API as `role`.
 *
 * Pass `clinicId` for any clinic-scoped route. The app sends `X-Clinic-Id` on every request and
 * the API's tenant guard reads it, so a request without it is refused for reasons that have
 * nothing to do with what the spec is trying to prove.
 *
 * The caller owns the returned context and must `dispose()` it -- and must read any response body
 * before doing so, because disposal invalidates every response the context produced. Use
 * `apiRequestAs` for a one-shot request that handles both for you.
 */
async function apiContextAs(role, { clinicId } = {}) {
  const token = await accessTokenFor(role);
  return playwrightRequest.newContext({
    baseURL: API_BASE_URL,
    extraHTTPHeaders: {
      Authorization: `Bearer ${token}`,
      ...(clinicId ? { 'X-Clinic-Id': clinicId } : {}),
    },
  });
}

/**
 * One authenticated request as a role, in one line.
 *
 *   const res = await apiRequestAs('doctor', 'post', `/clinics/${clinicId}/...`, {
 *     clinicId,
 *     data: { ... },
 *   });
 *   expect(res.status()).toBe(400);
 *   expect(await res.text()).toContain('finalized encounter');
 *
 * Returns a snapshot, not Playwright's APIResponse. Disposing an APIRequestContext invalidates
 * every response it produced -- a later `text()` throws "Response has been disposed" -- so the
 * body is read here, while the context is still alive, and handed back already in hand. The
 * shape mirrors the part of APIResponse specs actually use, so call sites read the same.
 *
 * Text, not bytes: every route this suite asserts against answers JSON or an error envelope.
 */
async function apiRequestAs(role, method, path, { clinicId, ...options } = {}) {
  const context = await apiContextAs(role, { clinicId });
  try {
    const verb = method.toLowerCase();
    if (typeof context[verb] !== 'function') {
      throw new Error(`Unsupported HTTP method for apiRequestAs: ${method}`);
    }

    const response = await context[verb](path, options);
    const status = response.status();
    const ok = response.ok();
    const headers = response.headers();
    const body = await response.text();

    return {
      status: () => status,
      ok: () => ok,
      headers: () => headers,
      text: () => body,
      json: () => JSON.parse(body),
    };
  } finally {
    await context.dispose();
  }
}

/** Forget cached tokens. For a spec that deliberately invalidates an identity mid-run. */
function resetApiTokenCache() {
  tokens.clear();
}

module.exports = { apiContextAs, apiRequestAs, accessTokenFor, resetApiTokenCache };
