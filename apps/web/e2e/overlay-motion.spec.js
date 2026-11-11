const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { storageStateFor } = require('../playwright/roles');

test.use({ storageState: storageStateFor('staff'), reducedMotion: 'no-preference' });

// Sample the browser's real transitions, rather than inferring motion from a static shot.
async function sample(popup, milliseconds, originVariable) {
  return popup.evaluate(
    (element, { milliseconds, originVariable }) => {
      const animations = element.getAnimations();
      const transitions = animations.filter((animation) => animation.transitionProperty);
      for (const animation of animations) {
        animation.pause();
        animation.currentTime = milliseconds;
      }
      const style = getComputedStyle(element);
      const result = {
        opacity: Number(style.opacity),
        transform: style.transform,
        origin: style.transformOrigin,
        radixOrigin: style.getPropertyValue(originVariable).trim(),
        resolvedRadixOrigin: style
          .getPropertyValue(originVariable)
          .trim()
          .split(' ')
          .map((part, index) =>
            part.endsWith('%')
              ? (parseFloat(part) * parseFloat(index === 0 ? style.width : style.height)) / 100
              : parseFloat(part),
          ),
        duration: style.transitionDuration,
        properties: transitions.map((animation) => animation.transitionProperty).sort(),
        clock: style.animationName,
      };
      for (const animation of animations) animation.finish();
      return result;
    },
    { milliseconds, originVariable },
  );
}

async function checkPointerPair(page, popup, originVariable, reduced = false) {
  const enter = await sample(popup, 100, originVariable);
  expect(enter.duration).toBe('0.2s');
  expect(enter.properties).toEqual(reduced ? ['opacity'] : ['opacity', 'transform']);
  expect(enter.opacity).toBeGreaterThan(0);
  expect(enter.opacity).toBeLessThan(1);
  expect(enter.radixOrigin).not.toBe('');
  enter.origin.split(' ').forEach((part, index) => {
    expect(parseFloat(part)).toBeCloseTo(enter.resolvedRadixOrigin[index], 1);
  });
  if (reduced) expect(enter.transform).toBe('none');
  else expect(enter.transform).not.toBe('matrix(1, 0, 0, 1, 0, 0)');
  // A real outside pointer press closes without invoking a menu action.
  await page.mouse.click(1100, 800);
  const closing = page.locator('.anchored-overlay[data-state="closed"]');
  const exit = await sample(closing, 80, originVariable);
  expect(exit.duration).toBe('0.16s');
  expect(exit.opacity).toBeGreaterThan(0);
  expect(exit.opacity).toBeLessThan(1);
  expect(exit.origin).toBe(enter.origin);
  expect(exit.clock).toBe('anchored-presence');
  if (reduced) expect(exit.transform).toBe('none');
  await expect(closing).toHaveCount(0);
  return { enter, exit };
}

for (const reduced of [false, true]) {
  test(`header menu and Select grow from their triggers${reduced ? ', opacity only with reduced motion' : ''}`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/patients/new');
    const user = page.getByRole('button', { name: 'User menu' });
    await user.click();
    const menu = await checkPointerPair(
      page,
      page.getByRole('menu'),
      '--radix-dropdown-menu-content-transform-origin',
      reduced,
    );
    const sex = page.getByRole('combobox', { name: 'Sex', exact: true });
    await sex.click();
    const select = await checkPointerPair(
      page,
      page.getByRole('listbox'),
      '--radix-select-content-transform-origin',
      reduced,
    );
    await testInfo.attach('browser-motion-samples', {
      body: JSON.stringify({ menu, select }, null, 2),
      contentType: 'application/json',
    });
  });
}

test('keyboard menus and Selects respond instantly and restore focus', async ({ page }) => {
  await page.goto('/patients/new');
  for (const [trigger, role] of [
    [page.getByRole('button', { name: 'User menu' }), 'menu'],
    [page.getByRole('combobox', { name: 'Sex', exact: true }), 'listbox'],
  ]) {
    await trigger.focus();
    await page.keyboard.press('Space');
    const popup = page.getByRole(role);
    await expect(popup).toBeVisible();
    await expect(popup).toHaveCSS('transition-duration', '0s');
    await expect(popup).toHaveCSS('animation-name', 'none');
    await page.keyboard.press('Escape');
    await expect(popup).toHaveCount(0);
    await expect(trigger).toBeFocused();
  }
});

