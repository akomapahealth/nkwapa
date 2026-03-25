import { Test, TestingModule } from '@nestjs/testing';
import { EncounterService } from './encounter.service';
import { EncounterRepository } from './encounter.repository';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ReminderService } from '../reminders/reminder.service';

describe('EncounterService', () => {
  let service: EncounterService;
  let encounterRepository: {
    findById: jest.Mock;
    setDoctorFinalized: jest.Mock;
  };
  let prisma: {
    patientCheckIn: {
      findFirst: jest.Mock;
      update: jest.Mock;
    };
    carePlan: {
      findUnique: jest.Mock;
    };
  };
  let auditService: { logWrite: jest.Mock };

  beforeEach(async () => {
    encounterRepository = {
      findById: jest.fn().mockResolvedValue({
        id: 'enc-1',
        clinicId: 'clinic-1',
        patientId: 'patient-1',
        status: 'IN_REVIEW',
        preceptorReviewedById: 'preceptor-1',
      }),
      setDoctorFinalized: jest.fn().mockResolvedValue({
        id: 'enc-1',
        clinicId: 'clinic-1',
        patientId: 'patient-1',
        status: 'FINALIZED',
        preceptorReviewedById: 'preceptor-1',
        doctorFinalizedById: 'doctor-1',
      }),
    };

    prisma = {
      patientCheckIn: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'checkin-1',
          encounterId: 'enc-1',
          status: 'IN_PROGRESS',
        }),
        update: jest.fn().mockResolvedValue({
          id: 'checkin-1',
          encounterId: 'enc-1',
          status: 'COMPLETED',
        }),
      },
      carePlan: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };

    auditService = { logWrite: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EncounterService,
        { provide: EncounterRepository, useValue: encounterRepository },
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: auditService },
        {
          provide: ReminderService,
          useValue: {
            scheduleFollowUpReminder: jest.fn(),
            scheduleFollowUpReminderNoContact: jest.fn(),
            scheduleFollowUpEmailReminder: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(EncounterService);
  });

  it('marks a linked patient check-in completed when the encounter is finalized', async () => {
    const result = await service.finalize('enc-1', 'doctor-1', {
      clinicId: 'clinic-1',
      actorUserId: 'doctor-1',
      requestId: 'req-1',
    });

    expect(result.status).toBe('FINALIZED');
    expect(prisma.patientCheckIn.update).toHaveBeenCalledWith({
      where: { id: 'checkin-1' },
      data: { status: 'COMPLETED' },
    });
    expect(auditService.logWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CHECKIN.STATUS.UPDATE',
        entityId: 'checkin-1',
      })
    );
  });
});
