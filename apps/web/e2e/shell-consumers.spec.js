const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { storageStateFor } = require('../playwright/roles');
const KEY = 'nkwapa.sidebar.collapsed';
test.use({ storageState: storageStateFor('staff') });
async function shot(page, name) {
  if (!process.env.DESIGN_SHELL_DIR) return;
  fs.mkdirSync(process.env.DESIGN_SHELL_DIR, { recursive: true });
  await page.screenshot({
    path: path.join(process.env.DESIGN_SHELL_DIR, `${name}.png`),
    fullPage: false,
  });
}
for (const theme of ['light', 'dark']) {
  test(`patient registry preserves server state through shell collapse: ${theme}`, async ({
    page,
  }) => {
    await page.addInitScript(
      ({ theme, key }) => {
        localStorage.setItem('nkwapa-theme', theme);
        localStorage.setItem(key, 'false');
      },
      { theme, key: KEY },
    );
    let requests = 0;
    await page.route(/\/clinics\/[^/]+\/patients\?/, (route) => {
      requests++;
      return route.fulfill({
        json: {
          items: [
            {
              id: 'synthetic-shell-patient',
              patientCode: 'SYN-SHELL-21',
              firstName: 'Synthetic',
              lastName: 'Shell',
              phoneE164: null,
              nationalIdLast4: '0021',
            },
          ],
          total: 30,
          page: 2,
          pageSize: 10,
        },
      });
    });
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.goto('/patients?q=Synthetic&page=2&sortBy=name&sortDir=desc');
    const cards = page.getByRole('region', { name: 'Patients in this clinic', exact: true });
    const table = page.getByRole('table', { name: 'Patients in this clinic', exact: true });
    await expect(cards).toBeVisible();
    const beforeURL = page.url();
    const beforeRequests = requests;
    const href = await cards
      .getByRole('link', { name: 'Synthetic Shell', exact: true })
      .getAttribute('href');
    for (const collapsed of [true, false, true]) {
      await page
        .getByRole('button', {
          name: collapsed ? 'Collapse navigation' : 'Expand navigation',
          exact: true,
        })
        .click();
      await expect(collapsed ? table : cards).toBeVisible();
      expect(page.url()).toBe(beforeURL);
      expect(requests).toBe(beforeRequests);
      const active = collapsed ? table : cards;
      await expect(
        active.getByRole('link', {
          name: collapsed ? 'View' : 'Synthetic Shell',
          exact: true,
        }),
      ).toHaveAttribute('href', href);
      await shot(page, `patient-${collapsed ? 'table' : 'cards'}-${theme}`);
    }
    await page.setViewportSize({ width: 744, height: 800 });
    await expect(cards).toBeVisible();
    expect(page.url()).toBe(beforeURL);
    expect(requests).toBe(beforeRequests);
    await expect(page.getByRole('button', { name: 'Previous page', exact: true })).toBeEnabled();
    await shot(page, `patient-rail-${theme}`);
  });

  test(`invitation filters and sort survive shell resize: ${theme}`, async ({ page }) => {
    await page.addInitScript(
      ({ theme, key }) => {
        localStorage.setItem('nkwapa-theme', theme);
        localStorage.setItem(key, 'false');
      },
      { theme, key: KEY },
    );
    let requests = 0;
    await page.route(/\/clinics\/[^/]+\/staff-invites$/, (route) => {
      requests++;
      return route.fulfill({
        json: {
          invitableRoles: ['VOLUNTEER'],
          items: Array.from({ length: 12 }, (_, i) => ({
            id: `synthetic-shell-${i}`,
            clinicId: 'synthetic-clinic',
            email: `shell${i}@nkwapa.local`,
            inviteeName: `Synthetic Shell ${String(i).padStart(2, '0')}`,
            role: 'VOLUNTEER',
            status: 'PENDING',
            createdAt: '2026-11-01T12:00:00Z',
            expiresAt: '2027-11-01T12:00:00Z',
            acceptedAt: null,
            cancelledAt: null,
            invitedBy: null,
            acceptedBy: null,
            cancelledBy: null,
            identity: null,
            emailDelivery: null,
          })),
        },
      });
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/admin/users');
    const search = page.getByRole('searchbox', { name: 'Search invitations by name or email' });
    await search.fill('Shell');
    const table = page.getByRole('table', { name: 'Staff invitations', exact: true });
    await expect(table).toBeVisible();
    await table.getByRole('button', { name: 'Invitee', exact: true }).click();
    const invitations = page.locator('.data-table-adaptive').filter({ has: search });
    await invitations.getByRole('button', { name: 'Next page', exact: true }).click();
    await expect(table.locator('tbody tr').first()).toContainText('Synthetic Shell 10');
    const before = requests;
    const cards = page.getByRole('region', { name: 'Staff invitations', exact: true });
    for (const width of [744, 1200, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(search).toHaveValue('Shell');
      expect(requests).toBe(before);
      await expect(width < 1440 ? cards : table).toBeVisible();
      await expect(invitations.getByText('11–12 of 12', { exact: true })).toBeVisible();
      if (width < 1440) {
        await expect(cards.getByRole('button', { name: /^Invitee\s*, ascending$/ })).toBeVisible();
        await expect(cards.getByRole('article').first()).toHaveAttribute(
          'aria-label',
          'Synthetic Shell 10',
        );
        await expect(
          cards.getByRole('button', {
            name: 'Cancel invitation to shell10@nkwapa.local',
            exact: true,
          }),
        ).toBeVisible();
      } else {
        await expect(table.getByRole('columnheader', { name: 'Invitee' })).toHaveAttribute(
          'aria-sort',
          'ascending',
        );
        await expect(table.locator('tbody tr').first()).toContainText('Synthetic Shell 10');
      }
      await shot(page, `invitations-${width}-${theme}`);
    }
    // A final shell action must be reachable above the fixed chat launcher.
    // Synthetic sentinel isolates shell clearance from route-specific bottom padding.
    await page.locator('main > div').evaluate((el) => {
      const button = document.createElement('button');
      button.textContent = 'Shell bottom action';
      button.style.cssText = 'display:block;margin-left:auto;width:180px;height:44px';
      button.onclick = () => (button.dataset.clicked = 'true');
      el.append(button);
    });
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const action = page.getByRole('button', { name: 'Shell bottom action' });
    await action.click();
    await expect(action).toHaveAttribute('data-clicked', 'true');
  });
}

test('no-clinic navigation is disabled in desktop, labelled rail and phone sheet', async ({
  page,
}) => {
  await page.route('**/auth/whoami', async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    await route.fulfill({
      json: {
        ...data,
        activeClinicId: null,
        memberships: [],
        availableClinics: [],
        effectivePermissionsForActiveClinic: ['*'],
        globalRoles: ['SYSTEM_ADMIN'],
      },
    });
  });
  await page.setViewportSize({ width: 1440, height: 800 });
  await page.goto('/dashboard');
  for (const width of [1440, 744, 390]) {
    await page.setViewportSize({ width, height: 800 });
    if (width === 390) await page.getByRole('button', { name: 'More', exact: true }).click();
    const scope = width === 390 ? page.getByRole('dialog') : page.locator('#workspace-sidebar');
    await expect(scope.getByRole('button', { name: 'New Patient', exact: true })).toBeDisabled();
    await expect(scope.getByRole('link', { name: 'New Patient', exact: true })).toHaveCount(0);
  }
});

test('first shell frames use the resolved preference without a width flash', async ({
  context,
}) => {
  for (const [width, stored, expected] of [
    [1200, null, 232],
    [1200, 'false', 232],
    [1200, 'true', 64],
    [744, 'true', 76],
  ]) {
    const page = await context.newPage();
    await page.setViewportSize({ width, height: 800 });
    await page.addInitScript(
      ({ key, stored }) => {
        if (stored === null) localStorage.removeItem(key);
        else localStorage.setItem(key, stored);
        window.shellMountWidths = [];
        const observer = new MutationObserver(() => {
          const rail = document.getElementById('workspace-sidebar');
          if (!rail) return;
          observer.disconnect();
          let remaining = 8;
          const sample = () => {
            window.shellMountWidths.push(rail.getBoundingClientRect().width);
            if (--remaining > 0) requestAnimationFrame(sample);
          };
          sample();
        });
        observer.observe(document, { childList: true, subtree: true });
      },
      { key: KEY, stored },
    );
    await page.goto('/queues');
    await expect.poll(() => page.evaluate(() => window.shellMountWidths.length)).toBe(8);
    expect(await page.evaluate(() => window.shellMountWidths)).toEqual(Array(8).fill(expected));
    await page.close();
  }
});
