const { test, expect } = require('@playwright/test');
const { ROLES } = require('../playwright/roles');

/*
  Issue #172: signing in boots the app once.

  The app used to start twice on every sign-in. Keycloak returned to /login, which ran the whole
  start-up (Keycloak init, token exchange, whoami, the first sync) and then reloaded the page into
  the workspace, which ran all of it again. In Ghana each of those round trips crosses the internet,
  so the duplicate chain cost seconds.

  This records every request from pressing "Continue to secure sign in" to a settled dashboard,
  prints the waterfall for a person reading the run, and fails if anything in the start-up chain
  happens twice.
*/

test.use({ storageState: { cookies: [], origins: [] } });

test('signing in starts the app once', async ({ page, baseURL }) => {
  test.setTimeout(90_000);
  const appOrigin = new URL(baseURL).origin;
  const requests = [];
  const started = Date.now();
  page.on('request', (request) => {
    requests.push({
      at: Date.now() - started,
      method: request.method(),
      url: request.url(),
      type: request.resourceType(),
      mainFrameNavigation: request.isNavigationRequest() && request.frame() === page.mainFrame(),
      prefetch: Boolean(
        request.headers()['next-router-prefetch'] ||
        request.headers()['next-router-segment-prefetch'],
      ),
      segment: request.headers()['next-router-segment-prefetch'] ?? null,
      postData: request.method() === 'POST' ? (request.postData() ?? '') : '',
    });
  });

  const { username, password } = ROLES.staff;
  await page.goto('/login?next=%2Fdashboard');
  await page.getByRole('button', { name: /continue to secure sign in/i }).click();
  await page.waitForURL(/realms\/nkwapa/, { timeout: 20_000 });
  await page.locator('input[name="username"]').fill(username);
  await page.locator('input[name="password"]').fill(password);
  const submittedAt = Date.now() - started;
  await page.locator('#kc-login, button[type="submit"]').click();

  await page.waitForURL((url) => url.pathname.startsWith('/dashboard'), { timeout: 60_000 });
  await expect(page.locator('#main-content')).toBeVisible({ timeout: 60_000 });
  const usableAt = Date.now() - started;
  // Let the start-up finish, so a late duplicate is counted too.
  await page.waitForLoadState('networkidle');

  const afterSubmit = requests.filter((request) => request.at >= submittedAt);
  const path = (request) => new URL(request.url).pathname;
  const count = (predicate) => afterSubmit.filter(predicate).length;

  // Page loads of the app itself; the silent-SSO iframe is a document too, but not a page load.
  const appDocuments = afterSubmit.filter(
    (request) => request.mainFrameNavigation && new URL(request.url).origin === appOrigin,
  );
  // The same route prefetched for the same segment twice is waste; a route tree and its segment
  // data are two different requests by design.
  const prefetchKeys = afterSubmit
    .filter((request) => request.prefetch)
    .map((request) => `${path(request)} ${request.segment ?? 'tree'}`);
  const duplicatePrefetches = prefetchKeys.filter(
    (key, index) => prefetchKeys.indexOf(key) !== index,
  );
  const tokenExchanges = count(
    (request) =>
      path(request).endsWith('/protocol/openid-connect/token') &&
      request.postData.includes('grant_type=authorization_code'),
  );
  const whoami = count((request) => path(request) === '/auth/whoami');
  const syncPulls = count((request) => path(request) === '/sync/pull');
  const loginIframe = count((request) => path(request).includes('/login-status-iframe.html'));
  const thirdPartyCookieChecks = count((request) => path(request).includes('/3p-cookies/'));

  console.log(
    JSON.stringify(
      {
        msFromSubmitToUsableDashboard: usableAt - submittedAt,
        appDocuments: appDocuments.map((request) => path(request)),
        tokenExchanges,
        whoami,
        syncPulls,
        loginIframe,
        thirdPartyCookieChecks,
        duplicatePrefetches,
        waterfall: afterSubmit
          .filter((request) => !['image', 'font', 'stylesheet'].includes(request.type))
          .map(
            (request) =>
              `${request.at - submittedAt}ms ${request.method} ${path(request)}${
                request.prefetch ? ` [prefetch ${request.segment ?? 'tree'}]` : ''
              }`,
          ),
      },
      null,
      2,
    ),
  );

  // One page load after Keycloak hands back: no reload into the workspace.
  expect(appDocuments).toHaveLength(1);
  expect(tokenExchanges).toBe(1);
  expect(whoami).toBe(1);
  expect(syncPulls).toBe(1);
  // Session expiry is caught by token refresh; the iframe and its cookie probe only add serial
  // round trips before the first token.
  expect(loginIframe).toBe(0);
  expect(thirdPartyCookieChecks).toBe(0);
});
