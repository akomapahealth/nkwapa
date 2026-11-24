const { test, expect } = require('@playwright/test');

const { apiRequestAs } = require('../playwright/api-client');
const { storageStateFor } = require('../playwright/roles');

/*
  #425: signing out with a shift running left it open, so the board showed the volunteer on duty
  and the staffing counts were wrong until the stale-day sweep ended it on a later day.

  A real Keycloak logout would end the shared e2e session for every later spec, so the redirect
  to Keycloak is answered here instead. Everything before it, the shift end included, is real.
*/
test.use({ storageState: storageStateFor('volunteer') });
// Both tests change the same volunteer's shift.
test.describe.configure({ mode: 'serial' });

const KEYCLOAK_LOGOUT = /\/protocol\/openid-connect\/logout/;

async function clinicId() {
  return (await apiRequestAs('volunteer', 'get', '/auth/whoami')).json().activeClinicId;
}

async function myShift(clinic) {
  const today = new Date().toISOString().slice(0, 10); // Accra is UTC
  const res = await apiRequestAs(
    'volunteer',
    'get',
    `/clinics/${clinic}/shifts/active?date=${today}`,
    {
      clinicId: clinic,
    },
  );
  expect(res.ok(), res.text()).toBeTruthy();
  const { userId } = (await apiRequestAs('volunteer', 'get', '/auth/whoami')).json();
  return res.json().items.find((shift) => shift.userId === userId && shift.status === 'ACTIVE');
}

async function signOutFromSettings(page) {
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Log out' }).click();
}

test('on shift: sign-out offers to end it, and Cancel or End shift does what it says', async ({
  page,
}) => {
  const clinic = await clinicId();
  if (!(await myShift(clinic))) {
    const start = await apiRequestAs('volunteer', 'post', `/clinics/${clinic}/shifts/check-in`, {
      clinicId: clinic,
      data: { roleAtShift: 'VOLUNTEER' },
    });
    expect(start.ok(), start.text()).toBeTruthy();
  }
  await page.route(KEYCLOAK_LOGOUT, (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<p>Signed out</p>' }),
  );

  // Cancel keeps both the session and the shift.
  await signOutFromSettings(page);
  const dialog = page.getByRole('dialog', { name: 'End your shift too?' });
  await expect(dialog).toContainText('You are still on shift as Volunteer');
  await expect(dialog.getByRole('button', { name: 'Sign out only' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(/\/settings$/);
  expect(await myShift(clinic)).toBeTruthy();

  // End shift and sign out: the shift ends before the session goes.
  await page.getByRole('button', { name: 'Log out' }).click();
  const leaving = page.waitForRequest(KEYCLOAK_LOGOUT);
  await dialog.getByRole('button', { name: 'End shift and sign out' }).click();
  await leaving;
  expect(await myShift(clinic)).toBeUndefined();
});

test('off shift: sign-out asks nothing', async ({ page }) => {
  const clinic = await clinicId();
  const running = await myShift(clinic);
  if (running) {
    const end = await apiRequestAs(
      'volunteer',
      'post',
      `/clinics/${clinic}/shifts/${running.shiftId}/check-out`,
      { clinicId: clinic },
    );
    expect(end.ok(), end.text()).toBeTruthy();
  }
  await page.route(KEYCLOAK_LOGOUT, (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<p>Signed out</p>' }),
  );
  const leaving = page.waitForRequest(KEYCLOAK_LOGOUT);
  await signOutFromSettings(page);
  await leaving;
  await expect(page.getByRole('dialog', { name: 'End your shift too?' })).toHaveCount(0);
});
