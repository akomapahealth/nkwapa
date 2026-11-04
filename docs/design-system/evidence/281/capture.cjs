// Run from repository root: node docs/design-system/evidence/281/capture.cjs before|after.
// The web build is served on 3100. LOCAL_BROWSER_PROXY preserves the pre-existing Keycloak
// localhost:3000 allowlist without occupying port 3000 or changing authentication settings.
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { chromium, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { apiRequestAs } = require('../../../../apps/web/playwright/api-client');
const { storageStateFor } = require('../../../../apps/web/playwright/roles');
const { WIDTHS } = require('../../../../apps/web/playwright/responsive-routes');
(async () => {
  const stage = process.argv[2];
  if (!['before', 'after'].includes(stage)) throw Error('Specify before or after');
  const out = path.join(__dirname, stage);
  fs.mkdirSync(out, { recursive: true });
  const clinic = (await apiRequestAs('staff', 'get', '/auth/whoami')).json().activeClinicId;
  const p = await apiRequestAs('staff', 'post', `/clinics/${clinic}/patients`, {
    clinicId: clinic,
    data: {
      firstName: 'E2E',
      lastName: 'Responsive Evidence',
      nationalIdType: 'OTHER',
      nationalId: `E2E-${randomUUID()}`,
    },
  });
  if (!p.ok()) throw Error('Synthetic patient fixture refused');
  const patient = p.json().id;
  const e = await apiRequestAs('staff', 'post', `/clinics/${clinic}/encounters`, {
    clinicId: clinic,
    data: { patientId: patient },
  });
  if (!e.ok()) throw Error('Synthetic encounter fixture refused');
  const browser = await chromium.launch(
    process.env.LOCAL_BROWSER_PROXY
      ? { proxy: { server: process.env.LOCAL_BROWSER_PROXY, bypass: '<-loopback>' } }
      : {},
  );
  const findings = [];
  for (const theme of ['light', 'dark'])
    for (const width of WIDTHS) {
      for (const [name, url, _heading, role] of [
        ['registration', '/patients/new', /register patient/i, 'staff'],
        [
          'patient-chart',
          `/clinics/${clinic}/patients/${patient}`,
          /E2E Responsive Evidence/,
          'staff',
        ],
        ['clinical-workspace', `/encounters/${e.json().id}`, /encounter/i, 'staff'],
        ['portal-health', '/portal/health', /my health/i, 'patient'],
      ]) {
        const context = await browser.newContext({
          storageState: storageStateFor(role),
          viewport: { width, height: 900 },
          colorScheme: theme,
          serviceWorkers: 'block',
        });
        await context.addInitScript((theme) => localStorage.setItem('nkwapa-theme', theme), theme);
        const page = await context.newPage();
        await page.goto((process.env.CAPTURE_BASE_URL || 'http://localhost:3100') + url);
        await expect(page.locator('#main-content')).toBeVisible();
        // Polling/chat can keep the network active after the view is ready. Prove the
        // actual screen loaded, then wait for its named initial loading states to leave.
        if (name === 'registration')
          await expect(page.getByLabel('First name', { exact: true })).toBeVisible();
        if (name === 'patient-chart' || name === 'clinical-workspace')
          await expect(
            page.getByRole('heading', { name: 'E2E Responsive Evidence', exact: true }),
          ).toBeVisible();
        if (name === 'portal-health')
          await expect(page.getByRole('heading', { name: /blood pressure trend/i })).toBeVisible();
        await expect(
          page.locator(
            '#main-content [role="status"][aria-busy="true"], #main-content .animate-pulse',
          ),
        ).toHaveCount(0, { timeout: 30_000 });
        await page.screenshot({
          path: path.join(out, `${name}--${width}--${theme}.jpg`),
          type: 'jpeg',
          quality: 65,
        });
        const axe = await new AxeBuilder({ page }).analyze();
        findings.push({
          name,
          url: url
            .replace(patient, '[synthetic-patient]')
            .replace(e.json().id, '[synthetic-encounter]')
            .replace(clinic, '[clinic]'),
          width,
          theme,
          violations: axe.violations,
          incomplete: axe.incomplete,
        });
        await context.close();
      }
    }
  fs.writeFileSync(path.join(out, 'routes.axe.json'), JSON.stringify(findings, null, 2));
  await browser.close();
  console.log(`${stage}: ${findings.length} synthetic route captures`);
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
