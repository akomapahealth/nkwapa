const { test, expect } = require('@playwright/test');
const { storageStateFor } = require('../playwright/roles');

/**
 * The welcome tour (#189, #345), replayed from the user menu.
 *
 * The deterministic identities skipped it during setup, which is itself the "Skip persists"
 * check: had the skip not reached the server, every spec after setup would open behind a modal.
 * What is left to prove is the tour's own behaviour, reached the way anyone would reach it again:
 * a spotlight on the real interface from `md` up, the centred dialog on a phone, and steps that
 * differ by role.
 */

const DESKTOP = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844 };

async function openTour(page, path = '/dashboard') {
  await page.goto(path);
  await expect(page.locator('#main-content')).toBeVisible({ timeout: 30_000 });
  // Nothing opens on its own: this identity has already been through the tour.
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.getByRole('button', { name: 'User menu' }).click();
  await page.getByRole('menuitem', { name: 'Take the tour' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Welcome to Nkwapa' })).toBeVisible();
  return dialog;
}

/**
 * Once it stops moving, the ring is the anchor's rectangle padded by 6px (clipped to the viewport),
 * within a pixel. Both are read in the page, in the same frame.
 */
async function expectRingOn(page, anchor) {
  await expect
    .poll(
      () =>
        page.evaluate((id) => {
          const ring = document.querySelector('[data-welcome-tour-ring]');
          const element = [...document.querySelectorAll(`[data-tour="${CSS.escape(id)}"]`)].find(
            (node) => node.getBoundingClientRect().width > 0,
          );
          if (!ring || !element) return 'missing';
          const rect = element.getBoundingClientRect();
          const x = Math.max(rect.left - 6, 4);
          const y = Math.max(rect.top - 6, 4);
          const want = [
            x,
            y,
            Math.min(rect.right + 6, window.innerWidth - 4) - x,
            Math.min(rect.bottom + 6, window.innerHeight - 4) - y,
          ];
          const box = ring.getBoundingClientRect();
          const got = [box.left, box.top, box.width, box.height];
          return got.every((value, i) => Math.abs(value - want[i]) <= 1)
            ? 'on'
            : JSON.stringify({ got, want });
        }, anchor),
      { timeout: 5_000 },
    )
    .toBe('on');
}

/** Walk every step to the end, checking each ring. Returns the anchors ringed and the count. */
async function walkTour(page, dialog) {
  const counter = await dialog.getByText(/^Step 1 of \d+$/).textContent();
  const total = Number(counter.match(/of (\d+)/)[1]);
  const spotlit = [];
  for (let step = 1; step <= total; step += 1) {
    await expect(dialog.getByText(`Step ${step} of ${total}`, { exact: true })).toBeVisible();
    const anchor = await dialog.getAttribute('data-spotlight');
    if (anchor && anchor !== 'none') {
      spotlit.push(anchor);
      await expectRingOn(page, anchor);
    }
    await dialog.getByRole('button', { name: step === total ? 'Get started' : 'Next' }).click();
  }
  await expect(page.getByRole('dialog')).toHaveCount(0);
  return { spotlit, total };
}

test.describe('on a laptop, a spotlight', () => {
  test.use({ storageState: storageStateFor('volunteer'), viewport: DESKTOP });

  test('walks forward and back, then finishes', async ({ page }) => {
    const dialog = await openTour(page);
    await expect(dialog.getByRole('img', { name: /^Step 1 of \d+$/ })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Back' })).toHaveCount(0);
    // The count is written out, not left to the bar.
    await expect(dialog.getByText(/^Step 1 of \d+$/)).toBeVisible();
    // The welcome is centred, rings nothing, and names the role.
    await expect(dialog).toHaveAttribute('data-spotlight', 'none');
    await expect(dialog.getByText(/signed in as Volunteer/)).toBeVisible();

    await dialog.getByRole('button', { name: 'Next' }).click();
    await expect(dialog.getByRole('heading', { name: 'Your clinic day' })).toBeVisible();
    await expect(dialog).toHaveAttribute('data-spotlight', 'home-work');
    await expect(dialog).not.toHaveAttribute('data-side', 'none');
    // Each step says what to try, and is announced with its place.
    // Once the previous step has faded out, one line to try.
    await expect(dialog.getByText('Try this:')).toHaveCount(1);
    await expect(dialog.locator('[aria-live="polite"]')).toHaveText(
      /^Step 2 of \d+: Your clinic day$/,
    );
    await dialog.getByRole('button', { name: 'Back' }).click();
    await expect(dialog.getByRole('heading', { name: 'Welcome to Nkwapa' })).toBeVisible();

    // Arrow keys move through it; the last step trades Skip and Next for "Get started".
    for (let i = 0; i < 10; i += 1) {
      if (await dialog.getByRole('button', { name: 'Get started' }).isVisible()) break;
      await page.keyboard.press('ArrowRight');
    }
    await expect(dialog.getByRole('heading', { name: 'You are ready' })).toBeVisible();
    await expect(dialog).toHaveAttribute('data-spotlight', 'none');
    await expect(dialog.getByRole('button', { name: 'Skip' })).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Get started' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('rings the real element on every anchored step', async ({ page }) => {
    const dialog = await openTour(page);
    const { spotlit, total } = await walkTour(page, dialog);
    expect(total).toBeGreaterThanOrEqual(5);
    expect(total).toBeLessThanOrEqual(7);
    expect(spotlit).toContain('home-work');
    expect(spotlit.some((anchor) => anchor.startsWith('nav:'))).toBe(true);
  });

  test('the ring follows its element when the window is resized mid-tour', async ({ page }) => {
    const dialog = await openTour(page);
    // A sidebar step: open sidebar at 1280px, a narrow rail at 1000px.
    for (let i = 0; i < 6; i += 1) {
      await dialog.getByRole('button', { name: 'Next' }).click();
      if ((await dialog.getAttribute('data-spotlight'))?.startsWith('nav:')) break;
    }
    const anchor = await dialog.getAttribute('data-spotlight');
    expect(anchor).toMatch(/^nav:/);
    await expectRingOn(page, anchor);
    const before = await page.locator(`[data-tour="${anchor}"]`).first().boundingBox();

    await page.setViewportSize({ width: 1000, height: 700 });
    await expect
      .poll(async () => (await page.locator(`[data-tour="${anchor}"]`).first().boundingBox()).width)
      .not.toBe(before.width);
    await expectRingOn(page, anchor);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('Escape leaves the tour and it stays gone after a reload', async ({ page }) => {
    await openTour(page);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('[data-welcome-tour-ring]')).toHaveCount(0);

    await page.reload();
    await expect(page.locator('#main-content')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('opened from the keyboard, the tour appears at once on the dialog clock', async ({
    page,
  }) => {
    await page.goto('/dashboard');
    await expect(page.locator('#main-content')).toBeVisible({ timeout: 30_000 });
    const menu = page.getByRole('button', { name: 'User menu' });
    await menu.focus();
    await page.keyboard.press('Enter');
    await page.getByRole('menuitem', { name: 'Take the tour' }).focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Welcome to Nkwapa' })).toBeVisible();
    // R7.3: the tour shares the house dialog clock, so a keyboard open does not animate.
    await expect(dialog).toHaveClass(/anchored-overlay/);
    await expect(dialog).toHaveCSS('transition-duration', '0s');
    await expect(dialog).toHaveCSS('opacity', '1');
    // Focus starts in the card.
    await expect(dialog.locator(':focus')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});

test.describe('on a phone, the dialog', () => {
  test.use({ storageState: storageStateFor('volunteer'), viewport: PHONE });

  test('keeps the centred dialog with the role copy, and no spotlight', async ({ page }) => {
    const dialog = await openTour(page);
    await expect(dialog.getByText(/signed in as Volunteer/)).toBeVisible();
    await expect(page.locator('[data-welcome-tour-ring]')).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Next' }).click();
    await expect(dialog.getByRole('heading', { name: 'Your clinic day' })).toBeVisible();
    await expect(page.locator('[data-welcome-tour-ring]')).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Skip' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});

// Each role's own walk, from its own home page: every ringed step lands on its element.
const ROLE_HOMES = [
  { role: 'doctor', path: '/dashboard', name: 'Doctor', home: 'Needs you now' },
  { role: 'manager', path: '/dashboard', name: 'Manager', home: 'Needs attention' },
  { role: 'director', path: '/dashboard', name: 'Director', home: 'Needs attention' },
  { role: 'patient', path: '/portal', name: null, home: 'Your health summary' },
];

for (const { role, path, name, home } of ROLE_HOMES) {
  test.describe(`the ${role}'s tour`, () => {
    test.use({ storageState: storageStateFor(role), viewport: DESKTOP });

    test('is their own, and rings the real element on every anchored step', async ({ page }) => {
      const dialog = await openTour(page, path);
      if (name) await expect(dialog.getByText(`signed in as ${name}`)).toBeVisible();
      else await expect(dialog.getByText(/signed in as/)).toHaveCount(0);

      await dialog.getByRole('button', { name: 'Next' }).click();
      await expect(dialog.getByRole('heading', { name: home })).toBeVisible();
      await expect(dialog).toHaveAttribute('data-spotlight', 'home-work');
      await dialog.getByRole('button', { name: 'Back' }).click();

      const { spotlit, total } = await walkTour(page, dialog);
      expect(total).toBeGreaterThanOrEqual(5);
      expect(total).toBeLessThanOrEqual(7);
      expect(spotlit.length).toBeGreaterThanOrEqual(2);
    });
  });
}

test.describe("the system admin's tour", () => {
  test.use({ storageState: storageStateFor('staff'), viewport: DESKTOP });

  test('walks clinics and users, ringing each', async ({ page }) => {
    const dialog = await openTour(page);
    await expect(dialog.getByText(/signed in as System admin/)).toBeVisible();
    const { spotlit, total } = await walkTour(page, dialog);
    expect(total).toBeLessThanOrEqual(7);
    expect(spotlit).toEqual(expect.arrayContaining(['nav:/admin/clinics', 'nav:/admin/users']));
  });
});
