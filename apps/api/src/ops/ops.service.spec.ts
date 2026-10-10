import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { OpsService } from './ops.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { StationService } from './station.service';

function createPrismaMock() {
  const prisma = {
    clinic: {
      findFirst: jest.fn().mockResolvedValue({ id: 'clinic-1' }),
      findUnique: jest.fn().mockResolvedValue({ timezone: 'Africa/Accra' }),
    },
    userClinicRole: {
      findFirst: jest.fn().mockResolvedValue({ id: 'role-1' }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    staffShift: {
      findFirst: jest
        .fn()
        .mockImplementation(async (args?: { where?: { roleAtShift?: string } }) => {
          if (args?.where?.roleAtShift) {
            return {
              id: 'shift-role-1',
              clinicId: 'clinic-1',
              userId: 'user-1',
              roleAtShift: args.where.roleAtShift,
              checkedInAt: new Date('2026-03-21T08:00:00.000Z'),
              checkedOutAt: null,
              status: 'ACTIVE',
              notes: null,
              user: { id: 'user-1', displayName: 'Volunteer One' },
            };
          }
          return null;
        }),
      create: jest.fn().mockResolvedValue({
        id: 'shift-1',
        clinicId: 'clinic-1',
        userId: 'user-1',
        roleAtShift: 'VOLUNTEER',
        checkedInAt: new Date('2026-03-21T08:00:00.000Z'),
        checkedOutAt: null,
        status: 'ACTIVE',
        notes: null,
        user: { id: 'user-1', displayName: 'Volunteer One' },
      }),
      findUnique: jest.fn().mockResolvedValue({
        id: 'shift-1',
        clinicId: 'clinic-1',
        userId: 'user-1',
        roleAtShift: 'VOLUNTEER',
        checkedInAt: new Date('2026-03-21T08:00:00.000Z'),
        checkedOutAt: null,
        status: 'ACTIVE',
        notes: null,
        user: { id: 'user-1', displayName: 'Volunteer One' },
      }),
      update: jest.fn().mockResolvedValue({
        id: 'shift-1',
        clinicId: 'clinic-1',
        userId: 'user-1',
        roleAtShift: 'VOLUNTEER',
        checkedInAt: new Date('2026-03-21T08:00:00.000Z'),
        checkedOutAt: new Date('2026-03-21T12:00:00.000Z'),
        status: 'CLOSED',
        notes: null,
        user: { id: 'user-1', displayName: 'Volunteer One' },
      }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    patient: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'patient-1',
        patientCode: 'NKP-2026-000001',
        firstName: 'Ama',
        lastName: 'Mensah',
      }),
      findUnique: jest.fn().mockResolvedValue({
        id: 'patient-1',
        primaryClinicId: 'clinic-1',
      }),
    },
    patientCheckIn: {
      create: jest.fn().mockResolvedValue({
        id: 'checkin-1',
        clinicId: 'clinic-1',
        patientId: 'patient-1',
        checkedInAt: new Date('2026-03-21T09:00:00.000Z'),
        source: 'STAFF',
        status: 'WAITING',
        encounterId: null,
        notes: null,
        patient: {
          id: 'patient-1',
          patientCode: 'NKP-2026-000001',
          firstName: 'Ama',
          lastName: 'Mensah',
        },
      }),
      findUnique: jest.fn().mockResolvedValue({
        id: 'checkin-1',
        clinicId: 'clinic-1',
        patientId: 'patient-1',
        checkedInAt: new Date('2026-03-21T09:00:00.000Z'),
        source: 'STAFF',
        status: 'ASSIGNED',
        encounterId: null,
        notes: null,
        patient: { id: 'patient-1', primaryClinicId: 'clinic-1' },
        assignments: [
          {
            id: 'assignment-1',
            assignedVolunteerId: 'user-1',
            assignedDoctorId: 'doctor-1',
            assignedAt: new Date('2026-03-21T09:05:00.000Z'),
            status: 'ACTIVE',
            assignedVolunteer: { id: 'user-1', displayName: 'Volunteer One' },
            assignedDoctor: { id: 'doctor-1', displayName: 'Doctor One' },
            assignedBy: { id: 'manager-1', displayName: 'Manager One' },
          },
        ],
      }),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({
        id: 'checkin-1',
        clinicId: 'clinic-1',
        patientId: 'patient-1',
        checkedInAt: new Date('2026-03-21T09:00:00.000Z'),
        source: 'STAFF',
        status: 'IN_PROGRESS',
        encounterId: 'enc-1',
        notes: null,
        patient: {
          id: 'patient-1',
          patientCode: 'NKP-2026-000001',
          firstName: 'Ama',
          lastName: 'Mensah',
        },
        assignments: [
          {
            id: 'assignment-1',
            assignedAt: new Date('2026-03-21T09:05:00.000Z'),
            status: 'ACTIVE',
            assignedVolunteer: { id: 'user-1', displayName: 'Volunteer One' },
            assignedDoctor: { id: 'doctor-1', displayName: 'Doctor One' },
            assignedBy: { id: 'manager-1', displayName: 'Manager One' },
          },
        ],
      }),
    },
    patientAssignment: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({
        id: 'assignment-1',
        clinicId: 'clinic-1',
        patientCheckInId: 'checkin-1',
        assignedVolunteerId: 'user-1',
        assignedDoctorId: 'doctor-1',
        assignedByUserId: 'manager-1',
        assignedAt: new Date('2026-03-21T09:05:00.000Z'),
        status: 'ACTIVE',
        reason: null,
        patientCheckIn: {
          id: 'checkin-1',
          checkedInAt: new Date('2026-03-21T09:00:00.000Z'),
          status: 'ASSIGNED',
          encounterId: null,
          patient: {
            id: 'patient-1',
            patientCode: 'NKP-2026-000001',
            firstName: 'Ama',
            lastName: 'Mensah',
          },
        },
        assignedVolunteer: { id: 'user-1', displayName: 'Volunteer One' },
        assignedDoctor: { id: 'doctor-1', displayName: 'Doctor One' },
        assignedBy: { id: 'manager-1', displayName: 'Manager One' },
      }),
      findUnique: jest.fn().mockResolvedValue({
        id: 'assignment-1',
        clinicId: 'clinic-1',
        patientCheckInId: 'checkin-1',
        status: 'ACTIVE',
        patientCheckIn: {
          id: 'checkin-1',
          clinicId: 'clinic-1',
          status: 'ASSIGNED',
        },
      }),
      update: jest.fn().mockResolvedValue({
        id: 'assignment-1',
        status: 'REASSIGNED',
        reason: 'Load balancing',
      }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'user-1',
        isActive: true,
        displayName: 'Volunteer One',
      }),
      findFirst: jest.fn().mockResolvedValue({
        id: 'user-1',
        isActive: true,
      }),
    },
    encounter: {
      create: jest.fn().mockResolvedValue({
        id: 'enc-1',
        clinicId: 'clinic-1',
        patientId: 'patient-1',
        status: 'DRAFT',
        createdAt: new Date('2026-03-21T09:10:00.000Z'),
      }),
    },
    syncMutation: { create: jest.fn().mockResolvedValue({}) },
    $executeRaw: jest.fn().mockResolvedValue(0),
    $transaction: jest.fn(),
  };

  prisma.$transaction.mockImplementation(async (callback: (tx: typeof prisma) => unknown) =>
    callback(prisma),
  );
  return prisma;
}

