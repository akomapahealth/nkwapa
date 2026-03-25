import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PatientPortalService } from './patient-portal.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ReminderService } from '../reminders/reminder.service';

function createPrismaMock() {
  const prisma = {
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    patientAccountLink: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    patient: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    encounter: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    reminder: {
      findMany: jest.fn(),
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
    },
    clinic: {
      findUnique: jest.fn(),
    },
    userClinicRole: {
      upsert: jest.fn(),
      findFirst: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  prisma.$transaction.mockImplementation(async (callback: (tx: typeof prisma) => unknown) => callback(prisma));
  return prisma;
}

const portalPatient = {
  id: 'patient-1',
  patientCode: 'NKP-2026-000001',
  firstName: 'Ama',
  lastName: 'Mensah',
  dob: null,
  sex: 'FEMALE',
  primaryClinicId: 'clinic-1',
  phoneE164: '+233240000000',
  email: 'ama@example.com',
};

describe('PatientPortalService', () => {
  let service: PatientPortalService;
  let prisma: ReturnType<typeof createPrismaMock>;
  let auditService: { logWrite: jest.Mock };
  let reminderService: {
    scheduleAppointmentReminder: jest.Mock;
    scheduleAppointmentEmailReminder: jest.Mock;
    scheduleAppointmentReminderNoContact: jest.Mock;
  };

  beforeEach(async () => {
    prisma = createPrismaMock();
    auditService = { logWrite: jest.fn().mockResolvedValue(undefined) };
    reminderService = {
      scheduleAppointmentReminder: jest.fn().mockResolvedValue(undefined),
      scheduleAppointmentEmailReminder: jest.fn().mockResolvedValue(undefined),
      scheduleAppointmentReminderNoContact: jest.fn().mockResolvedValue(undefined),
    };

    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      keycloakSub: 'kc-sub-1',
      isActive: true,
    });
    prisma.patientAccountLink.findFirst.mockResolvedValue({ patient: portalPatient });
    prisma.encounter.findFirst.mockResolvedValue(null);
    prisma.encounter.findMany.mockResolvedValue([]);
    prisma.reminder.findMany.mockResolvedValue([]);
    prisma.patient.findFirst.mockResolvedValue({ id: 'patient-1' });
    prisma.clinic.findUnique.mockResolvedValue({ name: 'Clinic One' });
    prisma.patientMeasurement.findMany.mockResolvedValue([]);
    prisma.appointmentRequest.count.mockResolvedValue(0);
    prisma.appointment.count.mockResolvedValue(0);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PatientPortalService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: auditService },
        { provide: ReminderService, useValue: reminderService },
      ],
    }).compile();

    service = module.get(PatientPortalService);
  });

  it('resolves portal patients through PatientAccountLink when loading me', async () => {
    const result = await service.getMe('clinic-1', 'user-1');

    expect(prisma.patientAccountLink.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          keycloakSub: 'kc-sub-1',
        }),
      })
    );
    expect(result.patient.patientCode).toBe('NKP-2026-000001');
  });

  it('creates a BP measurement for the authenticated patient and audits it', async () => {
    prisma.patientMeasurement.create.mockResolvedValue({
      id: 'measurement-1',
      patientId: 'patient-1',
      clinicId: 'clinic-1',
      recordedAt: new Date('2026-03-21T10:00:00.000Z'),
      source: 'PATIENT',
      type: 'BP',
      payloadJson: JSON.stringify({ systolic: 120, diastolic: 80, pulse: 70 }),
      notes: 'Morning check',
      linkedEncounterId: null,
      createdAt: new Date('2026-03-21T10:00:00.000Z'),
      updatedAt: new Date('2026-03-21T10:00:00.000Z'),
    });

    const result = await service.createMeasurementForAuthenticatedPatient(
      'clinic-1',
      'user-1',
      {
        type: 'BP',
        payload: { systolic: 120, diastolic: 80, pulse: 70 },
        notes: 'Morning check',
      },
      'req-1'
    );

    expect(prisma.patientMeasurement.create).toHaveBeenCalled();
    expect(auditService.logWrite).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'MEASUREMENT.CREATE', entityId: 'measurement-1' })
    );
    expect(result.payload).toEqual({ systolic: 120, diastolic: 80, pulse: 70 });
  });

  it('rejects invalid glucose measurement payloads on spec-native writes', async () => {
    await expect(
      service.createMeasurementForAuthenticatedPatient(
        'clinic-1',
        'user-1',
        {
          type: 'GLUCOSE',
          payload: { value: 130 },
        },
        'req-1'
      )
    ).rejects.toThrow(BadRequestException);
  });

  it('translates legacy HOME_BP self-reports into measurements for compatibility writes', async () => {
    prisma.patientMeasurement.create.mockResolvedValue({
      id: 'measurement-2',
      patientId: 'patient-1',
      clinicId: 'clinic-1',
      recordedAt: new Date('2026-03-21T11:00:00.000Z'),
      source: 'PATIENT',
      type: 'BP',
      payloadJson: JSON.stringify({ systolic: 118, diastolic: 77 }),
      notes: 'Legacy route',
      linkedEncounterId: null,
      createdAt: new Date('2026-03-21T11:00:00.000Z'),
      updatedAt: new Date('2026-03-21T11:00:00.000Z'),
    });

    const result = await service.createSelfReport(
      'clinic-1',
      'user-1',
      {
        type: 'HOME_BP',
        systolicBp: 118,
        diastolicBp: 77,
        notes: 'Legacy route',
      },
      'req-1'
    );

    expect(prisma.patientMeasurement.create).toHaveBeenCalled();
    expect(result.type).toBe('HOME_BP');
    expect(result.systolicBp).toBe(118);
  });

  it('combines measurements with non-measurement legacy self-reports for staff views', async () => {
    prisma.patientMeasurement.findMany.mockResolvedValue([
      {
        id: 'measurement-3',
        patientId: 'patient-1',
        clinicId: 'clinic-1',
        recordedAt: new Date('2026-03-21T12:00:00.000Z'),
        source: 'PATIENT',
        type: 'BP',
        payloadJson: JSON.stringify({ systolic: 123, diastolic: 82 }),
        notes: 'Combined history',
        linkedEncounterId: null,
        createdAt: new Date('2026-03-21T12:00:00.000Z'),
        updatedAt: new Date('2026-03-21T12:00:00.000Z'),
      },
    ]);
    prisma.patientSelfReport.findMany.mockResolvedValue([
      {
        id: 'legacy-1',
        type: 'GENERAL',
        systolicBp: null,
        diastolicBp: null,
        glucoseMgDl: null,
        glucoseType: null,
        symptomsJson: null,
        notes: 'General update',
        recordedAt: new Date('2026-03-20T09:00:00.000Z'),
        createdAt: new Date('2026-03-20T09:00:00.000Z'),
      },
    ]);

    const result = await service.listSelfReportsForStaff('patient-1', 'clinic-1');

    expect(result).toHaveLength(2);
    expect(result[0].type).toBe('HOME_BP');
    expect(result[1].type).toBe('GENERAL');
  });

  it('merges finalized encounter readings with patient measurements and follow-up counts', async () => {
    prisma.patientMeasurement.findMany.mockResolvedValue([
      {
        id: 'measurement-bp-1',
        patientId: 'patient-1',
        clinicId: 'clinic-1',
        recordedAt: new Date('2026-03-20T09:00:00.000Z'),
        source: 'PATIENT',
        type: 'BP',
        payloadJson: JSON.stringify({ systolic: 124, diastolic: 81 }),
        notes: null,
        linkedEncounterId: null,
        createdAt: new Date('2026-03-20T09:00:00.000Z'),
        updatedAt: new Date('2026-03-20T09:00:00.000Z'),
      },
      {
        id: 'measurement-glucose-1',
        patientId: 'patient-1',
        clinicId: 'clinic-1',
        recordedAt: new Date('2026-03-21T09:00:00.000Z'),
        source: 'PATIENT',
        type: 'GLUCOSE',
        payloadJson: JSON.stringify({ value: 145, glucoseType: 'FASTING' }),
        notes: null,
        linkedEncounterId: null,
        createdAt: new Date('2026-03-21T09:00:00.000Z'),
        updatedAt: new Date('2026-03-21T09:00:00.000Z'),
      },
    ]);
    prisma.encounter.findMany.mockResolvedValue([
      {
        createdAt: new Date('2026-03-19T08:00:00.000Z'),
        vitals: { systolicBp: 132, diastolicBp: 86 },
        diabetesScreening: { glucoseMgDl: 201, glucoseType: 'RANDOM' },
      },
    ]);
    prisma.appointmentRequest.count
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1);
    prisma.appointment.count
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);

    const result = await service.listTrendsForAuthenticatedPatient(
      'clinic-1',
      'user-1',
      { from: '2026-03-01', to: '2026-03-31' }
    );

    expect(prisma.patientMeasurement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          patientId: 'patient-1',
          clinicId: 'clinic-1',
          type: { in: ['BP', 'GLUCOSE'] },
          recordedAt: {
            gte: new Date('2026-03-01T00:00:00.000Z'),
            lte: new Date('2026-03-31T23:59:59.999Z'),
          },
        }),
      })
    );
    expect(prisma.encounter.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          patientId: 'patient-1',
          clinicId: 'clinic-1',
          status: { in: ['FINALIZED'] },
          createdAt: {
            gte: new Date('2026-03-01T00:00:00.000Z'),
            lte: new Date('2026-03-31T23:59:59.999Z'),
          },
        }),
      })
    );
    expect(result.bp).toEqual([
      {
        t: '2026-03-19T08:00:00.000Z',
        sys: 132,
        dia: 86,
        source: 'ENCOUNTER',
      },
      {
        t: '2026-03-20T09:00:00.000Z',
        sys: 124,
        dia: 81,
        source: 'PATIENT',
      },
    ]);
    expect(result.glucose).toEqual([
      {
        t: '2026-03-19T08:00:00.000Z',
        value: 201,
        type: 'RANDOM',
        source: 'ENCOUNTER',
      },
      {
        t: '2026-03-21T09:00:00.000Z',
        value: 145,
        type: 'FASTING',
        source: 'PATIENT',
      },
    ]);
    expect(result.followUp).toEqual({
      requested: 2,
      confirmed: 3,
      completed: 4,
      noShow: 1,
      closed: 3,
    });
  });

  it('hides draft and in-review encounter readings from patients but includes them for staff', async () => {
    prisma.encounter.findMany.mockImplementation(async (args) => {
      const statuses = args.where.status.in as string[];
      if (statuses.includes('DRAFT')) {
        return [
          {
            createdAt: new Date('2026-03-18T08:00:00.000Z'),
            vitals: { systolicBp: 141, diastolicBp: 92 },
            diabetesScreening: null,
          },
        ];
      }

      return [];
    });

    const patientResult = await service.listTrendsForAuthenticatedPatient(
      'clinic-1',
      'user-1',
      {}
    );
    const staffResult = await service.listTrendsForStaff('patient-1', 'clinic-1', {});

    expect(patientResult.bp).toEqual([]);
    expect(staffResult.bp).toEqual([
      {
        t: '2026-03-18T08:00:00.000Z',
        sys: 141,
        dia: 92,
        source: 'ENCOUNTER',
      },
    ]);
  });

  it('creates appointment requests for the authenticated patient and audits them', async () => {
    prisma.appointmentRequest.create.mockResolvedValue({
      id: 'appt-req-1',
      clinicId: 'clinic-1',
      patientId: 'patient-1',
      preferredStartDate: new Date('2026-03-25T00:00:00.000Z'),
      preferredEndDate: new Date('2026-03-27T00:00:00.000Z'),
      reason: 'Follow-up',
      notes: 'Afternoon is best',
      status: 'REQUESTED',
      triagedByUserId: null,
      triagedAt: null,
      rejectionReason: null,
      createdAt: new Date('2026-03-21T09:00:00.000Z'),
      updatedAt: new Date('2026-03-21T09:00:00.000Z'),
      patient: {
        id: 'patient-1',
        patientCode: 'NKP-2026-000001',
        firstName: 'Ama',
        lastName: 'Mensah',
        phoneE164: '+233240000000',
        email: 'ama@example.com',
      },
      triagedBy: null,
      appointment: null,
    });

    const result = await service.createAppointmentRequestForAuthenticatedPatient(
      'clinic-1',
      'user-1',
      {
        preferredStartDate: '2026-03-25',
        preferredEndDate: '2026-03-27',
        reason: 'Follow-up',
        notes: 'Afternoon is best',
      },
      'req-1'
    );

    expect(prisma.appointmentRequest.create).toHaveBeenCalled();
    expect(auditService.logWrite).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'APPT.REQUEST.CREATE', entityId: 'appt-req-1' })
    );
    expect(result.status).toBe('REQUESTED');
  });

  it('confirms appointment requests, creates appointments, and schedules reminders', async () => {
    const existingRequest = {
      id: 'appt-req-2',
      clinicId: 'clinic-1',
      patientId: 'patient-1',
      preferredStartDate: new Date('2026-03-25T00:00:00.000Z'),
      preferredEndDate: new Date('2026-03-27T00:00:00.000Z'),
      reason: 'Follow-up',
      notes: 'Call first',
      status: 'REQUESTED',
      triagedByUserId: null,
      triagedAt: null,
      rejectionReason: null,
      createdAt: new Date('2026-03-21T09:00:00.000Z'),
      updatedAt: new Date('2026-03-21T09:00:00.000Z'),
      patient: {
        id: 'patient-1',
        patientCode: 'NKP-2026-000001',
        firstName: 'Ama',
        lastName: 'Mensah',
        phoneE164: '+233240000000',
        email: null,
      },
      triagedBy: null,
      appointment: null,
    };
    prisma.appointmentRequest.findFirst.mockResolvedValue(existingRequest);
    prisma.appointment.create.mockResolvedValue({
      id: 'appointment-1',
      clinicId: 'clinic-1',
      patientId: 'patient-1',
      startsAt: new Date('2026-03-26T14:00:00.000Z'),
      endsAt: new Date('2026-03-26T14:30:00.000Z'),
      status: 'CONFIRMED',
      linkedRequestId: 'appt-req-2',
      assignedDoctorId: null,
      assignedVolunteerId: null,
      notes: 'Bring logs',
      createdAt: new Date('2026-03-21T09:10:00.000Z'),
      updatedAt: new Date('2026-03-21T09:10:00.000Z'),
    });
    prisma.appointmentRequest.update.mockResolvedValue({
      ...existingRequest,
      status: 'CONFIRMED',
      triagedByUserId: 'manager-1',
      triagedAt: new Date('2026-03-21T09:10:00.000Z'),
      appointment: {
        id: 'appointment-1',
        clinicId: 'clinic-1',
        patientId: 'patient-1',
        startsAt: new Date('2026-03-26T14:00:00.000Z'),
        endsAt: new Date('2026-03-26T14:30:00.000Z'),
        status: 'CONFIRMED',
        linkedRequestId: 'appt-req-2',
        assignedDoctorId: null,
        assignedVolunteerId: null,
        notes: 'Bring logs',
        createdAt: new Date('2026-03-21T09:10:00.000Z'),
        updatedAt: new Date('2026-03-21T09:10:00.000Z'),
        assignedDoctor: null,
        assignedVolunteer: null,
      },
      triagedBy: { id: 'manager-1', displayName: 'Manager One' },
    });

    const result = await service.confirmAppointmentRequest(
      'clinic-1',
      'appt-req-2',
      'manager-1',
      {
        startsAt: '2026-03-26T14:00:00.000Z',
        endsAt: '2026-03-26T14:30:00.000Z',
        notes: 'Bring logs',
      },
      'req-1'
    );

    expect(prisma.appointment.create).toHaveBeenCalled();
    expect(auditService.logWrite).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'APPT.CREATE', entityId: 'appointment-1' })
    );
    expect(auditService.logWrite).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'APPT.REQUEST.CONFIRM', entityId: 'appt-req-2' })
    );
    expect(reminderService.scheduleAppointmentReminder).toHaveBeenCalled();
    expect(result.request.status).toBe('CONFIRMED');
  });

  it('rejects appointment requests and records the rejection reason', async () => {
    prisma.appointmentRequest.findFirst.mockResolvedValue({
      id: 'appt-req-3',
      clinicId: 'clinic-1',
      patientId: 'patient-1',
      preferredStartDate: new Date('2026-03-25T00:00:00.000Z'),
      preferredEndDate: new Date('2026-03-27T00:00:00.000Z'),
      reason: 'Follow-up',
      notes: null,
      status: 'REQUESTED',
      triagedByUserId: null,
      triagedAt: null,
      rejectionReason: null,
      createdAt: new Date('2026-03-21T09:00:00.000Z'),
      updatedAt: new Date('2026-03-21T09:00:00.000Z'),
      patient: {
        id: 'patient-1',
        patientCode: 'NKP-2026-000001',
        firstName: 'Ama',
        lastName: 'Mensah',
        phoneE164: '+233240000000',
        email: null,
      },
      triagedBy: null,
      appointment: null,
    });
    prisma.appointmentRequest.update.mockResolvedValue({
      id: 'appt-req-3',
      clinicId: 'clinic-1',
      patientId: 'patient-1',
      preferredStartDate: new Date('2026-03-25T00:00:00.000Z'),
      preferredEndDate: new Date('2026-03-27T00:00:00.000Z'),
      reason: 'Follow-up',
      notes: null,
      status: 'REJECTED',
      triagedByUserId: 'manager-1',
      triagedAt: new Date('2026-03-21T09:15:00.000Z'),
      rejectionReason: 'No slots available',
      createdAt: new Date('2026-03-21T09:00:00.000Z'),
      updatedAt: new Date('2026-03-21T09:15:00.000Z'),
      patient: {
        id: 'patient-1',
        patientCode: 'NKP-2026-000001',
        firstName: 'Ama',
        lastName: 'Mensah',
        phoneE164: '+233240000000',
        email: null,
      },
      triagedBy: { id: 'manager-1', displayName: 'Manager One' },
      appointment: null,
    });

    const result = await service.rejectAppointmentRequest(
      'clinic-1',
      'appt-req-3',
      'manager-1',
      { reason: 'No slots available' },
      'req-1'
    );

    expect(result.status).toBe('REJECTED');
    expect(result.rejectionReason).toBe('No slots available');
  });

  it('links portal accounts by keycloakSub and blocks linking a user to another patient', async () => {
    prisma.patient.findFirst.mockResolvedValue({ id: 'patient-1', primaryClinicId: 'clinic-1' });
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-2',
      keycloakSub: 'kc-sub-2',
      isActive: true,
    });
    prisma.patientAccountLink.findUnique.mockResolvedValue({
      id: 'link-1',
      patientId: 'patient-2',
      keycloakSub: 'kc-sub-2',
    });

    await expect(
      service.linkPortalUser('clinic-1', 'patient-1', 'user-2', 'manager-1', 'req-1')
    ).rejects.toThrow(ForbiddenException);
  });
});
