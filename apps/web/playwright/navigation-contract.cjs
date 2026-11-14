// Independent seeded-role navigation contract, shared by presentation and traversal checks.
const FLAG_OFF = {
  staff: [
    ['Dashboard', '/dashboard'],
    ['Today board', '/today'],
    ['My assigned', '/my/assigned'],
    ['Queues', '/queues'],
    ['Patients', '/clinics/:clinicId/patients'],
    ['Appointments', '/appointments'],
    ['New patient', '/clinics/:clinicId/patients/new'],
    ['Audit', '/audit'],
    ['Volunteers', '/volunteers'],
    ['Staff activity', '/staff-activity'],
    ['Metrics', '/metrics'],
    ['Research exports', '/research'],
    ['Clinics', '/admin/clinics'],
    ['Staff', '/admin/users'],
    ['Organization report', '/reports/organization'],
    ['Duplicate review', '/admin/duplicates'],
    ['Data requests', '/admin/data-requests'],
    ['Cross-clinic duplicates', '/admin/duplicates/cross-clinic'],
  ],
  doctor: [
    ['Dashboard', '/dashboard'],
    ['My assigned', '/my/assigned'],
    ['Queues', '/queues'],
    ['Patients', '/clinics/:clinicId/patients'],
    ['Appointments', '/appointments'],
    ['New patient', '/clinics/:clinicId/patients/new'],
  ],
  volunteer: [
    ['Dashboard', '/dashboard'],
    ['My assigned', '/my/assigned'],
    ['Queues', '/queues'],
    ['Patients', '/clinics/:clinicId/patients'],
    ['Appointments', '/appointments'],
    ['New patient', '/clinics/:clinicId/patients/new'],
  ],
  manager: [
    ['Dashboard', '/dashboard'],
    ['Today board', '/today'],
    ['Queues', '/queues'],
    ['Patients', '/clinics/:clinicId/patients'],
    ['Appointments', '/appointments'],
    ['New patient', '/clinics/:clinicId/patients/new'],
    ['Audit', '/audit'],
    ['Volunteers', '/volunteers'],
    ['Staff activity', '/staff-activity'],
    ['Metrics', '/metrics'],
    ['Staff', '/admin/users'],
    ['Duplicate review', '/admin/duplicates'],
    ['Data requests', '/admin/data-requests'],
  ],
  director: [
    ['Dashboard', '/dashboard'],
    ['Today board', '/today'],
    ['Queues', '/queues'],
    ['Patients', '/clinics/:clinicId/patients'],
    ['Appointments', '/appointments'],
    ['Audit', '/audit'],
    ['Volunteers', '/volunteers'],
    ['Staff activity', '/staff-activity'],
    ['Metrics', '/metrics'],
    ['Research exports', '/research'],
    ['Clinics', '/admin/clinics'],
    ['Staff', '/admin/users'],
    ['Duplicate review', '/admin/duplicates'],
    ['Data requests', '/admin/data-requests'],
  ],
};