describe('OpsService', () => {
  let service: OpsService;
  let prisma: ReturnType<typeof createPrismaMock>;
  let auditService: { logWrite: jest.Mock };
  let stationService: { queueAtFirstStation: jest.Mock; releaseForShiftEnd: jest.Mock };
  const originalStationFlag = process.env.FEATURE_STATION_WORKFLOW_ENABLED;

  beforeEach(async () => {
    delete process.env.FEATURE_STATION_WORKFLOW_ENABLED;
    prisma = createPrismaMock();
    auditService = { logWrite: jest.fn().mockResolvedValue(undefined) };
    stationService = {
      queueAtFirstStation: jest.fn().mockResolvedValue({ id: 'visit-1' }),
      releaseForShiftEnd: jest.fn().mockResolvedValue(0),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OpsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: auditService },
        { provide: StationService, useValue: stationService },
      ],
    }).compile();

    service = module.get(OpsService);
  });

  afterAll(() => {
    if (originalStationFlag === undefined) delete process.env.FEATURE_STATION_WORKFLOW_ENABLED;
    else process.env.FEATURE_STATION_WORKFLOW_ENABLED = originalStationFlag;
  });

  // #167. The flag decides who owns a checked-in patient: the station line or a manager.
  describe('station workflow', () => {
    beforeEach(() => {
      process.env.FEATURE_STATION_WORKFLOW_ENABLED = 'true';
    });

    it('queues a new check-in at the first station inside the check-in transaction', async () => {
      await service.createCheckIn('clinic-1', 'user-1', { patientId: 'patient-1' });

      expect(stationService.queueAtFirstStation).toHaveBeenCalledWith(
        prisma,
        expect.objectContaining({ clinicId: 'clinic-1', checkInId: 'checkin-1' }),
        expect.anything(),
      );
    });

    it('refuses manager assignment and assigned intake', async () => {
      await expect(
        service.createAssignment('clinic-1', 'manager-1', {
          patientCheckInId: 'checkin-1',
          assignedVolunteerId: 'user-1',
          assignedDoctorId: 'doctor-1',
        }),
      ).rejects.toMatchObject({ response: { code: 'STATION_WORKFLOW_ACTIVE' } });
      await expect(service.startIntake('clinic-1', 'checkin-1', 'user-1')).rejects.toMatchObject({
        response: { code: 'STATION_WORKFLOW_ACTIVE' },
      });
      await expect(
        service.reassignAssignment('clinic-1', 'assignment-1', 'manager-1', {
          assignedVolunteerId: 'user-1',
          assignedDoctorId: 'doctor-1',
          reason: 'x',
        }),
      ).rejects.toMatchObject({ response: { code: 'STATION_WORKFLOW_ACTIVE' } });
    });

    it('does not queue anyone while the flag is off', async () => {
      delete process.env.FEATURE_STATION_WORKFLOW_ENABLED;
      await service.createCheckIn('clinic-1', 'user-1', { patientId: 'patient-1' });
      expect(stationService.queueAtFirstStation).not.toHaveBeenCalled();
    });
  });

  it('releases held station claims and clears the station on shift check-out', async () => {
    await service.checkOut('clinic-1', 'shift-1', 'user-1');

    expect(prisma.staffShift.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ stationId: null }) }),
    );
    expect(stationService.releaseForShiftEnd).toHaveBeenCalledWith(
      prisma,
      { clinicId: 'clinic-1', userId: 'user-1', actorUserId: 'user-1' },
      expect.anything(),
    );
  });

  it('checks staff in and audits the shift', async () => {
    const result = await service.checkIn(
      'clinic-1',
      'user-1',
      { roleAtShift: 'VOLUNTEER' as const },
      { requestId: 'req-1' },
    );

    expect(result.id).toBe('shift-1');
    expect(prisma.staffShift.create).toHaveBeenCalled();
    // Written inside the transaction, so it commits or rolls back with the write.
    expect(auditService.logWrite).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'SHIFT.CHECKIN', entityId: 'shift-1' }),
      prisma,
    );
  });

  it('rejects duplicate active shifts', async () => {
    prisma.staffShift.findFirst.mockResolvedValueOnce({
      id: 'shift-existing',
      clinicId: 'clinic-1',
      userId: 'user-1',
      roleAtShift: 'VOLUNTEER',
      checkedInAt: new Date('2026-03-21T08:00:00.000Z'),
      checkedOutAt: null,
      status: 'ACTIVE',
      notes: null,
      user: { id: 'user-1', displayName: 'Volunteer One' },
    });

    await expect(
      service.checkIn(
        'clinic-1',
        'user-1',
        { roleAtShift: 'VOLUNTEER' as const },
        { requestId: 'req-1' },
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('rejects invalid shift roles for the actor', async () => {
    prisma.userClinicRole.findFirst.mockResolvedValueOnce(null);

    await expect(
      service.checkIn(
        'clinic-1',
        'user-1',
        { roleAtShift: 'MANAGER' as const },
        { requestId: 'req-1' },
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('checks staff out successfully', async () => {
    const result = await service.checkOut('clinic-1', 'shift-1', 'user-1', { requestId: 'req-1' });

    expect(result.status).toBe('CLOSED');
    expect(prisma.staffShift.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'shift-1' },
      }),
    );
  });

  it('creates a patient check-in', async () => {
    const result = await service.createCheckIn(
      'clinic-1',
      'user-1',
      { patientId: 'patient-1' },
      { requestId: 'req-1' },
    );

    expect(result.status).toBe('WAITING');
    expect(prisma.patientCheckIn.create).toHaveBeenCalled();
    // Written inside the transaction, so it commits or rolls back with the write.
    expect(auditService.logWrite).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CHECKIN.CREATE', entityId: 'checkin-1' }),
      prisma,
    );
  });

  it('blocks assignment when staff is not actively checked in', async () => {
    prisma.patientCheckIn.findUnique.mockResolvedValueOnce({
      id: 'checkin-1',
      clinicId: 'clinic-1',
      patientId: 'patient-1',
      status: 'WAITING',
      patient: {
        id: 'patient-1',
        patientCode: 'NKP-2026-000001',
        firstName: 'Ama',
        lastName: 'Mensah',
      },
    });
    prisma.staffShift.findFirst.mockResolvedValue(null);

    await expect(
      service.createAssignment(
        'clinic-1',
        'manager-1',
        {
          patientCheckInId: 'checkin-1',
          assignedVolunteerId: 'user-1',
          assignedDoctorId: 'doctor-1',
        },
        'req-1',
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects duplicate active assignments', async () => {
    prisma.patientCheckIn.findUnique.mockResolvedValueOnce({
      id: 'checkin-1',
      clinicId: 'clinic-1',
      patientId: 'patient-1',
      status: 'WAITING',
      patient: {
        id: 'patient-1',
        patientCode: 'NKP-2026-000001',
        firstName: 'Ama',
        lastName: 'Mensah',
      },
    });
    prisma.patientAssignment.findFirst.mockResolvedValueOnce({
      id: 'assignment-existing',
      patientCheckInId: 'checkin-1',
      status: 'ACTIVE',
    });

    await expect(
      service.createAssignment(
        'clinic-1',
        'manager-1',
        {
          patientCheckInId: 'checkin-1',
          assignedVolunteerId: 'user-1',
          assignedDoctorId: 'doctor-1',
        },
        'req-1',
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('reassigns while preserving assignment history', async () => {
    const result = await service.reassignAssignment(
      'clinic-1',
      'assignment-1',
      'manager-1',
      {
        assignedVolunteerId: 'user-1',
        assignedDoctorId: 'doctor-1',
        reason: 'Load balancing',
      },
      'req-1',
    );

    expect(prisma.patientAssignment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'assignment-1' },
        data: expect.objectContaining({ status: 'REASSIGNED', reason: 'Load balancing' }),
      }),
    );
    expect(prisma.patientAssignment.create).toHaveBeenCalled();
    expect(result.id).toBe('assignment-1');
    expect(auditService.logWrite).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ASSIGNMENT.REASSIGN' }),
    );
  });

  it('starts intake by creating an encounter and moving the check-in to IN_PROGRESS', async () => {
    const result = await service.startIntake('clinic-1', 'checkin-1', 'user-1', 'req-1');

    expect(prisma.encounter.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          clinicId: 'clinic-1',
          patientId: 'patient-1',
          status: 'DRAFT',
          createdByUserId: 'user-1',
        }),
      }),
    );
    expect(prisma.patientCheckIn.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'checkin-1' },
        data: expect.objectContaining({
          encounterId: 'enc-1',
          status: 'IN_PROGRESS',
        }),
      }),
    );
    expect(result.encounter.id).toBe('enc-1');
    expect(auditService.logWrite).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CHECKIN.START_INTAKE', entityId: 'checkin-1' }),
    );
  });

  describe('the operational day window', () => {
    /** The `checkedInAt` filter the check-in listing was built with. */
    const checkInWindow = () => prisma.patientCheckIn.findMany.mock.calls[0][0].where.checkedInAt;

    it('spans the clinic’s local day, not the UTC day', async () => {
      prisma.clinic.findUnique.mockResolvedValue({ timezone: 'America/New_York' });

      const result = await service.listCheckIns('clinic-1', { date: '2026-03-21' } as never);

      // Local midnight in New York is 04:00Z, so a UTC-midnight window would have started four
      // hours early and ended four hours early -- losing the clinic's whole evening.
      expect(checkInWindow().gte.toISOString()).toBe('2026-03-21T04:00:00.000Z');
      expect(checkInWindow().lte.toISOString()).toBe('2026-03-22T03:59:59.999Z');
      expect(result.timezone).toBe('America/New_York');
      expect(result.date).toBe('2026-03-21');
    });

    it('reports the zone it actually used rather than a constant', async () => {
      // India is +05:30, which also proves the window is not rounded to whole hours. The zone is
      // named by the alias on purpose: ICU canonicalises it, and which spelling wins depends on
      // the ICU build, so the assertion is against the runtime's own answer rather than a
      // hard-coded name.
      const canonical = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Kolkata',
      }).resolvedOptions().timeZone;
      prisma.clinic.findUnique.mockResolvedValue({ timezone: 'Asia/Kolkata' });

      const result = await service.listAssignments('clinic-1', { date: '2026-06-15' } as never);

      // The old code reported Africa/Accra for every clinic, whatever its real zone.
      expect(result.timezone).toBe(canonical);
      const window = prisma.patientAssignment.findMany.mock.calls[0][0].where.assignedAt;
      expect(window.gte.toISOString()).toBe('2026-06-14T18:30:00.000Z');
    });

    it('is still plain UTC for a clinic on UTC, so Ghana is unchanged', async () => {
      await service.listCheckIns('clinic-1', { date: '2026-03-21' } as never);

      expect(checkInWindow().gte.toISOString()).toBe('2026-03-21T00:00:00.000Z');
      expect(checkInWindow().lte.toISOString()).toBe('2026-03-21T23:59:59.999Z');
    });

    it('falls back to the default zone for a clinic whose timezone is unusable', async () => {
      prisma.clinic.findUnique.mockResolvedValue({ timezone: 'Africa/Akra' });

      const result = await service.listCheckIns('clinic-1', { date: '2026-03-21' } as never);

      // A drifted clinic still answers; the audit CLI is what gets it corrected.
      expect(result.timezone).toBe('Africa/Accra');
      expect(checkInWindow().gte.toISOString()).toBe('2026-03-21T00:00:00.000Z');
    });

    it('resolves “today” in the clinic zone when no date is given', async () => {
      prisma.clinic.findUnique.mockResolvedValue({ timezone: 'Pacific/Auckland' });

      const result = await service.listCheckIns('clinic-1', {} as never);

      const todayInAuckland = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Pacific/Auckland',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date());
      // Auckland is far enough ahead that its date differs from UTC's for part of every day.
      expect(result.date).toBe(todayInAuckland);
    });

    it('asks for the clinic’s zone, rather than assuming one', async () => {
      await service.listCheckIns('clinic-1', { date: '2026-03-21' } as never);

      expect(prisma.clinic.findUnique).toHaveBeenCalledWith({
        where: { id: 'clinic-1' },
        select: { timezone: true },
      });
    });
  });

  describe('replay safety', () => {
    const NOW = new Date('2026-03-21T12:00:00.000Z');
    const SHIFT_ID = '0b9a4a8e-4c1f-4c38-9b2d-6f1f8f0a1c01';
    const CHECKIN_ID = '0b9a4a8e-4c1f-4c38-9b2d-6f1f8f0a1c02';
    const syncMutation = { entityType: 'shift_check_in', entityId: SHIFT_ID, idempotencyKey: 'k1' };
    const replay = (occurredAt: string, ref = syncMutation) => ({
      requestId: 'k1',
      replay: { occurredAt: new Date(occurredAt), syncMutation: ref },
    });
    const shift = (overrides: Record<string, unknown> = {}) => ({
      id: SHIFT_ID,
      clinicId: 'clinic-1',
      userId: 'user-1',
      roleAtShift: 'VOLUNTEER',
      checkedInAt: new Date('2026-03-21T08:00:00.000Z'),
      checkedOutAt: null,
      status: 'ACTIVE',
      notes: null,
      user: { id: 'user-1', displayName: 'Volunteer One' },
      ...overrides,
    });
    const errorBody = async (promise: Promise<unknown>) => {
      try {
        await promise;
      } catch (error) {
        return (error as { getResponse: () => Record<string, unknown> }).getResponse();
      }
      throw new Error('expected a rejection');
    };
    const uniqueViolation = () =>
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      });

    beforeEach(() => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
      jest.setSystemTime(NOW);
    });
    afterEach(() => jest.useRealTimers());

    describe('shift check-in', () => {
      it('creates the shift under the client id, at the time it happened on the device', async () => {
        prisma.staffShift.findUnique.mockResolvedValueOnce(null);

        await service.checkIn(
          'clinic-1',
          'user-1',
          { id: SHIFT_ID, roleAtShift: 'VOLUNTEER' },
          replay('2026-03-21T08:15:00.000Z'),
        );

        expect(prisma.staffShift.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              id: SHIFT_ID,
              checkedInAt: new Date('2026-03-21T08:15:00.000Z'),
            }),
          }),
        );
      });

      it('commits the audit event and the idempotency record with the shift', async () => {
        prisma.staffShift.findUnique.mockResolvedValueOnce(null);

        await service.checkIn(
          'clinic-1',
          'user-1',
          { id: SHIFT_ID, roleAtShift: 'VOLUNTEER' },
          replay('2026-03-21T08:15:00.000Z'),
        );

        expect(auditService.logWrite).toHaveBeenCalledWith(
          expect.objectContaining({ action: 'SHIFT.CHECKIN', requestId: 'k1' }),
          prisma,
        );
        expect(prisma.syncMutation.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            entityType: 'shift_check_in',
            entityId: SHIFT_ID,
            idempotencyKey: 'k1',
            status: 'APPLIED',
          }),
        });
      });

      it('returns the existing shift when the same id already applied, without a second one', async () => {
        prisma.staffShift.findUnique.mockResolvedValueOnce(shift());

        const result = await service.checkIn(
          'clinic-1',
          'user-1',
          { id: SHIFT_ID, roleAtShift: 'VOLUNTEER' },
          replay('2026-03-21T08:15:00.000Z'),
        );

        expect(result.id).toBe(SHIFT_ID);
        expect(prisma.staffShift.create).not.toHaveBeenCalled();
        expect(prisma.syncMutation.create).toHaveBeenCalledTimes(1);
      });

      it('answers an applied replay even after the clinic day has turned', async () => {
        prisma.staffShift.findUnique.mockResolvedValueOnce(shift());

        const result = await service.checkIn(
          'clinic-1',
          'user-1',
          { id: SHIFT_ID, roleAtShift: 'VOLUNTEER' },
          replay('2026-03-20T08:15:00.000Z'),
        );

        expect(result.id).toBe(SHIFT_ID);
      });

      it('refuses an id that names somebody else’s shift', async () => {
        prisma.staffShift.findUnique.mockResolvedValueOnce(shift({ userId: 'someone-else' }));

        await expect(
          service.checkIn('clinic-1', 'user-1', { id: SHIFT_ID, roleAtShift: 'VOLUNTEER' }),
        ).rejects.toThrow(ConflictException);
        expect(prisma.staffShift.create).not.toHaveBeenCalled();
      });

      it('names the shift that is already active', async () => {
        prisma.staffShift.findFirst.mockResolvedValueOnce(shift({ id: 'shift-other' }));

        const body = await errorBody(
          service.checkIn('clinic-1', 'user-1', { roleAtShift: 'VOLUNTEER' }),
        );

        expect(body).toMatchObject({
          code: 'SHIFT_ALREADY_ACTIVE',
          existingShiftId: 'shift-other',
        });
      });

      it('reports a lost race on the active-shift index as an active shift, not a 500', async () => {
        prisma.staffShift.findUnique.mockResolvedValue(null);
        prisma.staffShift.create.mockRejectedValueOnce(uniqueViolation());
        prisma.staffShift.findFirst
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(shift({ id: 'shift-winner' }));

        const body = await errorBody(
          service.checkIn('clinic-1', 'user-1', { id: SHIFT_ID, roleAtShift: 'VOLUNTEER' }),
        );

        expect(body).toMatchObject({
          code: 'SHIFT_ALREADY_ACTIVE',
          existingShiftId: 'shift-winner',
        });
      });

      it('treats a race won by the same id as applied', async () => {
        prisma.staffShift.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(shift());
        prisma.staffShift.create.mockRejectedValueOnce(uniqueViolation());

        const result = await service.checkIn('clinic-1', 'user-1', {
          id: SHIFT_ID,
          roleAtShift: 'VOLUNTEER',
        });

        expect(result.id).toBe(SHIFT_ID);
      });

      it('refuses a replay from an earlier clinic day', async () => {
        prisma.staffShift.findUnique.mockResolvedValueOnce(null);

        const body = await errorBody(
          service.checkIn(
            'clinic-1',
            'user-1',
            { id: SHIFT_ID, roleAtShift: 'VOLUNTEER' },
            replay('2026-03-20T23:30:00.000Z'),
          ),
        );

        expect(body).toMatchObject({ code: 'OPS_REPLAY_EXPIRED' });
        expect(prisma.staffShift.create).not.toHaveBeenCalled();
      });

      it('uses the server clock for a live request', async () => {
        await service.checkIn('clinic-1', 'user-1', { roleAtShift: 'VOLUNTEER' });

        expect(prisma.staffShift.create.mock.calls[0][0].data.checkedInAt).toEqual(NOW);
        expect(prisma.syncMutation.create).not.toHaveBeenCalled();
      });
    });

    describe('shift check-out', () => {
      const checkoutRef = { ...syncMutation, entityType: 'shift_check_out' };

      it('closes the shift at the time it ended on the device', async () => {
        prisma.staffShift.findUnique.mockResolvedValueOnce(shift());

        await service.checkOut(
          'clinic-1',
          SHIFT_ID,
          'user-1',
          replay('2026-03-21T11:00:00.000Z', checkoutRef),
        );

        expect(prisma.staffShift.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: {
              status: 'CLOSED',
              checkedOutAt: new Date('2026-03-21T11:00:00.000Z'),
              stationId: null,
            },
          }),
        );
        expect(prisma.syncMutation.create).toHaveBeenCalledTimes(1);
      });

      it('reports a replay against an already closed shift as applied', async () => {
        prisma.staffShift.findUnique.mockResolvedValueOnce(shift({ status: 'CLOSED' }));

        const result = await service.checkOut(
          'clinic-1',
          SHIFT_ID,
          'user-1',
          replay('2026-03-21T11:00:00.000Z', checkoutRef),
        );

        expect(result.status).toBe('CLOSED');
        expect(prisma.staffShift.update).not.toHaveBeenCalled();
        expect(prisma.syncMutation.create).toHaveBeenCalledTimes(1);
      });

      it('still tells a live request that the shift is already closed', async () => {
        prisma.staffShift.findUnique.mockResolvedValueOnce(shift({ status: 'CLOSED' }));

        const body = await errorBody(service.checkOut('clinic-1', SHIFT_ID, 'user-1'));

        expect(body).toMatchObject({ code: 'SHIFT_ALREADY_CLOSED' });
      });

      it('says which shift is missing with a code a replay can wait on', async () => {
        prisma.staffShift.findUnique.mockResolvedValueOnce(null);

        await expect(service.checkOut('clinic-1', SHIFT_ID, 'user-1')).rejects.toThrow(
          NotFoundException,
        );
        prisma.staffShift.findUnique.mockResolvedValueOnce(null);
        expect(await errorBody(service.checkOut('clinic-1', SHIFT_ID, 'user-1'))).toMatchObject({
          code: 'SHIFT_NOT_FOUND',
        });
      });

      it('refuses an end time before the shift began', async () => {
        prisma.staffShift.findUnique.mockResolvedValueOnce(shift());

        const body = await errorBody(
          service.checkOut(
            'clinic-1',
            SHIFT_ID,
            'user-1',
            replay('2026-03-21T07:00:00.000Z', checkoutRef),
          ),
        );

        expect(body).toMatchObject({ code: 'INVALID_OPS_TIME_ORDER' });
      });

      it('does not let a replay close somebody else’s shift without manager rights', async () => {
        prisma.staffShift.findUnique.mockResolvedValueOnce(shift({ userId: 'someone-else' }));

        await expect(
          service.checkOut(
            'clinic-1',
            SHIFT_ID,
            'user-1',
            replay('2026-03-21T11:00:00.000Z', checkoutRef),
          ),
        ).rejects.toThrow(ForbiddenException);
      });
    });

    describe('patient check-in', () => {
      const checkInRef = {
        entityType: 'patient_check_in',
        entityId: CHECKIN_ID,
        idempotencyKey: 'k1',
      };
      const existingCheckIn = (overrides: Record<string, unknown> = {}) => ({
        id: CHECKIN_ID,
        clinicId: 'clinic-1',
        patientId: 'patient-1',
        checkedInAt: new Date('2026-03-21T09:00:00.000Z'),
        source: 'STAFF',
        status: 'WAITING',
        encounterId: null,
        notes: null,
        patient: { id: 'patient-1', patientCode: 'NKP-1', firstName: 'Ama', lastName: 'Mensah' },
        ...overrides,
      });

      it('refuses a second open check-in for the patient on the same clinic day', async () => {
        prisma.patientCheckIn.findFirst.mockResolvedValueOnce({
          id: 'checkin-open',
          status: 'ASSIGNED',
        });

        const body = await errorBody(
          service.createCheckIn('clinic-1', 'user-1', { patientId: 'patient-1' }),
        );

        expect(body).toMatchObject({
          code: 'PATIENT_ALREADY_CHECKED_IN',
          existingCheckInId: 'checkin-open',
          existingStatus: 'ASSIGNED',
        });
        expect(prisma.patientCheckIn.create).not.toHaveBeenCalled();
      });

      it('looks for open check-ins only within the clinic day of the arrival', async () => {
        await service.createCheckIn('clinic-1', 'user-1', { patientId: 'patient-1' });

        expect(prisma.patientCheckIn.findFirst).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              patientId: 'patient-1',
              status: { in: ['WAITING', 'ASSIGNED', 'IN_PROGRESS'] },
              checkedInAt: {
                gte: new Date('2026-03-21T00:00:00.000Z'),
                lte: new Date('2026-03-21T23:59:59.999Z'),
              },
            }),
          }),
        );
      });

      it('serializes the check and the insert per patient', async () => {
        await service.createCheckIn('clinic-1', 'user-1', { patientId: 'patient-1' });

        expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
        const order = [
          prisma.$executeRaw.mock.invocationCallOrder[0],
          prisma.patientCheckIn.findFirst.mock.invocationCallOrder[0],
          prisma.patientCheckIn.create.mock.invocationCallOrder[0],
        ];
        expect([...order].sort((a, b) => a - b)).toEqual(order);
      });

      it('returns the existing check-in when the same id is replayed', async () => {
        prisma.patientCheckIn.findUnique.mockResolvedValueOnce(existingCheckIn());

        const result = await service.createCheckIn(
          'clinic-1',
          'user-1',
          { id: CHECKIN_ID, patientId: 'patient-1' },
          replay('2026-03-21T09:00:00.000Z', checkInRef),
        );

        expect(result.id).toBe(CHECKIN_ID);
        expect(prisma.patientCheckIn.create).not.toHaveBeenCalled();
        expect(prisma.syncMutation.create).toHaveBeenCalledTimes(1);
      });

      it('refuses an id that already names a different patient’s check-in', async () => {
        prisma.patientCheckIn.findUnique.mockResolvedValueOnce(
          existingCheckIn({ patientId: 'patient-2' }),
        );

        await expect(
          service.createCheckIn('clinic-1', 'user-1', { id: CHECKIN_ID, patientId: 'patient-1' }),
        ).rejects.toThrow(ConflictException);
      });

      it('creates under the client id at the device time', async () => {
        prisma.patientCheckIn.findUnique.mockResolvedValueOnce(null);

        await service.createCheckIn(
          'clinic-1',
          'user-1',
          { id: CHECKIN_ID, patientId: 'patient-1' },
          replay('2026-03-21T09:30:00.000Z', checkInRef),
        );

        expect(prisma.patientCheckIn.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              id: CHECKIN_ID,
              checkedInAt: new Date('2026-03-21T09:30:00.000Z'),
            }),
          }),
        );
      });

      it('refuses to check in a chart that was merged away', async () => {
        prisma.patient.findFirst.mockResolvedValueOnce({
          id: 'patient-1',
          mergedIntoPatientId: 'patient-canonical',
        });

        const body = await errorBody(
          service.createCheckIn('clinic-1', 'user-1', { patientId: 'patient-1' }),
        );

        expect(body).toMatchObject({
          code: 'PATIENT_MERGED',
          canonicalPatientId: 'patient-canonical',
        });
      });
    });
  });
});
