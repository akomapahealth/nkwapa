const { test, expect } = require('@playwright/test');

test.use({ storageState: { cookies: [], origins: [] } });

test('landing page stays standalone from secure sign in', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByText(/continue to secure sign in/i)).toHaveCount(0);
  await expect(page.getByText(/^get started$/i)).toHaveCount(0);
  // Sign-in is a quiet header link that says accounts are invitation-only; there is no sign-up.
  const login = page.getByRole('banner').getByRole('link', { name: /^log in/i });
  await expect(login).toHaveAttribute('href', '/login');
  await expect(login).toContainText(/invite only/i);
  await expect(page.locator('a[href^="/login"]')).toHaveCount(1);
  await expect(page.getByRole('link', { name: /sign up|create (an )?account/i })).toHaveCount(0);
  await page.locator('footer [data-status-trigger]').click();
  await expect(page.getByRole('dialog').locator('a[href="/login?next=%2Fstatus"]')).toHaveCount(1);
  await page.keyboard.press('Escape');

  const hasViewportOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
  expect(hasViewportOverflow).toBeFalsy();
});

test('protected routes redirect unauthenticated users to /login with next state', async ({
  page,
}) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard/);
  await expect(page.getByRole('heading', { name: /sign in to continue/i })).toBeVisible();
});

test('sign-in asks patient or clinic staff, tailors its help and remembers the choice', async ({
  page,
}) => {
  await page.goto('/login');
  const choice = page.getByRole('group', { name: 'I am signing in as' });
  const patient = choice.getByRole('radio', { name: 'Patient' });
  const staff = choice.getByRole('radio', { name: 'Clinic staff' });

  await expect(patient).toBeChecked();
  await expect(page.getByText(/invitation only/i)).toBeVisible();
  await expect(page.getByText('Keep your clinic card nearby')).toBeVisible();

  // Arrow keys move between the two, like any radio group.
  await patient.focus();
  await page.keyboard.press('ArrowRight');
  await expect(staff).toBeChecked();
  await expect(page).toHaveURL(/[?&]as=staff/);
  await expect(page.getByText('Joining a clinic team')).toBeVisible();
  await expect(page.getByText('Keep your clinic card nearby')).toHaveCount(0);

  // Remembered on this device, and a link can still choose for the visitor.
  await page.goto('/login');
  await expect(staff).toBeChecked();
  await page.goto('/login?as=patient');
  await expect(patient).toBeChecked();
});
