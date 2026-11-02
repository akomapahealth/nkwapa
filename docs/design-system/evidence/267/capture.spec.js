const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { storageStateFor } = require(process.env.WEB_DIR + '/playwright/roles');

// #267 navigation utilities evidence. Seeded E2E identities and synthetic data only.
const OUT = process.env.EVIDENCE_DIR;
const findings = [];
test.describe.configure({ mode: 'serial' });
test.afterAll(() =>
  fs.writeFileSync(path.join(OUT, 'axe.json'), JSON.stringify(findings, null, 2)),
);

/** Overlays animate in, and axe blends a half-faded menu with the page behind it. */
async function settle(page) {
  await page.waitForTimeout(300);
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        // Spinners and skeleton pulses loop forever; wait only for animations that end.
        .filter((a) => a.effect?.getComputedTiming().endTime !== Infinity)
        .map((a) => a.finished.catch(() => {})),
    ),
  );
}

async function capture(page, name) {
  await settle(page);
  fs.mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: path.join(OUT, `${name}.jpg`), type: 'jpeg', quality: 70 });
  const r = await new AxeBuilder({ page }).analyze();
  findings.push({
    name,
    violations: r.violations
      .filter((v) => ['serious', 'critical'].includes(v.impact))
      .map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.map((n) => n.target.join(' ')) })),
  });
}

// director holds both items; volunteer holds message delivery only; doctor shows the same as volunteer.
for (const role of ['director', 'volunteer']) {
  test.describe(role, () => {
    test.use({ storageState: storageStateFor(role), reducedMotion: 'reduce' });
    test(`${role} shell utilities`, async ({ page }) => {
      test.setTimeout(300_000);
      for (const theme of ['light', 'dark']) {
        await page.addInitScript(
          ([k, v]) => {
            localStorage.setItem(k, v);
            localStorage.setItem('nkwapa.sidebar.collapsed', 'false');
          },
          ['nkwapa-theme', theme],
        );

        // Desktop: the rail, the header and the open account menu.
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto('/dashboard');
        await expect(page.locator('main').first()).toBeVisible({ timeout: 30_000 });
        await page.waitForLoadState('networkidle').catch(() => {});
        await capture(page, `${role}--1440--${theme}`);
        await page.getByRole('button', { name: 'User menu' }).click();
        await capture(page, `${role}-account-menu--1440--${theme}`);
        await page.keyboard.press('Escape');

        // Phone: the header and the menu sheet scrolled to its end.
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto('/dashboard');
        await expect(page.locator('main').first()).toBeVisible({ timeout: 30_000 });
        await page.waitForLoadState('networkidle').catch(() => {});
        await capture(page, `${role}--390--${theme}`);
        await page.getByRole('button', { name: 'Open navigation' }).click();
        const sheet = page.getByRole('dialog');
        await expect(sheet.locator('nav[aria-label="Workspace"] a').first()).toBeVisible();
        await sheet.locator('.overflow-y-auto').evaluate((el) => el.scrollTo(0, el.scrollHeight));
        await capture(page, `${role}-sheet--390--${theme}`);
        await page.keyboard.press('Escape');
      }
    });
  });
}
