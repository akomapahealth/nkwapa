/**
 * Shared fixtures for the appointment workflow suites.
 *
 * The lifecycle, authorization, and reminder suites all need the same Prisma surface and the same
 * appointment shapes. Keeping one definition here means a change to what the service reads shows up
 * as one failure rather than three copies drifting apart, and it is what the existing
 * `patient-portal.service.spec.ts` now builds on too.
 *
 * Every identifier and value here is synthetic. No real patient data belongs in this file or in any
 * fixture derived from it.
 */

export const FIXTURE_CLINIC_ID = 'clinic-1';
export const FIXTURE_OTHER_CLINIC_ID = 'clinic-2';
export const FIXTURE_PATIENT_ID = 'patient-1';
export const FIXTURE_APPOINTMENT_ID = 'appointment-1';
export const FIXTURE_REQUEST_ID = 'appt-req-1';
export const FIXTURE_ACTOR_ID = 'manager-1';

/** Fixed so `requiresStarted` assertions do not depend on when the suite runs. */
export const FIXTURE_FUTURE_START = new Date('2099-03-26T14:00:00.000Z');
export const FIXTURE_FUTURE_END = new Date('2099-03-26T14:30:00.000Z');
export const FIXTURE_PAST_START = new Date('2020-03-26T14:00:00.000Z');
export const FIXTURE_PAST_END = new Date('2020-03-26T14:30:00.000Z');

export interface PrismaModelMock {
  [operation: string]: jest.Mock;
}

/**
 * The Prisma surface `PatientPortalService` touches.
 *
 * `$transaction` invokes its callback with this same object, so a test asserting on `tx.appointment`
 * and one asserting on `prisma.appointment` see the same calls.
 */
export function createAppointmentPrismaMock() {
  const prisma = {
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    patientAccountLink: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      upsert: jest.fn(),
      create: jest.fn(),
      deleteMany: jest.fn(),
    },
    patient: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    patientPortalInvite: {
      create: jest.fn(),
      findFirst: jest.fn(),
      // The claim path re-reads by id after a claimable-invite miss, so it can tell a
      // patient their invitation lapsed rather than that it never existed.
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    encounter: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    diabetesScreening: {
      findMany: jest.fn(),
    },
    reminder: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
    patientMeasurement: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    patientSelfReport: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    appointmentRequest: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    appointment: {
      create: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
    clinic: {
      findUnique: jest.fn(),
    },
    userClinicRole: {
      upsert: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  prisma.$transaction.mockImplementation(async (callback: (tx: typeof prisma) => unknown) =>
    callback(prisma),
  );
  return prisma;
}

export type AppointmentPrismaMock = ReturnType<typeof createAppointmentPrismaMock>;

/** The portal patient the suites resolve through `PatientAccountLink`. */
export const portalPatientFixture = {
  id: FIXTURE_PATIENT_ID,
  patientCode: 'NKP-2026-000001',
  firstName: 'Ama',
  lastName: 'Mensah',
  dob: null,
  sex: 'FEMALE',
  primaryClinicId: FIXTURE_CLINIC_ID,
  phoneE164: '+233240000000',
  email: 'ama@example.com',
};

export function appointmentFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: FIXTURE_APPOINTMENT_ID,
    clinicId: FIXTURE_CLINIC_ID,
    patientId: FIXTURE_PATIENT_ID,
    startsAt: new Date('2026-03-26T14:00:00.000Z'),
    endsAt: new Date('2026-03-26T14:30:00.000Z'),
    status: 'CONFIRMED',
    linkedRequestId: FIXTURE_REQUEST_ID,
    assignedDoctorId: 'doctor-1',
    assignedVolunteerId: 'volunteer-1',
    notes: 'Bring home readings',
    createdAt: new Date('2026-03-21T09:10:00.000Z'),
    updatedAt: new Date('2026-03-21T09:10:00.000Z'),
    patient: {
      id: FIXTURE_PATIENT_ID,
      patientCode: 'NKP-2026-000001',
      firstName: 'Ama',
      lastName: 'Mensah',
      phoneE164: '+233240000000',
      email: 'ama@example.com',
    },
    assignedDoctor: { id: 'doctor-1', displayName: 'Dr One' },
    assignedVolunteer: { id: 'volunteer-1', displayName: 'Volunteer One' },
    ...overrides,
  };
}

export function appointmentRequestFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: FIXTURE_REQUEST_ID,
    clinicId: FIXTURE_CLINIC_ID,
    patientId: FIXTURE_PATIENT_ID,
    requestType: 'NEW_APPOINTMENT',
    sourceAppointmentId: null,
    preferredStartDate: new Date('2026-03-25T00:00:00.000Z'),
    preferredEndDate: new Date('2026-03-27T00:00:00.000Z'),
    reason: 'Blood pressure review',
    notes: null,
    status: 'REQUESTED',
    triagedByUserId: null,
    triagedAt: null,
    rejectionReason: null,
    createdAt: new Date('2026-03-21T09:00:00.000Z'),
    updatedAt: new Date('2026-03-21T09:00:00.000Z'),
    patient: {
      id: FIXTURE_PATIENT_ID,
      patientCode: 'NKP-2026-000001',
      firstName: 'Ama',
      lastName: 'Mensah',
      phoneE164: '+233240000000',
      email: 'ama@example.com',
    },
    triagedBy: null,
    appointment: null,
    ...overrides,
  };
}

