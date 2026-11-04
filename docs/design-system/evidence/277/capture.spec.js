const fs = require('fs');
const path = require('path');
const { createHash, randomUUID } = require('crypto');
const { test, expect, request: playwrightRequest } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { storageStateFor } = require(process.env.WEB_DIR + '/playwright/roles');
const { findMessageTo } = require(process.env.WEB_DIR + '/playwright/mailpit');
const { createClaimantStorageState } = require(
  process.env.WEB_DIR + '/playwright/claimant-fixture',
);

/*
  #277: authentication and onboarding. Seeded E2E identities, fresh synthetic invitations and a
  throwaway Keycloak (KC_EVIDENCE_URL, default :8180) that serves the theme under test, so the
  shared Keycloak the other agent uses is never touched. KC_EVIDENCE_ENV names the env file that
  holds that instance's bootstrap admin; it is read here and never printed.
*/
const OUT = process.env.EVIDENCE_DIR;
const KC = process.env.KC_EVIDENCE_URL || 'http://localhost:8180';
const PASSWORD = `E2e!${randomUUID()}`;
const VERIFIER = randomUUID() + randomUUID();
const CHALLENGE = createHash('sha256').update(VERIFIER).digest('base64url');
const KC_LOGIN = `${KC}/realms/nkwapa/protocol/openid-connect/auth?${new URLSearchParams({
  client_id: 'nkwapa-web',
  redirect_uri: 'http://localhost:3000/login',
  response_type: 'code',
  scope: 'openid',
  code_challenge: CHALLENGE,
  code_challenge_method: 'S256',
})}`;

const findings = [];
test.describe.configure({ mode: 'serial' });
// Merged by view, so a run resumed with -g keeps the views it did not repeat.
test.afterAll(() => {
  const file = path.join(OUT, 'axe.json');
  const kept = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
  const fresh = new Set(findings.map((f) => `${f.name}|${f.width}|${f.theme}`));
  const merged = [
    ...kept.filter((f) => !fresh.has(`${f.name}|${f.width}|${f.theme}`)),
    ...findings,
  ];
  fs.writeFileSync(file, JSON.stringify(merged, null, 2));
});

