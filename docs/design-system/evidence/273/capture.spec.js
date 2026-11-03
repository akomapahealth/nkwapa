const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { storageStateFor } = require(process.env.WEB_DIR + '/playwright/roles');
const { apiRequestAs } = require(process.env.WEB_DIR + '/playwright/api-client');

// #273: appointments. Seeded E2E identities and synthetic local records only.
const OUT = process.env.EVIDENCE_DIR;

async function schedule(page, ...buttons) {
  await page.goto('/appointments');
  await expect(page.getByRole('heading', { name: 'Appointments', exact: true })).toBeVisible({
    timeout: 30_000,
  });
  for (const name of buttons) await page.getByRole('button', { name, exact: true }).click();
  await expect(page.getByText(/appointments? for /i)).toBeAttached({ timeout: 30_000 });
}

async function openDialog(page, trigger, menuitem) {
  await page.getByRole('button', { name: trigger, exact: true }).first().click();
  if (menuitem) await page.getByRole('menuitem', { name: menuitem }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
}

const PLAN = {
  doctor: [
    ['appointments-day', (page) => schedule(page)],
    ['appointments-week', (page) => schedule(page, 'Week')],
    // The previous week holds the seeded completed, cancelled and no-show visits.
    ['appointments-past-week', (page) => schedule(page, 'Week', 'Previous range')],
    [
      'reschedule-form',
      async (page) => {
        await schedule(page);
        await openDialog(page, 'Open appointment actions', 'Reschedule');
      },
    ],
    [
      'confirm-request-form',
      async (page) => {
        await schedule(page);
        await openDialog(page, 'Confirm request');
      },
    ],
  ],
  volunteer: [['appointments-volunteer-week', (page) => schedule(page, 'Week')]],
};

const findings = [];
test.describe.configure({ mode: 'serial' });
test.afterAll(() =>
  fs.writeFileSync(path.join(OUT, 'axe.json'), JSON.stringify(findings, null, 2)),
);

// One pending patient request so the triage panel and confirm form have something to show.
test.beforeAll(async () => {
  const who = await apiRequestAs('patient', 'get', '/auth/whoami');
  const clinicId = who.json().activeClinicId;
  const list = await apiRequestAs(
    'doctor',
    'get',
    `/clinics/${clinicId}/appointment-requests?status=REQUESTED`,
    { clinicId },
  );
  const items = list.json();
  if ((Array.isArray(items) ? items : (items.items ?? [])).length) return;
  const day = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
  const created = await apiRequestAs('patient', 'post', '/patients/me/appointment-requests', {
    clinicId,
    data: {
      preferredStartDate: day,
      preferredEndDate: day,
      reason: 'Evidence: blood pressure review',
    },
  });
  expect(created.ok(), created.text()).toBeTruthy();
});

/** Wait for entrance animations; spinners and skeleton pulses loop forever, so skip those. */
async function settle(page) {
  await page.waitForTimeout(300);
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().endTime !== Infinity)
        .map((a) => a.finished.catch(() => {})),
    ),
  );
}

for (const [role, views] of Object.entries(PLAN)) {
  test.describe(role, () => {
    test.use({ storageState: storageStateFor(role), reducedMotion: 'reduce' });
    test(role, async ({ page }) => {
      test.setTimeout(600_000);
      fs.mkdirSync(OUT, { recursive: true });
      for (const theme of ['light', 'dark']) {
        await page.addInitScript((theme) => {
          localStorage.setItem('nkwapa-theme', theme);
          localStorage.setItem('nkwapa.sidebar.collapsed', String(window.innerWidth <= 1280));
        }, theme);
        for (const width of [1440, 390]) {
          await page.setViewportSize({ width, height: width > 390 ? 900 : 844 });
          for (const [name, open] of views) {
            await open(page);
            await page.waitForLoadState('networkidle').catch(() => {});
            await settle(page);
            const dialog = name.endsWith('-form');
            await page.screenshot({
              path: path.join(OUT, `${name}--${width}--${theme}.jpg`),
              fullPage: width > 390 && !dialog,
              type: 'jpeg',
              quality: 70,
            });
            const r = await new AxeBuilder({ page }).analyze();
            findings.push({
              name,
              width,
              theme,
              height: await page.evaluate(() => document.documentElement.scrollHeight),
              violations: r.violations
                .filter((v) => ['serious', 'critical'].includes(v.impact))
                .map((v) => ({
                  id: v.id,
                  impact: v.impact,
                  nodes: v.nodes.map((n) => n.target.join(' ')),
                })),
            });
          }
        }
      }
    });
  });
}
