import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { OpsService } from './ops.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

function createPrismaMock() {
  const prisma = {
    clinic: {
      findFirst: jest.fn().mockResolvedValue({ id: 'clinic-1' }),
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

  beforeEach(async () => {
    prisma = createPrismaMock();
    auditService = { logWrite: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OpsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: auditService },
      ],
    }).compile();

    service = module.get(OpsService);
  });

  it('checks staff in and audits the shift', async () => {
    const result = await service.checkIn(
      'clinic-1',
      'user-1',
      { roleAtShift: 'VOLUNTEER' as const },
      'req-1',
    );

    expect(result.id).toBe('shift-1');
    expect(prisma.staffShift.create).toHaveBeenCalled();
    expect(auditService.logWrite).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'SHIFT.CHECKIN', entityId: 'shift-1' }),
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
      service.checkIn('clinic-1', 'user-1', { roleAtShift: 'VOLUNTEER' as const }, 'req-1'),
    ).rejects.toThrow(ConflictException);
  });

  it('rejects invalid shift roles for the actor', async () => {
    prisma.userClinicRole.findFirst.mockResolvedValueOnce(null);

    await expect(
      service.checkIn('clinic-1', 'user-1', { roleAtShift: 'MANAGER' as const }, 'req-1'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('checks staff out successfully', async () => {
    const result = await service.checkOut('clinic-1', 'shift-1', 'user-1', 'req-1');

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
      'req-1',
    );

    expect(result.status).toBe('WAITING');
    expect(prisma.patientCheckIn.create).toHaveBeenCalled();
    expect(auditService.logWrite).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CHECKIN.CREATE', entityId: 'checkin-1' }),
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
});