async function settle(page) {
  await page.waitForLoadState('networkidle').catch(() => {});
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

/** Every view at 1440 (full page) and 390 (first screen), light and dark, with axe. */
async function captureAll(page, views) {
  fs.mkdirSync(OUT, { recursive: true });
  for (const theme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: theme });
    await page.addInitScript((t) => localStorage.setItem('nkwapa-theme', t), theme);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width > 390 ? 900 : 844 });
      for (const [name, show] of views) {
        await show(page);
        await settle(page);
        await page.screenshot({
          path: path.join(OUT, `${name}--${width}--${theme}.jpg`),
          fullPage: width > 390,
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
}

/** Replace the onboarding invitations in whoami, to show the lapsed or used state. */
async function withoutInvites(page) {
  await page.route('**/auth/whoami*', async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.pendingStaffInvites = [];
    if (body.onboarding?.pendingInvites) body.onboarding.pendingInvites = [];
    await route.fulfill({ response, json: body });
  });
}

// No level: before #277 the account-step titles were h3s.
const heading = (page, name) =>
  expect(page.getByRole('heading', { name }).first()).toBeVisible({ timeout: 30_000 });

test.describe('signed out', () => {
  test.use({ storageState: { cookies: [], origins: [] }, reducedMotion: 'reduce' });
  test('login', async ({ page }) => {
    test.setTimeout(300_000);
    await captureAll(page, [
      [
        'login',
        async (p) => {
          await p.goto('/login');
          await heading(p, /sign in/i);
        },
      ],
      [
        'login-error',
        async (p) => {
          // Reachable but never answering the silent session check, so after its timeout the page
          // shows the sign-in error rather than "offline".
          const check = '**/protocol/openid-connect/auth**';
          await p.route(check, (route) => route.abort());
          await p.goto('/login');
          await expect(
            p.getByRole('heading', { name: /couldn.t start secure sign-in/i, level: 1 }),
          ).toBeVisible({ timeout: 40_000 });
          await p.unroute(check);
        },
      ],
    ]);
  });
});

test.describe('keycloak theme', () => {
  test.use({ storageState: { cookies: [], origins: [] }, reducedMotion: 'reduce' });
  test('keycloak', async ({ page }) => {
    test.setTimeout(300_000);
    const env = Object.fromEntries(
      fs
        .readFileSync(process.env.KC_EVIDENCE_ENV, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
    );
    const api = await playwrightRequest.newContext();
    const token = (
      await (
        await api.post(`${KC}/realms/master/protocol/openid-connect/token`, {
          form: {
            grant_type: 'password',
            client_id: 'admin-cli',
            username: env.KC_BOOTSTRAP_ADMIN_USERNAME,
            password: env.KC_BOOTSTRAP_ADMIN_PASSWORD,
          },
        })
      ).json()
    ).access_token;
    const newUser = async () => {
      const email = `evidence.${randomUUID()}@nkwapa.local`;
      const res = await api.post(`${KC}/admin/realms/nkwapa/users`, {
        headers: { Authorization: `Bearer ${token}` },
        data: {
          username: email,
          email,
          enabled: true,
          emailVerified: true,
          credentials: [{ type: 'password', value: PASSWORD, temporary: true }],
        },
      });
      expect(res.status()).toBe(201);
      return email;
    };

    const login = async (p) => {
      await p.context().clearCookies();
      await p.goto(KC_LOGIN);
      await expect(p.locator('#kc-login')).toBeVisible({ timeout: 30_000 });
    };
    await captureAll(page, [
      ['kc-login', login],
      [
        'kc-login-failed',
        async (p) => {
          await login(p);
          await p.fill('#username', 'evidence-no-such-account');
          await p.fill('#password', 'evidence-not-a-password');
          await p.click('#kc-login');
          await expect(p.locator('.nkwapa-error')).toBeVisible();
        },
      ],
      [
        'kc-forgot-password',
        async (p) => {
          await login(p);
          await p.locator('a[href*="reset-credentials"]').click();
          await expect(p.locator('#username')).toBeVisible();
        },
      ],
      [
        'kc-update-password',
        async (p) => {
          await login(p);
          await p.fill('#username', await newUser());
          await p.fill('#password', PASSWORD);
          await p.click('#kc-login');
          await expect(p.locator('#password-new')).toBeVisible({ timeout: 30_000 });
        },
      ],
      [
        'kc-invalid-link',
        async (p) => {
          await p.context().clearCookies();
          await p.goto(`${KC}/realms/nkwapa/login-actions/action-token?key=evidence-not-a-token`);
          await expect(p.locator('#kc-page-title')).toBeVisible();
        },
      ],
    ]);
    await api.dispose();
  });
});

test.describe('staff invitee', () => {
  test.use({ storageState: { cookies: [], origins: [] }, reducedMotion: 'reduce' });
  test('accept-invite and name', async ({ page, browser }) => {
    test.setTimeout(600_000);
    const email = `e2e.evidence.${Date.now()}@nkwapa.local`;
    const manager = await browser.newContext({ storageState: storageStateFor('staff') });
    const admin = await manager.newPage();
    await admin.goto('/admin/users');
    await expect(admin.getByRole('heading', { name: 'Staff invitations' })).toBeVisible({
      timeout: 30_000,
    });
    await admin.getByRole('button', { name: /invite a colleague/i }).click();
    const dialog = admin.getByRole('dialog');
    await dialog.getByLabel('Email').fill(email);
    await dialog.getByRole('button', { name: /send invitation/i }).click();
    await expect(admin.getByText(`Invitation sent to ${email}`)).toBeVisible({ timeout: 30_000 });
    await manager.close();

    const setup = await findMessageTo(email, { subjectMatch: /choose your nkwapa password/i });
    const link = (setup.Text || '').match(
      /https?:\/\/[^\s"<]*\/realms\/nkwapa\/login-actions\/action-token[^\s"<]+/,
    )?.[0];
    await page.goto(link);
    await page
      .getByRole('link', { name: /continue/i })
      .first()
      .click();
    await page.fill('#password-new', PASSWORD);
    await page.fill('#password-confirm', PASSWORD);
    await page.click('input[type="submit"], button[type="submit"]');
    await page.getByRole('link', { name: /continue to nkwapa/i }).click();
    await page.waitForURL(/realms\/nkwapa/, { timeout: 60_000 });
    await page.fill('input[name="username"]', email);
    await page.fill('input[name="password"]', PASSWORD);
    await page.click('#kc-login');
    await page.waitForURL(/\/accept-invite/, { timeout: 60_000 });

    const accept = async (p) => {
      await p.goto('/accept-invite?continue=1');
      await expect(p.getByRole('button', { name: /^accept volunteer at/i })).toBeVisible({
        timeout: 30_000,
      });
    };
    await captureAll(page, [
      ['accept-invite', accept],
      [
        'accept-invite-none',
        async (p) => {
          await withoutInvites(p);
          await p.goto('/accept-invite');
          await heading(p, /join your clinic team/i);
          await expect(p.getByRole('button', { name: 'Check again' })).toBeVisible({
            timeout: 30_000,
          });
          await p.unrouteAll({ behavior: 'ignoreErrors' });
        },
      ],
    ]);

    await accept(page);
    await page.getByRole('button', { name: /^accept volunteer at/i }).click();
    await page.waitForURL(/\/account\/name/, { timeout: 60_000 });
    await captureAll(page, [
      [
        'account-name',
        async (p) => {
          await p.goto('/account/name');
          await expect(p.getByRole('button', { name: 'Save and continue' })).toBeVisible({
            timeout: 30_000,
          });
        },
      ],
    ]);
  });
});

test.describe('patient claimant', () => {
  test.use({ reducedMotion: 'reduce' });
  test('claim-record', async ({ browser }) => {
    test.setTimeout(600_000);
    const context = await browser.newContext({
      storageState: await createClaimantStorageState(browser),
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    const open = async (p) => {
      await p.goto('/claim-record');
      await expect(p.getByRole('textbox', { name: 'Patient code', exact: true })).toBeVisible({
        timeout: 30_000,
      });
    };
    await captureAll(page, [
      ['claim-record', open],
      [
        'claim-record-mismatch',
        async (p) => {
          await open(p);
          await p
            .getByRole('textbox', { name: 'Patient code', exact: true })
            .fill('NKP-0000-000000');
          await p.getByLabel('Date of birth').fill('1993-08-19');
          await p.getByRole('button', { name: /claim patient record/i }).click();
          await expect(p.getByText(/patient code does not match/i)).toBeVisible({
            timeout: 30_000,
          });
        },
      ],
      [
        'claim-record-none',
        async (p) => {
          await withoutInvites(p);
          await p.goto('/claim-record');
          await expect(p.getByRole('button', { name: 'Check again' })).toBeVisible({
            timeout: 30_000,
          });
          await p.unrouteAll({ behavior: 'ignoreErrors' });
        },
      ],
    ]);
    await context.close();
  });
});

for (const [role, label] of [
  ['volunteer', 'welcome-tour-volunteer'],
  ['doctor', 'welcome-tour-doctor'],
  ['patient', 'welcome-tour-patient'],
]) {
  test.describe(label, () => {
    test.use({ storageState: storageStateFor(role), reducedMotion: 'reduce' });
    test(label, async ({ page }) => {
      test.setTimeout(300_000);
      const tour = (stepsForward) => async (p) => {
        await p.goto(role === 'patient' ? '/portal' : '/dashboard');
        await expect(p.locator('#main-content')).toBeVisible({ timeout: 30_000 });
        await p.getByRole('button', { name: 'User menu' }).click();
        await p.getByRole('menuitem', { name: 'Take the tour' }).click();
        const dialog = p.getByRole('dialog');
        await expect(dialog.getByRole('heading', { name: 'Welcome to Nkwapa' })).toBeVisible();
        for (let i = 0; i < stepsForward; i += 1)
          await dialog.getByRole('button', { name: 'Next' }).click();
      };
      await captureAll(page, [
        [`${label}-1`, tour(0)],
        [`${label}-2`, tour(1)],
        [`${label}-3`, tour(2)],
      ]);
    });
  });
}
