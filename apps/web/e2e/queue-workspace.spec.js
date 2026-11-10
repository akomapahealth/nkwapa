const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { storageStateFor } = require('../playwright/roles');

test.use({ storageState: storageStateFor('staff') });
const widths = [320, 390, 599, 600, 744, 767, 768, 1024, 1199, 1200, 1440];
const endpoint = /\/clinics\/[^/]+\/encounters\?/;
const countsEndpoint = /\/clinics\/[^/]+\/encounters\/counts$/;
const notesEndpoint = /\/clinics\/[^/]+\/clinical-notes\/pending-cosign$/;
function visit(index, extras = {}) {
  return {
    id: `synthetic-queue-${index}`,
    status: 'IN_REVIEW',
    createdAt: '2026-11-10T09:30:00Z',
    patient: {
      patientCode: `SYN-Q-${String(index).padStart(3, '0')}`,
      firstName: 'Synthetic',
      lastName: `Queue ${String(index).padStart(3, '0')}`,
    },
    hypertensionAssessment: { classification: 'STAGE1' },
    ...extras,
  };
}
async function mock(page, options = {}) {
  await page.route(endpoint, (route) => {
    const url = new URL(route.request().url());
    const skip = Number(url.searchParams.get('skip') || 0);
    return route.fulfill({
      json: options.rows ?? Array.from({ length: skip ? 5 : 50 }, (_, i) => visit(skip + i)),
    });
  });
  await page.route(countsEndpoint, (route) =>
    route.fulfill({
      status: options.countsFailed ? 503 : 200,
      json: options.countsFailed
        ? { message: 'Synthetic totals unavailable' }
        : { drafts: 55, review: 55, finalize: 55, ...options.counts },
    }),
  );
  await page.route(notesEndpoint, (route) => route.fulfill({ json: options.notes ?? [] }));
}
async function open(page, tab = 'review') {
  await page.goto(`/queues${tab ? `?tab=${tab}` : ''}`);
  await expect(page.getByRole('heading', { name: 'Queues', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Refresh queues', exact: true })).toBeEnabled();
  await expect(page.getByTestId('sync-status')).toHaveAttribute('data-state', 'synced');
  await page.evaluate(() => document.fonts.ready);
  await page.mouse.move(0, 0);
}
function panel(page) {
  return page.getByRole('tabpanel');
}
async function activePresentation(page) {
  const tableFits = await panel(page)
    .locator('.data-table-adaptive')
    .evaluate(
      (el) =>
        el.clientWidth >= 60 * parseFloat(getComputedStyle(document.documentElement).fontSize),
    );
  return panel(page).locator(tableFits ? '.data-table-grid' : '.data-table-cards');
}
async function noOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
}
async function shot(page, name) {
  if (!process.env.QUEUE_EVIDENCE_DIR) return;
  fs.mkdirSync(process.env.QUEUE_EVIDENCE_DIR, { recursive: true });
  await page.screenshot({
    path: path.join(process.env.QUEUE_EVIDENCE_DIR, `${name}.png`),
    fullPage: true,
  });
}
for (const theme of ['light', 'dark']) {
  test(`queue boundaries retain lane, sort, page and final actions: ${theme}`, async ({ page }) => {
    test.setTimeout(120000);
    await page.addInitScript((theme) => localStorage.setItem('nkwapa-theme', theme), theme);
    await mock(page);
    await open(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await (await activePresentation(page)).getByRole('button', { name: /^Patient/ }).click();
    await panel(page).getByRole('button', { name: 'Next page', exact: true }).click();
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      const active = await activePresentation(page);
      await expect(active).toBeVisible();
      await expect(active.getByText('Synthetic Queue 010', { exact: true })).toBeVisible();
      const action = active.getByRole('link', {
        name: 'Open encounter for Synthetic Queue 010',
        exact: true,
      });
      await expect(action).toHaveAttribute('href', '/encounters/synthetic-queue-10');
      await action.scrollIntoViewIfNeeded();
      await expect(action).toBeInViewport({ ratio: 1 });
      const more = panel(page).getByRole('button', { name: 'Show more', exact: true });
      await more.scrollIntoViewIfNeeded();
      await expect(more).toBeInViewport({ ratio: 1 });
      await expect(page.getByRole('tab', { name: /^Needs Review 55$/ })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      await noOverflow(page);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await page.evaluate(() => window.scrollTo(0, 0));
      await shot(page, `queues-${width}-${theme}`);
    }
    await page.getByRole('tab', { name: /^Drafts/ }).click();
    await expect(page.getByRole('tab', { name: /^Drafts/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page).toHaveURL(/tab=drafts/);
    await page.getByRole('tab', { name: /^Needs Review/ }).click();
    await expect(page.getByRole('tab', { name: /^Needs Review/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page).toHaveURL(/tab=review/);
    await expect(
      (await activePresentation(page)).getByText('Synthetic Queue 010', { exact: true }),
    ).toBeVisible();
    await expect(page).toHaveURL(/tab=review/);
    await page.goBack();
    await expect(page.getByRole('tab', { name: /^Drafts/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await page.goForward();
    await expect(page.getByRole('tab', { name: /^Needs Review/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '200%';
    });
    await noOverflow(page);
    const action = (await activePresentation(page)).getByRole('link', {
      name: 'Open encounter for Synthetic Queue 010',
      exact: true,
    });
    await action.scrollIntoViewIfNeeded();
    await expect(action).toBeInViewport({ ratio: 1 });
    await action.focus();
    await expect(action).toBeFocused();
    await shot(page, `queues-enlarged-${theme}`);
    await action.press('Enter');
    await expect(page).toHaveURL(/\/encounters\/synthetic-queue-10$/);
  });
  test(`confirmed empty lane uses licensed static fallback and dashboard action: ${theme}`, async ({
    page,
    context,
  }) => {
    await page.addInitScript((theme) => localStorage.setItem('nkwapa-theme', theme), theme);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await mock(page, { rows: [], counts: { drafts: 0, review: 0, finalize: 0 } });
    await open(page);
    await expect(
      panel(page).getByRole('heading', { name: 'All caught up', exact: true }),
    ).toBeVisible();
    await expect(panel(page).getByTestId('illustration-checklist')).toHaveAttribute(
      'data-playing',
      'false',
    );
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await shot(page, `queues-empty-${width}-${theme}`);
    }
    await context.setOffline(true);
    await expect(page.getByRole('heading', { name: 'All caught up', exact: true })).toHaveCount(0);
    await expect(panel(page).getByTestId('stale-data-notice')).toBeVisible();
    await context.setOffline(false);
    await expect(
      panel(page).getByRole('heading', { name: 'All caught up', exact: true }),
    ).toBeVisible();
    await panel(page).getByRole('link', { name: 'Back to dashboard', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  });
}
test('unknown totals still page; duplicate rows do not corrupt the next server offset', async ({
  page,
}) => {
  await mock(page, { countsFailed: true });
  const offsets = [];
  await page.route(endpoint, (route) => {
    const skip = Number(new URL(route.request().url()).searchParams.get('skip') || 0);
    offsets.push(skip);
    const rows =
      skip === 0
        ? Array.from({ length: 50 }, (_, i) => visit(i))
        : skip === 50
          ? Array.from({ length: 50 }, (_, i) => visit(49 + i))
          : [visit(100)];
    return route.fulfill({ json: rows });
  });
  await open(page);
  await expect(page.getByRole('tab', { name: /^Needs Review 50 loaded$/ })).toBeVisible();
  await expect(
    panel(page).getByText('Queue totals are unavailable. Counts show loaded visits only.'),
  ).toBeVisible();
  await panel(page).getByRole('button', { name: 'Show more', exact: true }).click();
  await expect(page.getByRole('tab', { name: /^Needs Review 99 loaded$/ })).toBeVisible();
  await panel(page).getByRole('button', { name: 'Show more', exact: true }).click();
  await expect(page.getByRole('tab', { name: /^Needs Review 100 loaded$/ })).toBeVisible();
  expect(offsets).toContain(100);
  await expect(panel(page).getByRole('button', { name: 'Show more', exact: true })).toHaveCount(0);
});
test('load-more refusal retains rows, offers retry and prevents duplicate submissions', async ({
  page,
}) => {
  await mock(page);
  let calls = 0;
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  await page.route(endpoint, async (route) => {
    const skip = Number(new URL(route.request().url()).searchParams.get('skip') || 0);
    if (!skip) return route.fulfill({ json: Array.from({ length: 50 }, (_, i) => visit(i)) });
    calls++;
    if (calls === 1) {
      await gate;
      return route.fulfill({ status: 403, json: { message: 'Synthetic paging refusal' } });
    }
    return route.fulfill({ json: [visit(50)] });
  });
  await open(page);
  const more = panel(page).getByRole('button', { name: 'Show more', exact: true });
  await more.click();
  await expect(panel(page).getByRole('button', { name: 'Loading…', exact: true })).toBeDisabled();
  expect(calls).toBe(1);
  release();
  await expect(panel(page).getByText('Synthetic paging refusal', { exact: false })).toBeVisible();
  await expect(
    (await activePresentation(page)).getByText('Synthetic Queue 000', { exact: true }),
  ).toBeVisible();
  await panel(page).getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByRole('tab', { name: /^Needs Review 55$/ })).toBeVisible();
  expect(calls).toBe(2);
});
test('a refused refresh preserves the loaded visits; cold refusal never claims emptiness', async ({
  page,
}) => {
  await mock(page, { rows: [visit(0)] });
  await open(page);
  await page.route(endpoint, (route) =>
    route.fulfill({ status: 403, json: { message: 'Synthetic queue refusal' } }),
  );
  await page.getByRole('button', { name: 'Refresh queues', exact: true }).click();
  await expect(panel(page).getByText('Synthetic queue refusal', { exact: false })).toBeVisible();
  await expect(
    (await activePresentation(page)).getByText('Synthetic Queue 000', { exact: true }),
  ).toBeVisible();
  await expect(
    panel(page).getByRole('heading', { name: 'All caught up', exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await expect(panel(page).getByText('Synthetic queue refusal', { exact: false })).toBeVisible();
  await expect(page.getByRole('tab', { name: /Needs Review.*Count unavailable/ })).toBeVisible();
  await expect(
    panel(page).getByRole('heading', { name: 'All caught up', exact: true }),
  ).toHaveCount(0);
});
test('interrupted initial read has no zero counts or empty illustration', async ({
  page,
  context,
}) => {
  await mock(page);
  let started = false;
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  await page.route(endpoint, async (route) => {
    started = true;
    await gate;
    await route.abort('internetdisconnected');
  });
  try {
    await page.goto('/queues?tab=review');
    await expect.poll(() => started).toBe(true);
    await context.setOffline(true);
    release();
    await expect(
      panel(page).getByText(/You are offline. Reconnect to load the queues/),
    ).toBeVisible();
    await expect(panel(page).getByTestId('illustration-checklist')).toHaveCount(0);
    await expect(page.getByRole('tab', { name: /Needs Review.*Count unavailable/ })).toBeVisible();
  } finally {
    release();
    await context.setOffline(false);
    await page.unrouteAll({ behavior: 'ignoreErrors' });
  }
});
test('nonzero totals and missing rows are inconsistent, never caught up', async ({ page }) => {
  await mock(page, { rows: [] });
  await open(page);
  await expect(
    panel(page).getByText('The total and loaded visits differ. Refresh queues to check this lane.'),
  ).toBeVisible();
  await expect(panel(page).getByTestId('illustration-checklist')).toHaveCount(0);
});
test('cosign totals count actual notes and links retain their encounter identity', async ({
  page,
}) => {
  const notes = [0, 1].map((i) => ({
    id: `synthetic-note-${i}`,
    encounterId: 'synthetic-same-encounter',
    submittedAt: '2026-11-10T09:30:00Z',
    author: { displayName: `Synthetic Author ${i}` },
    patient: { patientCode: 'SYN-NOTE', firstName: 'Synthetic', lastName: 'Cosign' },
  }));
  await mock(page, { notes });
  await open(page, '');
  await expect(page.getByRole('tab', { name: /^Pending HAP Cosign 2$/ })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(
    (await activePresentation(page)).getByText('HAP note by Synthetic Author 0', { exact: true }),
  ).toBeVisible();
  await expect(
    (await activePresentation(page)).getByText('HAP note by Synthetic Author 1', { exact: true }),
  ).toBeVisible();
  const links = (await activePresentation(page)).getByRole('link', {
    name: 'Open encounter for Synthetic Cosign',
    exact: true,
  });
  await expect(links).toHaveCount(2);
  for (const link of await links.all())
    await expect(link).toHaveAttribute('href', '/encounters/synthetic-same-encounter');
  await page.getByRole('tab', { name: /^Pending HAP Cosign/ }).focus();
  await page.keyboard.press('Home');
  await expect(page.getByRole('tab', { name: /^Drafts/ })).toBeFocused();
  await expect(page.getByRole('tab', { name: /^Drafts/ })).toHaveAttribute('aria-selected', 'true');
});
test('classification labels and glucose thresholds remain identical in cards and tables', async ({
  page,
}) => {
  await mock(page, {
    rows: [
      visit(0, {
        hypertensionAssessment: { classification: 'STAGE1' },
        diabetesScreening: { glucoseMgDl: 125, glucoseType: 'FASTING' },
      }),
      visit(1, {
        hypertensionAssessment: { classification: 'STAGE2' },
        diabetesScreening: { glucoseMgDl: 126, glucoseType: 'FASTING' },
      }),
      visit(2, {
        hypertensionAssessment: { classification: 'CRISIS' },
        diabetesScreening: { glucoseMgDl: 199, glucoseType: 'RANDOM' },
      }),
      visit(3, {
        hypertensionAssessment: { classification: 'NORMAL' },
        diabetesScreening: { glucoseMgDl: 200, glucoseType: 'RANDOM' },
      }),
    ],
  });
  await open(page);
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const active = await activePresentation(page);
    for (const label of ['Stage 1', 'Stage 2', 'Crisis', 'Normal'])
      await expect(active.getByText(label, { exact: true })).toBeVisible();
    await expect(active.getByText('High glucose', { exact: true })).toHaveCount(2);
  }
});
for (const [role, defaultLane, allowed] of [
  [
    'doctor',
    'Pending HAP Cosign',
    ['Drafts', 'Needs Review', 'Ready to Finalize', 'Pending HAP Cosign'],
  ],
  ['volunteer', 'Drafts', ['Drafts']],
  ['manager', 'Drafts', ['Drafts']],
]) {
  test.describe(`queue role ${role}`, () => {
    test.use({ storageState: storageStateFor(role) });
    test('keeps the existing default and rejects inaccessible deep links', async ({ page }) => {
      await mock(page);
      await open(page, '');
      await expect(page.getByRole('tab', { name: new RegExp(`^${defaultLane}`) })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      const labels = await page.getByRole('tab').allTextContents();
      expect(labels.map((s) => s.replace(/\s*\d+( loaded)?$/, '').trim())).toEqual(allowed);
      await open(page, role === 'doctor' ? 'finalize' : 'cosign');
      await expect(
        page.getByRole('tab', {
          name: new RegExp(`^${role === 'doctor' ? 'Ready to Finalize' : defaultLane}`),
        }),
      ).toHaveAttribute('aria-selected', 'true');
      await open(page, 'invalid');
      await expect(page.getByRole('tab', { name: new RegExp(`^${defaultLane}`) })).toHaveAttribute(
        'aria-selected',
        'true',
      );
    });
  });
}

test('an empty illustration plays once on first viewing and survives refreshes and lane switches', async ({
  page,
}) => {
  await mock(page, { rows: [], counts: { drafts: 0, review: 0, finalize: 0 } });
  await open(page);
  const illustration = panel(page).getByTestId('illustration-checklist');
  await expect(illustration.locator('[data-frame="98"]')).toHaveCount(1, { timeout: 15000 });
  await illustration.evaluate((el) => {
    el.dataset.retainedPlayer = 'yes';
  });
  await page.getByRole('button', { name: 'Refresh queues', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Refresh queues', exact: true })).toBeEnabled();
  await expect(illustration).toHaveAttribute('data-retained-player', 'yes');
  await expect(illustration.locator('[data-frame="98"]')).toHaveCount(1);
  await page.getByRole('tab', { name: /^Drafts/ }).click();
  await page.getByRole('tab', { name: /^Needs Review/ }).click();
  await expect(illustration).toHaveAttribute('data-retained-player', 'yes');
  await expect(illustration.locator('[data-frame="98"]')).toHaveCount(1);
});
test('long identity fields and the final encounter action fit enlarged phone text', async ({
  page,
}) => {
  await mock(page, {
    rows: [
      visit(0, {
        patient: {
          patientCode: 'SYNTHETIC' + '0000000000'.repeat(6),
          firstName: 'Synthetic',
          lastName: 'LongIdentity'.repeat(8),
        },
      }),
    ],
  });
  await open(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  await noOverflow(page);
  const action = (await activePresentation(page)).getByRole('link', { name: /^Open encounter/ });
  await action.scrollIntoViewIfNeeded();
  await expect(action).toBeInViewport({ ratio: 1 });
  await shot(page, 'queues-long-enlarged');
});
test('wildcard permission without a doctor clinic role does not expose cosign', async ({
  page,
}) => {
  await mock(page);
  let requests = 0;
  await page.route(notesEndpoint, (route) => {
    requests++;
    return route.fulfill({ json: [] });
  });
  await page.route('**/auth/whoami', async (route) => {
    const response = await route.fetch();
    const bootstrap = await response.json();
    bootstrap.memberships = bootstrap.memberships.map((membership) => ({
      ...membership,
      roles: membership.roles.filter((role) => role !== 'DOCTOR'),
    }));
    await route.fulfill({ response, json: bootstrap });
  });
  await open(page, 'cosign');
  await expect(page.getByRole('tab', { name: /^Pending HAP Cosign/ })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: /^Ready to Finalize/ })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  expect(requests).toBe(0);
});

for (const theme of ['light', 'dark']) {
  test(`queue cards and table share page state through desktop collapse: ${theme}`, async ({
    page,
  }) => {
    await page.addInitScript((theme) => {
      localStorage.setItem('nkwapa-theme', theme);
      localStorage.setItem('nkwapa.sidebar.collapsed', 'false');
    }, theme);
    await mock(page);
    await page.setViewportSize({ width: 1200, height: 900 });
    await open(page);
    await expect(panel(page).locator('.data-table-cards')).toBeVisible();
    await panel(page).getByRole('button', { name: 'Next page', exact: true }).click();
    for (const collapsed of [true, false]) {
      await page
        .getByRole('button', {
          name: collapsed ? 'Collapse navigation' : 'Expand navigation',
          exact: true,
        })
        .click();
      const active = panel(page).locator(collapsed ? '.data-table-grid' : '.data-table-cards');
      await expect(active).toBeVisible();
      await expect(active.getByText('Synthetic Queue 010', { exact: true })).toBeVisible();
      await expect(panel(page).getByText('11–20 of 50', { exact: true })).toBeVisible();
      await expect(page).toHaveURL(/tab=review/);
      await noOverflow(page);
      await shot(page, `queues-collapse-${collapsed}-${theme}`);
    }
  });
}