// Independent station-enabled expectations, from the seeded roles' permissions in
// apps/api/src/auth/constants/permissions.ts: director cannot work stations.
// Keep flag-off sets above as the historical contract, without importing production nav helpers.
const FLAG_ON = {
  staff: [
    ['Dashboard', '/dashboard'],
    ['Today board', '/today'],
    ['Stations', '/stations'],
    ['Queues', '/queues'],
    ['Patients', '/clinics/:clinicId/patients'],
    ['Appointments', '/appointments'],
    ['New patient', '/clinics/:clinicId/patients/new'],
    ['Audit', '/audit'],
    ['Volunteers', '/volunteers'],
    ['Staff activity', '/staff-activity'],
    ['Metrics', '/metrics'],
    ['Research exports', '/research'],
    ['Clinics', '/admin/clinics'],
    ['Staff', '/admin/users'],
    ['Organization report', '/reports/organization'],
    ['Duplicate review', '/admin/duplicates'],
    ['Data requests', '/admin/data-requests'],
    ['Cross-clinic duplicates', '/admin/duplicates/cross-clinic'],
  ],
  doctor: [
    ['Dashboard', '/dashboard'],
    ['Stations', '/stations'],
    ['Queues', '/queues'],
    ['Patients', '/clinics/:clinicId/patients'],
    ['Appointments', '/appointments'],
    ['New patient', '/clinics/:clinicId/patients/new'],
  ],
  volunteer: [
    ['Dashboard', '/dashboard'],
    ['Stations', '/stations'],
    ['Queues', '/queues'],
    ['Patients', '/clinics/:clinicId/patients'],
    ['Appointments', '/appointments'],
    ['New patient', '/clinics/:clinicId/patients/new'],
  ],
  manager: [
    ['Dashboard', '/dashboard'],
    ['Today board', '/today'],
    ['Stations', '/stations'],
    ['Queues', '/queues'],
    ['Patients', '/clinics/:clinicId/patients'],
    ['Appointments', '/appointments'],
    ['New patient', '/clinics/:clinicId/patients/new'],
    ['Audit', '/audit'],
    ['Volunteers', '/volunteers'],
    ['Staff activity', '/staff-activity'],
    ['Metrics', '/metrics'],
    ['Staff', '/admin/users'],
    ['Duplicate review', '/admin/duplicates'],
    ['Data requests', '/admin/data-requests'],
  ],
  director: [
    ['Dashboard', '/dashboard'],
    ['Today board', '/today'],
    ['Queues', '/queues'],
    ['Patients', '/clinics/:clinicId/patients'],
    ['Appointments', '/appointments'],
    ['Audit', '/audit'],
    ['Volunteers', '/volunteers'],
    ['Staff activity', '/staff-activity'],
    ['Metrics', '/metrics'],
    ['Research exports', '/research'],
    ['Clinics', '/admin/clinics'],
    ['Staff', '/admin/users'],
    ['Duplicate review', '/admin/duplicates'],
    ['Data requests', '/admin/data-requests'],
  ],
};
const EXPECTED =
  process.env.NEXT_PUBLIC_FEATURE_STATION_WORKFLOW_ENABLED === 'true' ? FLAG_ON : FLAG_OFF;

// Independent seeded-role presentation contract, not production partition code.
const PHONE_PRIMARY =
  process.env.NEXT_PUBLIC_FEATURE_STATION_WORKFLOW_ENABLED === 'true'
    ? {
        staff: ['Dashboard', 'Stations', 'Today board', 'Queues'],
        doctor: ['Dashboard', 'Stations', 'Queues', 'Patients'],
        volunteer: ['Dashboard', 'Stations', 'Queues', 'Patients'],
        manager: ['Dashboard', 'Stations', 'Today board', 'Queues'],
        director: ['Dashboard', 'Today board', 'Queues', 'Patients'],
      }
    : {
        staff: ['Dashboard', 'Today board', 'My assigned', 'Queues'],
        doctor: ['Dashboard', 'My assigned', 'Queues', 'Patients'],
        volunteer: ['Dashboard', 'My assigned', 'Queues', 'Patients'],
        manager: ['Dashboard', 'Today board', 'Queues', 'Patients'],
        director: ['Dashboard', 'Today board', 'Queues', 'Patients'],
      };

const MESSAGE_DELIVERY = ['Message delivery', '/notifications/delivery'];
const CLINIC_SETTINGS = ['Clinic settings', '/settings/clinic'];
const UTILITIES = {
  staff: { profile: [MESSAGE_DELIVERY, CLINIC_SETTINGS] },
  doctor: { profile: [MESSAGE_DELIVERY] },
  volunteer: { profile: [MESSAGE_DELIVERY] },
  manager: { profile: [MESSAGE_DELIVERY] },
  director: { profile: [MESSAGE_DELIVERY, CLINIC_SETTINGS] },
};

module.exports = { EXPECTED, PHONE_PRIMARY, UTILITIES };