test('help popovers reverse during exit, keep targets and pass axe in dark mode', async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem('nkwapa-theme', 'dark'));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/dashboard');
  const trigger = page.getByRole('button', { name: /^Show help:/ }).first();
  const target = await trigger.evaluate((element) => {
    const style = getComputedStyle(element, '::before');
    return { width: style.width, height: style.height };
  });
  expect(target).toEqual({ width: '44px', height: '44px' });
  await trigger.click();
  const popup = page.getByRole('tooltip');
  await expect(popup).toBeVisible();
  await popup.evaluate((element) =>
    element.getAnimations().forEach((animation) => animation.finish()),
  );
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter((v) => ['serious', 'critical'].includes(v.impact))).toEqual([]);
  // Do the reversal in one browser task so test-runner latency cannot finish the exit.
  const reversed = await trigger.evaluate(async (element) => {
    const popup = document.querySelector('.anchored-overlay');
    element.click();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const animations = popup.getAnimations();
    for (const animation of animations) {
      animation.pause();
      animation.currentTime = 40;
    }
    const before = Number(getComputedStyle(popup).opacity);
    element.click();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const transition = popup
      .getAnimations()
      .find((animation) => animation.transitionProperty === 'opacity');
    const start = Number(transition?.effect.getKeyframes()[0].opacity);
    return { before, start, sameNode: popup === document.querySelector('.anchored-overlay') };
  });
  expect(reversed.sameNode).toBe(true);
  expect(reversed.before).toBeGreaterThan(0);
  expect(reversed.before).toBeLessThan(1);
  expect(reversed.start).toBeCloseTo(reversed.before, 2);
  await expect(popup).toHaveAttribute('data-state', 'open');
});

test('row action menu uses the same enter and exit origin', async ({ page }, testInfo) => {
  test.skip(
    process.env.NEXT_PUBLIC_FEATURE_STATION_WORKFLOW_ENABLED !== 'true',
    'Requires station workflow.',
  );
  const now = Date.now();
  const station = {
    id: 'synthetic-bp',
    name: 'Blood pressure',
    kind: 'BLOOD_PRESSURE',
    sortOrder: 1,
    capacity: 1,
    active: true,
    staff: [],
    inUse: 0,
  };
  const visit = {
    id: 'synthetic-visit',
    status: 'QUEUED',
    checkInId: 'synthetic-check-in',
    checkInStatus: 'IN_PROGRESS',
    checkedInAt: new Date(now).toISOString(),
    encounterId: null,
    station,
    patient: {
      id: 'synthetic-patient',
      patientCode: 'SYN-MOTION',
      firstName: 'Synthetic',
      lastName: 'Motion',
      dob: null,
    },
    queuedAt: new Date(now - 12 * 60_000).toISOString(),
    claimedAt: null,
    claimedBy: null,
    completedBy: null,
    completedAt: null,
    handoffNote: null,
    endReason: null,
    releaseCount: 0,
    previous: null,
  };
  await page.route('**/stations/board*', (route) =>
    route.fulfill({
      json: {
        date: new Date(now).toISOString().slice(0, 10),
        timezone: 'Africa/Accra',
        stations: [{ ...station, visits: [visit] }],
        onShift: [],
      },
    }),
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/today');
  await page.getByTestId('patient-station-row').getByRole('button').click();
  const result = await checkPointerPair(
    page,
    page.getByRole('menu'),
    '--radix-dropdown-menu-content-transform-origin',
  );
  await testInfo.attach('row-motion-samples', {
    body: JSON.stringify(result, null, 2),
    contentType: 'application/json',
  });
});

test('tooltips skip delay and motion while scanning neighbouring icons', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('nkwapa.sidebar.collapsed', 'true'));
  await page.goto('/dashboard');
  const links = page.locator('#workspace-sidebar nav a');
  await expect(links.first()).toBeVisible();
  await links.nth(0).hover();
  const tooltip = page.locator('.anchored-tooltip');
  await expect(tooltip).toHaveAttribute('data-state', 'delayed-open');
  await expect(tooltip).toHaveCSS('transition-duration', '0.15s');
  const nextBox = await links.nth(1).boundingBox();
  // Multiple pointer moves reproduce a scan through Radix's hover grace area.
  await page.mouse.move(nextBox.x + nextBox.width / 2, nextBox.y + nextBox.height / 2, {
    steps: 8,
  });
  const next = page.locator('.anchored-tooltip[data-state="instant-open"]');
  await expect(next).toBeVisible();
  await expect(next).toHaveCSS('transition-duration', '0s');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('tooltip')).toHaveCount(0);
});