export function appointmentReminderFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'reminder-1',
    clinicId: FIXTURE_CLINIC_ID,
    patientId: FIXTURE_PATIENT_ID,
    encounterId: null,
    appointmentId: FIXTURE_APPOINTMENT_ID,
    channel: 'SMS',
    toAddress: '+233240000000',
    templateKey: 'APPOINTMENT_REMINDER_V1',
    payloadJson: JSON.stringify({
      patientCode: 'NKP-2026-000001',
      clinicName: 'Clinic One',
      patientId: FIXTURE_PATIENT_ID,
      appointmentId: FIXTURE_APPOINTMENT_ID,
      startsAt: '2026-03-26T14:00:00.000Z',
    }),
    scheduledAt: new Date('2026-03-25T14:00:00.000Z'),
    sentAt: null,
    status: 'QUEUED',
    providerMessageId: null,
    failureReason: null,
    createdAt: new Date('2026-03-21T09:00:00.000Z'),
    updatedAt: new Date('2026-03-21T09:00:00.000Z'),
    appointment: {
      id: FIXTURE_APPOINTMENT_ID,
      status: 'CONFIRMED',
      startsAt: new Date('2026-03-26T14:00:00.000Z'),
    },
    ...overrides,
  };
}

/** The collaborators `PatientPortalService` writes through, as jest doubles. */
export function createAppointmentCollaboratorMocks() {
  return {
    auditService: { logWrite: jest.fn().mockResolvedValue(undefined) },
    reminderService: {
      scheduleAppointmentReminder: jest.fn().mockResolvedValue(undefined),
      scheduleAppointmentEmailReminder: jest.fn().mockResolvedValue(undefined),
      scheduleAppointmentReminderNoContact: jest.fn().mockResolvedValue(undefined),
      suppressQueuedAppointmentReminders: jest.fn().mockResolvedValue(undefined),
      sendNotificationNow: jest.fn().mockResolvedValue({
        id: 'delivery-1',
        status: 'QUEUED',
        failureReason: null,
        sentAt: null,
        createdAt: new Date('2026-03-21T09:00:00.000Z'),
      }),
    },
    emailDeliverabilityService: {
      assertDomainAcceptsEmail: jest.fn().mockResolvedValue(undefined),
    },
  };
}

export type AppointmentCollaboratorMocks = ReturnType<typeof createAppointmentCollaboratorMocks>;
