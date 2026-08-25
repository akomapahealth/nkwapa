const path = require('path');

/**
 * The identities the E2E suite can sign in as.
 *
 * `staff` holds SYSTEM_ADMIN plus every clinic role at once, which is what most specs want: it can
 * walk the whole product without arranging permissions first. It is exactly the wrong identity for
 * proving that a role sees only what it should, because it sees everything. `doctor` and
 * `volunteer` each hold a single clinic seat, so a spec can assert both what a role reaches and
 * what it is refused.
 */
const AUTH_DIR = path.join(__dirname, '.auth');

const ROLES = {
  staff: {
    storageState: path.join(AUTH_DIR, 'staff.json'),
    username: process.env.E2E_STAFF_USERNAME || 'e2e.staff',
    password: process.env.E2E_STAFF_PASSWORD || 'NkwapaE2E!23',
  },
  doctor: {
    storageState: path.join(AUTH_DIR, 'doctor.json'),
    username: process.env.E2E_DOCTOR_USERNAME || 'e2e.doctor',
    password: process.env.E2E_DOCTOR_PASSWORD || 'NkwapaDoctor!23',
  },
  volunteer: {
    storageState: path.join(AUTH_DIR, 'volunteer.json'),
    username: process.env.E2E_VOLUNTEER_USERNAME || 'e2e.volunteer',
    password: process.env.E2E_VOLUNTEER_PASSWORD || 'NkwapaVolunteer!23',
  },
};

/** Storage state path for a role, for use with `test.use({ storageState })`. */
function storageStateFor(role) {
  const entry = ROLES[role];
  if (!entry) throw new Error(`Unknown e2e role: ${role}`);
  return entry.storageState;
}

module.exports = { ROLES, storageStateFor, AUTH_DIR };