// R7.3: dialogs left the tailwindcss-animate keyframes for the anchored transition clock. A
// keyframe exit restarts from its end state; a transition reverses from the frame it is on.
async function openCreateClinic(page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/admin/clinics');
  const trigger = page.getByRole('button', { name: 'Create clinic', exact: true }).first();
  await expect(trigger).toBeVisible({ timeout: 30_000 });
  return trigger;
}

for (const reduced of [false, true]) {
  test(`dialog scales from the centre and reverses mid-entrance${reduced ? ', fade only with reduced motion' : ''}`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
    const trigger = await openCreateClinic(page);
    // A real pointer gesture marks the input as pointer, as a click on the trigger would.
    const box = await trigger.boundingBox();
    await page.mouse.move(box.x + 4, box.y + 4);
    await expect(page.locator('html')).toHaveAttribute('data-overlay-input', 'pointer');
    // One browser task, so test-runner latency cannot finish the entrance before the close.
    const result = await trigger.evaluate(async (element) => {
      // A real mouse press focuses the button before the click; a scripted click does not.
      element.focus();
      element.click();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const dialog = document.querySelector('[role="dialog"]');
      const scrim = document.querySelector('.dialog-scrim');
      const enterProps = dialog
        .getAnimations()
        .filter((a) => a.transitionProperty)
        .map((a) => a.transitionProperty)
        .sort();
      const style = getComputedStyle(dialog);
      const enter = {
        duration: style.transitionDuration,
        scrimDuration: getComputedStyle(scrim).transitionDuration,
        scrimTransform: getComputedStyle(scrim).transform,
        origin: style.transformOrigin,
        size: [parseFloat(style.width), parseFloat(style.height)],
      };
      for (const animation of dialog.getAnimations()) {
        animation.pause();
        animation.currentTime = 60;
      }
      const before = Number(getComputedStyle(dialog).opacity);
      const transformBefore = getComputedStyle(dialog).transform;
      [...dialog.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Cancel').click();
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const exit = dialog.getAnimations().find((a) => a.transitionProperty === 'opacity');
      return {
        enterProps,
        enter,
        before,
        transformBefore,
        state: dialog.dataset.state,
        exitDuration: getComputedStyle(dialog).transitionDuration,
        exitStart: Number(exit?.effect.getKeyframes()[0].opacity),
      };
    });
    expect(result.enter.duration).toBe('0.2s');
    expect(result.enter.scrimDuration).toBe('0.15s');
    expect(result.enter.scrimTransform).toBe('none');
    // Reduced motion pins transform, so only opacity transitions.
    expect(result.enterProps).toEqual(reduced ? ['opacity'] : ['opacity', 'transform']);
    // Modals have no trigger to grow from: the origin is the dialog's own centre.
    result.enter.origin.split(' ').forEach((part, index) => {
      expect(parseFloat(part)).toBeCloseTo(result.enter.size[index] / 2, 0);
    });
    if (reduced) expect(result.transformBefore).toBe('none');
    else expect(result.transformBefore).not.toBe('none');
    expect(result.before).toBeGreaterThan(0);
    expect(result.before).toBeLessThan(1);
    expect(result.state).toBe('closed');
    expect(result.exitDuration).toBe('0.16s');
    // The exit starts where the entrance was, not from fully open.
    expect(result.exitStart).toBeCloseTo(result.before, 2);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });
}

test('keyboard opens and closes a dialog instantly', async ({ page }) => {
  const trigger = await openCreateClinic(page);
  await trigger.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveCSS('transition-duration', '0s');
  await expect(dialog).toHaveCSS('opacity', '1');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});
