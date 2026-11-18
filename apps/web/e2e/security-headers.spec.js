const { test, expect } = require('@playwright/test');

const { storageStateFor } = require('../playwright/roles');

/*
  SEC-04 phase 1: every response carries the security headers, the CSP ships report-only, and
  the pages a clinic uses most report no violation. A violation here means the allowlist in
  security-headers.js is missing an origin the app really uses; fix that before enforcing.
*/

const SWEEP = ['/', '/dashboard', '/patients', '/appointments', '/queues', '/notifications'];

function expectSecurityHeaders(headers) {
  expect(headers['content-security-policy-report-only']).toContain("default-src 'self'");
  expect(headers['content-security-policy-report-only']).toContain('report-uri /api/csp-report');
  expect(headers['content-security-policy']).toBeUndefined();
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['x-frame-options']).toBe('SAMEORIGIN');
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(headers['permissions-policy']).toContain('camera=()');
}

/** Records every CSP violation the page raises, across navigations. */
async function collectViolations(page) {
  const violations = [];
  await page.exposeFunction('__recordCspViolation', (violation) => violations.push(violation));
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) => {
      window.__recordCspViolation({
        page: location.pathname,
        directive: event.effectiveDirective,
        blocked: event.blockedURI,
        source: event.sourceFile,
        line: event.lineNumber,
      });
    });
  });
  return violations;
}

test('the sign-in page and offline.html carry the headers', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();

  for (const path of ['/login', '/offline.html']) {
    const response = await page.goto(path);
    expect(response?.ok(), path).toBe(true);
    expectSecurityHeaders(response.headers());
  }

  await context.close();
});

test.describe('signed in', () => {
  test.use({ storageState: storageStateFor('staff') });

  test('workspace pages carry the headers and report no CSP violation', async ({ page }) => {
    const violations = await collectViolations(page);

    for (const path of SWEEP) {
      const response = await page.goto(path);
      expectSecurityHeaders(response.headers());
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
      // Silent SSO, the socket and analytics start after the first paint.
      await page.waitForLoadState('networkidle');
    }

    expect(violations).toEqual([]);

    // Proves the collector works, so the empty list above means something.
    await page.evaluate(() => fetch('https://csp-probe.invalid/x').catch(() => {}));
    await expect
      .poll(() =>
        violations.some((v) => v.directive === 'connect-src' && /csp-probe/.test(v.blocked)),
      )
      .toBe(true);
  });

  test('a page the worker serves from its cache keeps the headers', async ({ page, context }) => {
    await page.goto('/dashboard');
    await page.evaluate(() => navigator.serviceWorker.ready);
    if (!(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)))) {
      await page.reload();
    }
    await expect
      .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
      .toBe(true);
    // The load the worker claimed never passed through it; this one is cached.
    await page.reload();

    await context.setOffline(true);
    const response = await page.goto('/dashboard');

    expect(response.fromServiceWorker()).toBe(true);
    expectSecurityHeaders(response.headers());
  });
});
