const { test, expect } = require('@playwright/test');

/*
  The Keycloak login theme, which is the first screen anyone sees and the only one every E2E
  identity passes through.

  It is styled from its own stylesheet, in its own repository directory, served by a different
  process on a different origin, and nothing in the web app's build can see it. That is exactly
  how it came to run a parallel fourteen-variable token system that matched nothing in the app,
  and to load two font CDNs on the one page a user cannot skip. These tests are the only thing
  that will notice if it drifts again.
*/

// Signed out on purpose: this is the sign-in screen.
test.use({ storageState: { cookies: [], origins: [] } });

const FONT_CDNS =
  /fonts\.googleapis\.com|fonts\.gstatic\.com|fonts\.cdnfonts\.com|use\.typekit|fonts\.bunny\.net/;

/** The widths the design system commits to, plus 640 -- what 1280 becomes at 200% zoom. */
const BREAKPOINTS = [
  { name: 'phone', width: 375, height: 812 },
  { name: '200% zoom', width: 640, height: 512 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'small laptop', width: 1024, height: 768 },
  { name: 'desktop', width: 1440, height: 900 },
];

/** Walk the app's own entry point rather than hand-building a Keycloak auth URL. */
async function gotoKeycloakLogin(page) {
  await page.goto('/login?next=%2Fdashboard');
  await page
    .getByRole('button', { name: /continue to secure sign in|try secure sign in again/i })
    .click();
  await page.waitForURL(/realms\/nkwapa/, { timeout: 20_000 });
  await expect(page.locator('input[name="username"]')).toBeVisible({ timeout: 20_000 });
}

test('the login screen loads no third-party fonts', async ({ page }) => {
  /*
    #83's sharpest requirement. Two serialized @import calls to fonts.googleapis.com and
    fonts.cdnfonts.com sat at the top of the stylesheet, so on clinic wifi first paint waited on
    two cross-origin round trips before a user could see the username field.

    The listener goes on after arrival and the page is reloaded, so only the Keycloak origin's
    own subresources are counted. Watching from the start instead catches the *app's* /login
    page, which does still pull Google Fonts and cdnfonts -- that is the separate app-side issue
    recorded in MASTER.md section 6, and it is not what this test is about.
  */
  await gotoKeycloakLogin(page);

  const external = [];
  page.on('request', (request) => {
    if (FONT_CDNS.test(request.url())) external.push(request.url());
  });

  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.locator('input[name="username"]')).toBeVisible();

  expect(external, `third-party font requests: ${external.join(', ')}`).toEqual([]);
});

test('login typography is the application typeface, not the landing page one', async ({ page }) => {
  // Poppins and Circular Std are the marketing faces. A user saw those at login and the
  // application's faces one screen later.
  await gotoKeycloakLogin(page);

  const body = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
  expect(body).toContain('IBM Plex Sans');
  expect(body).not.toMatch(/Poppins|Circular Std/);

  const heading = await page
    .locator('#kc-page-title')
    .evaluate((el) => getComputedStyle(el).fontFamily);
  expect(heading).toContain('Source Serif 4');
});

test('the primary action is a flat brand fill at the approved radius', async ({ page }) => {
  await gotoKeycloakLogin(page);

  const button = page.locator('#kc-login');
  const style = await button.evaluate((el) => {
    const computed = getComputedStyle(el);
    return {
      background: computed.backgroundColor,
      image: computed.backgroundImage,
      radius: computed.borderRadius,
    };
  });

  // hsl(188 100% 27%) -- MASTER.md's --primary, exactly.
  expect(style.background).toBe('rgb(0, 119, 138)');
  // MASTER.md section 9: primary is a fill. It was a two-stop linear-gradient.
  expect(style.image).toBe('none');
  // MASTER.md section 5 caps radius at 14px; this button was 18px.
  expect(Number.parseInt(style.radius, 10)).toBeLessThanOrEqual(14);
});

