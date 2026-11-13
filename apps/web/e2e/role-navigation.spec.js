const { test, expect } = require('@playwright/test');
const { storageStateFor } = require('../playwright/roles');
const { EXPECTED, PHONE_PRIMARY, UTILITIES } = require('../playwright/navigation-contract.cjs');
const { requireAuditDatabase, prepare } = require('../playwright/device-matrix.cjs');

// Expectations are independent of production filtering. These tests follow the rendered links,
// rather than making a direct visit and calling that proof of navigation discoverability.
test.beforeAll(() => requireAuditDatabase());
const PORTAL = [
  ['Overview', '/portal'],
  ['My health', '/portal/health'],
  ['Appointments', '/portal/appointments'],
];
const DENIED = {
  doctor: '/research',
  volunteer: '/audit',
  manager: '/research',
  director: '/admin/duplicates/cross-clinic',
  patient: '/audit',
};

async function loaded(page) {
  await expect(page.locator('main h1')).toHaveCount(1);
  await expect(page.locator('main [aria-busy="true"]')).toHaveCount(0);
  await expect(page.locator('main')).not.toContainText(
    /You don't have access|Checking your access|couldn't confirm your access|Something went wrong/,
  );
}

for (const role of [...Object.keys(EXPECTED), 'patient']) {
  test.describe(role, () => {
    test.use({ storageState: storageStateFor(role) });
    for (const phone of [false, true]) {
      test(`R8.3 ${phone ? 'phone dark' : 'desktop light'} follows authorized destinations and deep links`, async ({
        page,
      }, info) => {
        test.setTimeout(240_000);
        await prepare(page, phone ? 'dark' : 'light');
        await page.setViewportSize({ width: phone ? 390 : 1440, height: 900 });
        const home = role === 'patient' ? '/portal' : '/dashboard';
        const identity = page.waitForResponse(
          (r) => new URL(r.url()).pathname === '/auth/whoami' && r.ok(),
        );
        await page.goto(home);
        await identity;
        // The rendered clinic-scoped href is authoritative; no fixture id is copied into a URL.
        await loaded(page);
        const visited = [];
        for (const [label, pattern] of role === 'patient' ? PORTAL : EXPECTED[role]) {
          await test.step(`follow ${label}`, async () => {
            let scope;
            const inMore = phone && role !== 'patient' && !PHONE_PRIMARY[role].includes(label);
            if (inMore) {
              await page.getByRole('button', { name: 'More', exact: true }).click();
              scope = page.getByRole('dialog', { name: 'More', exact: true });
            } else {
              scope =
                role === 'patient'
                  ? page.getByRole('navigation', { name: 'Patient portal', exact: true })
                  : phone
                    ? page.getByRole('navigation', { name: 'Primary', exact: true })
                    : page.locator('#workspace-sidebar');
            }
            const link = scope.getByRole('link', { name: label, exact: true });
            const href = await link.getAttribute('href');
            expect(href.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/, ':clinicId')).toBe(pattern);
            await link.click();
            await expect.poll(() => new URL(page.url()).pathname).toBe(href);
            if (inMore) await expect(scope).toBeHidden();
            await loaded(page);
            if (role === 'patient' || !inMore) {
              await expect(scope.getByRole('link', { name: label, exact: true })).toHaveAttribute(
                'aria-current',
                phone ? 'page' : role === 'patient' ? 'location' : 'page',
              );
            } else {
              await expect(page.getByRole('button', { name: 'More', exact: true })).toHaveAttribute(
                'aria-current',
                'true',
              );
            }
            visited.push({ label, href });
          });
        }
        for (const [label, href] of [
          ...(UTILITIES[role]?.profile || []),
          ['Your settings', '/settings'],
          ['Manage profile', '/account'],
        ]) {
          if (phone) {
            await page.getByRole('button', { name: 'More', exact: true }).click();
            await page
              .getByRole('dialog', { name: 'More', exact: true })
              .getByRole('link', { name: label, exact: true })
              .click();
            await expect(page.getByRole('dialog')).toHaveCount(0);
          } else {
            await page.getByRole('button', { name: 'User menu', exact: true }).click();
            await page.getByRole('menuitem', { name: label, exact: true }).click();
          }
          await expect(page).toHaveURL(new RegExp(`${href}$`));
          await loaded(page);
          visited.push({ label, href });
        }
        // Hard loads retain authorization; history must return to the account route.
        await page.goto(role === 'patient' ? '/portal/self-reports/new' : '/patients/new');
        if (role === 'director') {
          await expect(
            page.getByRole('heading', { name: "You don't have access to this page" }),
          ).toBeVisible();
        } else {
          await loaded(page);
          if (role !== 'patient') await expect(page).toHaveURL(/\/patients\/new$/);
        }
        await page.goBack();
        await expect(page).toHaveURL(/\/account$/);
        await loaded(page);
        if (DENIED[role]) {
          await page.goto(DENIED[role]);
          await expect(page.getByRole('heading', { name: /You don't have access/ })).toBeVisible();
          await page
            .getByRole('link', {
              name: role === 'patient' ? 'Go to your portal' : 'Go to dashboard',
              exact: true,
            })
            .click();
          await expect(page).toHaveURL(new RegExp(`${home}$`));
          await loaded(page);
        }
        await page.screenshot({
          path: info.outputPath(`${role}-${phone ? 'phone-dark' : 'desktop-light'}.png`),
          animations: 'disabled',
        });
        await info.attach('navigation', {
          body: JSON.stringify({ role, phone, visited, bootstrapObserved: true }, null, 2),
          contentType: 'application/json',
        });
      });
    }
  });
}