test('the password toggle still swaps the field and shows one icon at a time', async ({ page }) => {
  /*
    password-toggle.js depends on the data-password-toggle-target attribute, the
    --open/--off class pair, and the `.nkwapa-icon-eye[hidden]` rule. Drop that last rule while
    restyling and both eyes render at once, which no build step would catch.
  */
  await gotoKeycloakLogin(page);

  const field = page.locator('#password');
  const toggle = page.locator('.nkwapa-password-toggle');

  await expect(field).toHaveAttribute('type', 'password');
  await expect(page.locator('.nkwapa-icon-eye:visible')).toHaveCount(1);

  await toggle.click();

  await expect(field).toHaveAttribute('type', 'text');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.nkwapa-icon-eye:visible')).toHaveCount(1);

  // The target is 44px square, the minimum in MASTER.md section 8. It was 38px.
  const box = await toggle.boundingBox();
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
});

test('a failed sign-in stays vague about whether the account exists', async ({ page }) => {
  // #83 is explicit that this copy must not become more specific: a message that distinguishes
  // "no such user" from "wrong password" tells an attacker which usernames are real.
  await gotoKeycloakLogin(page);

  await page.locator('input[name="username"]').fill('definitely-not-a-real-account');
  await page.locator('input[name="password"]').fill('definitely-not-a-real-password');
  await page.locator('#kc-login').click();

  const error = page.locator('.nkwapa-error');
  await expect(error).toBeVisible();
  await expect(error).toHaveText(/invalid username or password/i);

  // The field is marked invalid for assistive technology, not only tinted.
  await expect(page.locator('#username')).toHaveAttribute('aria-invalid', 'true');
});

test('the login screen has no horizontal overflow at any committed width', async ({ page }) => {
  // Load once at the widest and resize down, rather than navigating per width: a fresh load at a
  // narrow width lays out narrow and passes for the wrong reason.
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoKeycloakLogin(page);

  for (const breakpoint of BREAKPOINTS) {
    await page.setViewportSize({ width: breakpoint.width, height: breakpoint.height });
    const overflow = await page.evaluate(() => {
      const doc = document.documentElement;
      return doc.scrollWidth - doc.clientWidth;
    });
    expect(overflow, `${breakpoint.name} (${breakpoint.width}px) overflows by ${overflow}px`).toBe(
      0,
    );
  }
});

test('keyboard focus is visible and follows the reading order', async ({ page }) => {
  /*
    The template used to assign positive tabindex values 1, 2, 4, 5, 6 by hand, which put "Sign
    In" (5) ahead of "Forgot password" (6) even though the link sits above the button on screen.
    Positive tabindex also hoists an element above every untagged control in the document, so the
    password toggle -- which has none -- landed after the submit button. Removing them lets DOM
    order, which already matches reading order, do the job.

    Focus visibility used to reach only the inputs and the primary button, both through a
    box-shadow. A keyboard user tabbing to "Forgot password" got no indication at all.
  */
  await gotoKeycloakLogin(page);
  await page.evaluate(() => document.activeElement?.blur());

  const stops = [];
  for (let i = 0; i < 8; i += 1) {
    await page.keyboard.press('Tab');
    const stop = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const style = getComputedStyle(el);
      return {
        name: el.id || String(el.className || '').split(' ')[0] || el.tagName.toLowerCase(),
        top: Math.round(el.getBoundingClientRect().top),
        hasRing: style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) > 0,
      };
    });
    if (!stop) break;
    stops.push(stop);
  }

  expect(stops.length, 'nothing was reachable by keyboard').toBeGreaterThan(2);

  for (const stop of stops) {
    expect(stop.hasRing, `${stop.name} takes focus with no visible ring`).toBe(true);
  }

  // Reading order is top to bottom on this single-column form, so focus must never travel back up.
  const tops = stops.map((stop) => stop.top);
  expect(tops, `focus order jumped backwards: ${stops.map((s) => s.name).join(' -> ')}`).toEqual(
    [...tops].sort((a, b) => a - b),
  );
});
