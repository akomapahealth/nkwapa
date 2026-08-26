import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { AppointmentRequestStatus, AppointmentStatus } from '@prisma/client';
import { PatientPortalService } from './patient-portal.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ReminderService } from '../reminders/reminder.service';
import { EmailDeliverabilityService } from '../common/email-policy';
import {
  APPOINTMENT_REQUEST_STATUSES,
  APPOINTMENT_REQUEST_TRANSITIONS,
  APPOINTMENT_TRANSITIONS,
  appointmentRequestTransitionMatrix,
  appointmentTransitionMatrix,
  transitionFor,
  type AppointmentLifecycleAction,
} from '../testing/appointment-lifecycle';
import {
  FIXTURE_ACTOR_ID,
  FIXTURE_APPOINTMENT_ID,
  FIXTURE_CLINIC_ID,
  FIXTURE_OTHER_CLINIC_ID,
  FIXTURE_PAST_START,
  FIXTURE_REQUEST_ID,
  appointmentFixture,
  appointmentRequestFixture,
  createAppointmentCollaboratorMocks,
  createAppointmentPrismaMock,
  portalPatientFixture,
  type AppointmentCollaboratorMocks,
  type AppointmentPrismaMock,
} from '../testing/appointment-fixtures';

/**
 * The appointment lifecycle, asserted against the table that describes it.
 *
 * The existing service spec covers each mutation once on its happy path. What it cannot show is
 * what happens to every other state: a transition matrix that only lists what is allowed says
 * nothing about what the system does with the rest. Every refusal here also asserts that nothing
 * was written, nothing was audited, and no reminder moved, because a mutation that half-applies and
 * then rejects is worse than one that rejects cleanly.
 */

const REQUEST_ID = 'req-lifecycle-1';

/** A start time already in the past, so `complete` and `no-show` are not blocked by their gate. */
const STARTED = {
  startsAt: FIXTURE_PAST_START,
  endsAt: new Date(FIXTURE_PAST_START.getTime() + 30 * 60_000),
};

describe('appointment lifecycle', () => {
  let service: PatientPortalService;
  let prisma: AppointmentPrismaMock;
  let collaborators: AppointmentCollaboratorMocks;

  beforeEach(async () => {
    prisma = createAppointmentPrismaMock();
    collaborators = createAppointmentCollaboratorMocks();

    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      keycloakSub: 'kc-sub-1',
      isActive: true,
    });
    prisma.patientAccountLink.findFirst.mockResolvedValue({ patient: portalPatientFixture });
    prisma.clinic.findUnique.mockResolvedValue({ name: 'Clinic One' });
    prisma.appointment.findFirst.mockResolvedValue(null);
    prisma.appointment.updateMany.mockResolvedValue({ count: 1 });
    prisma.appointmentRequest.findFirst.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PatientPortalService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: collaborators.auditService },
        { provide: ReminderService, useValue: collaborators.reminderService },
        {
          provide: EmailDeliverabilityService,
          useValue: collaborators.emailDeliverabilityService,
        },
      ],
    }).compile();

    service = module.get(PatientPortalService);
  });

  /** Invoke one lifecycle action with the minimum valid body for it. */
  function invoke(action: AppointmentLifecycleAction, clinicId = FIXTURE_CLINIC_ID) {
    switch (action) {
      case 'reschedule':
        return service.rescheduleAppointment(
          clinicId,
          FIXTURE_APPOINTMENT_ID,
          FIXTURE_ACTOR_ID,
          { startsAt: '2099-04-02T10:00:00.000Z', endsAt: '2099-04-02T10:30:00.000Z' },
          REQUEST_ID,
        );
      case 'cancel':
        return service.cancelAppointment(
          clinicId,
          FIXTURE_APPOINTMENT_ID,
          FIXTURE_ACTOR_ID,
          { reason: 'Clinic closed' },
          REQUEST_ID,
        );
      case 'complete':
        return service.completeAppointment(
          clinicId,
          FIXTURE_APPOINTMENT_ID,
          FIXTURE_ACTOR_ID,
          {},
          REQUEST_ID,
        );
      case 'no-show':
        return service.markAppointmentNoShow(
          clinicId,
          FIXTURE_APPOINTMENT_ID,
          FIXTURE_ACTOR_ID,
          {},
          REQUEST_ID,
        );
    }
  }

  function expectNothingHappened() {
    expect(prisma.appointment.updateMany).not.toHaveBeenCalled();
    expect(prisma.appointment.create).not.toHaveBeenCalled();
    expect(collaborators.auditService.logWrite).not.toHaveBeenCalled();
    expect(collaborators.reminderService.suppressQueuedAppointmentReminders).not.toHaveBeenCalled();
    expect(collaborators.reminderService.scheduleAppointmentReminder).not.toHaveBeenCalled();
  }

  describe.each(appointmentTransitionMatrix().map((row) => [row.status, row.action, row.allowed]))(
    '%s + %s',
    (status, action, allowed) => {
      beforeEach(() => {
        const current = appointmentFixture({ ...STARTED, status });
        prisma.appointment.findFirst.mockResolvedValue(current);
        prisma.appointment.updateMany.mockImplementation(async () => {
          prisma.appointment.findFirst.mockResolvedValue(
            appointmentFixture({ ...STARTED, status: transitionFor(action).toStatus }),
          );
          return { count: 1 };
        });
      });

      if (allowed) {
        it('applies the transition and records it', async () => {
          const transition = transitionFor(action);

          const result = await invoke(action);

          expect(result.status).toBe(transition.toStatus);
          expect(prisma.appointment.updateMany).toHaveBeenCalledWith(
            expect.objectContaining({
              where: expect.objectContaining({
                id: FIXTURE_APPOINTMENT_ID,
                clinicId: FIXTURE_CLINIC_ID,
                // The write is guarded on the source status, so a concurrent transition loses.
                status: AppointmentStatus.CONFIRMED,
              }),
            }),
          );
          expect(collaborators.auditService.logWrite).toHaveBeenCalledWith(
            expect.objectContaining({
              action: transition.auditAction,
              entityType: 'Appointment',
              entityId: FIXTURE_APPOINTMENT_ID,
              clinicId: FIXTURE_CLINIC_ID,
              actorUserId: FIXTURE_ACTOR_ID,
              requestId: REQUEST_ID,
            }),
          );
          expect(
            collaborators.reminderService.suppressQueuedAppointmentReminders,
          ).toHaveBeenCalledWith(
            FIXTURE_CLINIC_ID,
            FIXTURE_APPOINTMENT_ID,
            FIXTURE_ACTOR_ID,
            transition.reminderSuppressionReason,
            REQUEST_ID,
          );
          if (transition.schedulesReminder) {
            expect(collaborators.reminderService.scheduleAppointmentReminder).toHaveBeenCalled();
          } else {
            expect(
              collaborators.reminderService.scheduleAppointmentReminder,
            ).not.toHaveBeenCalled();
          }
        });
      } else {
        it('refuses the transition and changes nothing', async () => {
          await expect(invoke(action)).rejects.toBeInstanceOf(BadRequestException);
          expectNothingHappened();
        });

        it('names the current status, the attempted action, and what is allowed', async () => {
          const error = await invoke(action).catch((err: BadRequestException) => err);
          const response = (error as BadRequestException).getResponse() as Record<string, unknown>;

          expect(response).toMatchObject({
            code: 'APPOINTMENT_INVALID_TRANSITION',
            currentStatus: status,
            attemptedAction: action,
            allowedSourceStatuses: [AppointmentStatus.CONFIRMED],
          });
          expect(response.recoveryAction).toEqual(expect.any(String));
        });
      }
    },
  );

  describe('the start-time gate', () => {
    const future = appointmentFixture({
      status: AppointmentStatus.CONFIRMED,
      startsAt: new Date('2099-03-26T14:00:00.000Z'),
      endsAt: new Date('2099-03-26T14:30:00.000Z'),
    });

    const gated = APPOINTMENT_TRANSITIONS.filter((t) => t.requiresStarted).map((t) => t.action);
    const ungated = APPOINTMENT_TRANSITIONS.filter((t) => !t.requiresStarted).map((t) => t.action);

    it.each(gated)('refuses %s before the appointment starts', async (action) => {
      prisma.appointment.findFirst.mockResolvedValue(future);

      const error = await invoke(action).catch((err: BadRequestException) => err);
      const response = (error as BadRequestException).getResponse() as Record<string, unknown>;

      expect(response).toMatchObject({
        code: 'APPOINTMENT_ACTION_TOO_EARLY',
        attemptedAction: action,
        appointmentId: FIXTURE_APPOINTMENT_ID,
        clinicId: FIXTURE_CLINIC_ID,
      });
      expectNothingHappened();
    });

    it.each(ungated)('allows %s before the appointment starts', async (action) => {
      prisma.appointment.findFirst.mockResolvedValue(future);
      prisma.appointment.updateMany.mockImplementation(async () => {
        prisma.appointment.findFirst.mockResolvedValue(
          appointmentFixture({ status: transitionFor(action).toStatus }),
        );
        return { count: 1 };
      });

      await expect(invoke(action)).resolves.toBeDefined();
    });
  });

  describe('concurrency', () => {
    it.each(APPOINTMENT_TRANSITIONS.map((t) => t.action))(
      'reports %s as an invalid transition when another writer got there first',
      async (action) => {
        prisma.appointment.findFirst.mockResolvedValue(
          appointmentFixture({ ...STARTED, status: AppointmentStatus.CONFIRMED }),
        );
        // The status-guarded updateMany matches nothing because the row moved mid-flight.
        prisma.appointment.updateMany.mockResolvedValue({ count: 0 });

        const error = await invoke(action).catch((err: BadRequestException) => err);

        expect(error).toBeInstanceOf(BadRequestException);
        expect((error as BadRequestException).getResponse()).toMatchObject({
          code: 'APPOINTMENT_INVALID_TRANSITION',
          attemptedAction: action,
        });
        // A partial apply is the failure mode this guards: the audit must not claim it happened.
        expect(collaborators.auditService.logWrite).not.toHaveBeenCalled();
        expect(
          collaborators.reminderService.suppressQueuedAppointmentReminders,
        ).not.toHaveBeenCalled();
      },
    );
  });

  describe('validation runs before any write', () => {
    beforeEach(() => {
      prisma.appointment.findFirst.mockResolvedValue(
        appointmentFixture({ ...STARTED, status: AppointmentStatus.CONFIRMED }),
      );
    });

    it('rejects a reschedule that ends before it starts', async () => {
      await expect(
        service.rescheduleAppointment(
          FIXTURE_CLINIC_ID,
          FIXTURE_APPOINTMENT_ID,
          FIXTURE_ACTOR_ID,
          { startsAt: '2099-04-02T11:00:00.000Z', endsAt: '2099-04-02T10:00:00.000Z' },
          REQUEST_ID,
        ),
      ).rejects.toThrow('endsAt must be after startsAt');
      expectNothingHappened();
    });

    it('rejects a reschedule with an unparseable time', async () => {
      await expect(
        service.rescheduleAppointment(
          FIXTURE_CLINIC_ID,
          FIXTURE_APPOINTMENT_ID,
          FIXTURE_ACTOR_ID,
          { startsAt: 'not-a-date', endsAt: '2099-04-02T10:30:00.000Z' },
          REQUEST_ID,
        ),
      ).rejects.toThrow('startsAt must be a valid date');
      expectNothingHappened();
    });

    it.each([undefined, '', '   '])('rejects a cancellation with reason %p', async (reason) => {
      const error = await service
        .cancelAppointment(
          FIXTURE_CLINIC_ID,
          FIXTURE_APPOINTMENT_ID,
          FIXTURE_ACTOR_ID,
          { reason } as { reason: string },
          REQUEST_ID,
        )
        .catch((err: BadRequestException) => err);

      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: 'VALIDATION_ERROR',
        fieldErrors: [{ field: 'reason', message: 'reason should not be empty' }],
      });
      expectNothingHappened();
    });

    it('refuses an assignee who does not hold the seat at this clinic', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'doctor-9' });
      prisma.userClinicRole.findFirst.mockResolvedValue(null);

      await expect(
        service.rescheduleAppointment(
          FIXTURE_CLINIC_ID,
          FIXTURE_APPOINTMENT_ID,
          FIXTURE_ACTOR_ID,
          {
            startsAt: '2099-04-02T10:00:00.000Z',
            endsAt: '2099-04-02T10:30:00.000Z',
            assignedDoctorId: 'doctor-9',
          },
          REQUEST_ID,
        ),
      ).rejects.toThrow('Assigned appointment user is not a doctor in this clinic');
      expectNothingHappened();
    });

    it('refuses an assignee who is inactive', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.userClinicRole.findFirst.mockResolvedValue({ id: 'role-1' });

      await expect(
        service.rescheduleAppointment(
          FIXTURE_CLINIC_ID,
          FIXTURE_APPOINTMENT_ID,
          FIXTURE_ACTOR_ID,
          {
            startsAt: '2099-04-02T10:00:00.000Z',
            endsAt: '2099-04-02T10:30:00.000Z',
            assignedVolunteerId: 'volunteer-9',
          },
          REQUEST_ID,
        ),
      ).rejects.toThrow('Assigned appointment staff member does not exist or is inactive');
      expectNothingHappened();
    });
  });

  describe('clinic isolation', () => {
    it.each(APPOINTMENT_TRANSITIONS.map((t) => t.action))(
      'scopes the %s lookup to the calling clinic',
      async (action) => {
        // The row exists, but not at the clinic the caller was admitted to.
        prisma.appointment.findFirst.mockResolvedValue(null);

        await expect(invoke(action, FIXTURE_OTHER_CLINIC_ID)).rejects.toBeInstanceOf(
          NotFoundException,
        );
        expect(prisma.appointment.findFirst).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({ clinicId: FIXTURE_OTHER_CLINIC_ID }),
          }),
        );
        expectNothingHappened();
      },
    );
  });

  describe('request transitions', () => {
    const confirmDto = {
      startsAt: '2099-04-02T10:00:00.000Z',
      endsAt: '2099-04-02T10:30:00.000Z',
    };

    function invokeRequest(action: 'confirm' | 'reject') {
      return action === 'confirm'
        ? service.confirmAppointmentRequest(
            FIXTURE_CLINIC_ID,
            FIXTURE_REQUEST_ID,
            FIXTURE_ACTOR_ID,
            confirmDto,
            REQUEST_ID,
          )
        : service.rejectAppointmentRequest(
            FIXTURE_CLINIC_ID,
            FIXTURE_REQUEST_ID,
            FIXTURE_ACTOR_ID,
            { reason: 'No capacity that week' },
            REQUEST_ID,
          );
    }

    describe.each(
      appointmentRequestTransitionMatrix().map((row) => [row.status, row.action, row.allowed]),
    )('%s + %s', (status, action, allowed) => {
      beforeEach(() => {
        prisma.appointmentRequest.findFirst.mockResolvedValue(
          appointmentRequestFixture({ status }),
        );
        prisma.appointment.create.mockResolvedValue(
          appointmentFixture({ status: AppointmentStatus.CONFIRMED }),
        );
        prisma.appointmentRequest.update.mockImplementation(async ({ data }) =>
          appointmentRequestFixture({ ...data }),
        );
      });

      if (allowed) {
        it('applies the transition and records it', async () => {
          const transition = APPOINTMENT_REQUEST_TRANSITIONS.find((t) => t.action === action)!;

          await invokeRequest(action);

          expect(prisma.appointmentRequest.update).toHaveBeenCalledWith(
            expect.objectContaining({
              where: { id: FIXTURE_REQUEST_ID },
              data: expect.objectContaining({
                status: transition.toStatus,
                triagedByUserId: FIXTURE_ACTOR_ID,
              }),
            }),
          );
          expect(collaborators.auditService.logWrite).toHaveBeenCalledWith(
            expect.objectContaining({
              action: transition.auditAction,
              entityType: 'AppointmentRequest',
              requestId: REQUEST_ID,
            }),
          );
          if (transition.createsAppointmentAuditAction) {
            expect(collaborators.auditService.logWrite).toHaveBeenCalledWith(
              expect.objectContaining({
                action: transition.createsAppointmentAuditAction,
                entityType: 'Appointment',
              }),
            );
          }
        });
      } else {
        it('refuses the transition and changes nothing', async () => {
          await expect(invokeRequest(action)).rejects.toBeInstanceOf(BadRequestException);
          expect(prisma.appointmentRequest.update).not.toHaveBeenCalled();
          expect(prisma.appointment.create).not.toHaveBeenCalled();
          expect(collaborators.auditService.logWrite).not.toHaveBeenCalled();
        });
      }
    });

    it('refuses to confirm a request that already has an appointment', async () => {
      prisma.appointmentRequest.findFirst.mockResolvedValue(
        appointmentRequestFixture({
          status: AppointmentRequestStatus.REQUESTED,
          appointment: appointmentFixture(),
        }),
      );

      await expect(invokeRequest('confirm')).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.appointment.create).not.toHaveBeenCalled();
      expect(collaborators.auditService.logWrite).not.toHaveBeenCalled();
    });

    it.each(['confirm', 'reject'] as const)(
      'reports a missing request as not found for %s',
      async (action) => {
        prisma.appointmentRequest.findFirst.mockResolvedValue(null);

        await expect(invokeRequest(action)).rejects.toBeInstanceOf(NotFoundException);
        expect(prisma.appointmentRequest.findFirst).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: FIXTURE_REQUEST_ID, clinicId: FIXTURE_CLINIC_ID },
          }),
        );
      },
    );

    it('refuses a confirmation that ends before it starts', async () => {
      prisma.appointmentRequest.findFirst.mockResolvedValue(
        appointmentRequestFixture({ status: AppointmentRequestStatus.REQUESTED }),
      );

      await expect(
        service.confirmAppointmentRequest(
          FIXTURE_CLINIC_ID,
          FIXTURE_REQUEST_ID,
          FIXTURE_ACTOR_ID,
          { startsAt: '2099-04-02T11:00:00.000Z', endsAt: '2099-04-02T10:00:00.000Z' },
          REQUEST_ID,
        ),
      ).rejects.toThrow('endsAt must be after startsAt');
      expect(prisma.appointment.create).not.toHaveBeenCalled();
    });

    it('covers every request status the schema allows', () => {
      // A status added to the enum without a decision here would otherwise go untested.
      expect(APPOINTMENT_REQUEST_STATUSES).toEqual(
        expect.arrayContaining(Object.values(AppointmentRequestStatus)),
      );
      expect(APPOINTMENT_REQUEST_STATUSES).toHaveLength(
        Object.values(AppointmentRequestStatus).length,
      );
    });
  });

  describe('the whole workflow, end to end', () => {
    it('carries one request from creation through confirmation to a terminal state', async () => {
      // 1. The patient opens a request.
      prisma.appointmentRequest.create.mockResolvedValue(
        appointmentRequestFixture({ status: AppointmentRequestStatus.REQUESTED }),
      );
      const created = await service.createAppointmentRequestForAuthenticatedPatient(
        FIXTURE_CLINIC_ID,
        'user-1',
        { preferredStartDate: '2099-04-01', preferredEndDate: '2099-04-05' },
        REQUEST_ID,
      );
      expect(created.status).toBe(AppointmentRequestStatus.REQUESTED);
      expect(collaborators.auditService.logWrite).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'APPT.REQUEST.CREATE' }),
      );

      // 2. Staff confirm it, which creates the appointment and schedules the first reminder.
      prisma.appointmentRequest.findFirst.mockResolvedValue(
        appointmentRequestFixture({ status: AppointmentRequestStatus.REQUESTED }),
      );
      prisma.appointment.create.mockResolvedValue(
        appointmentFixture({ status: AppointmentStatus.CONFIRMED }),
      );
      prisma.appointmentRequest.update.mockResolvedValue(
        appointmentRequestFixture({ status: AppointmentRequestStatus.CONFIRMED }),
      );
      const confirmed = await service.confirmAppointmentRequest(
        FIXTURE_CLINIC_ID,
        FIXTURE_REQUEST_ID,
        FIXTURE_ACTOR_ID,
        { startsAt: '2099-04-02T10:00:00.000Z', endsAt: '2099-04-02T10:30:00.000Z' },
        REQUEST_ID,
      );
      expect(confirmed.appointment.status).toBe(AppointmentStatus.CONFIRMED);
      expect(collaborators.reminderService.scheduleAppointmentReminder).toHaveBeenCalledTimes(1);

      // 3. Staff reschedule it: the queued reminder is suppressed and a new one is scheduled.
      prisma.appointment.findFirst.mockResolvedValue(
        appointmentFixture({ ...STARTED, status: AppointmentStatus.CONFIRMED }),
      );
      await service.rescheduleAppointment(
        FIXTURE_CLINIC_ID,
        FIXTURE_APPOINTMENT_ID,
        FIXTURE_ACTOR_ID,
        { startsAt: '2099-04-09T10:00:00.000Z', endsAt: '2099-04-09T10:30:00.000Z' },
        REQUEST_ID,
      );
      expect(collaborators.reminderService.suppressQueuedAppointmentReminders).toHaveBeenCalledWith(
        FIXTURE_CLINIC_ID,
        FIXTURE_APPOINTMENT_ID,
        FIXTURE_ACTOR_ID,
        'APPOINTMENT_RESCHEDULED',
        REQUEST_ID,
      );
      expect(collaborators.reminderService.scheduleAppointmentReminder).toHaveBeenCalledTimes(2);

      // 4. Staff complete it once it has started.
      prisma.appointment.updateMany.mockImplementation(async () => {
        prisma.appointment.findFirst.mockResolvedValue(
          appointmentFixture({ ...STARTED, status: AppointmentStatus.COMPLETED }),
        );
        return { count: 1 };
      });
      const completed = await service.completeAppointment(
        FIXTURE_CLINIC_ID,
        FIXTURE_APPOINTMENT_ID,
        FIXTURE_ACTOR_ID,
        { notes: 'Reviewed home readings' },
        REQUEST_ID,
      );
      expect(completed.status).toBe(AppointmentStatus.COMPLETED);

      // 5. Nothing further is possible.
      await expect(
        service.cancelAppointment(
          FIXTURE_CLINIC_ID,
          FIXTURE_APPOINTMENT_ID,
          FIXTURE_ACTOR_ID,
          { reason: 'Too late' },
          REQUEST_ID,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('patient change requests', () => {
    it('records the request without touching the appointment', async () => {
      prisma.appointment.findFirst.mockResolvedValue(
        appointmentFixture({
          status: AppointmentStatus.CONFIRMED,
          startsAt: new Date('2099-03-26T14:00:00.000Z'),
        }),
      );
      prisma.appointmentRequest.create.mockResolvedValue(
        appointmentRequestFixture({ requestType: 'CANCEL_APPOINTMENT' }),
      );

      await service.createCancelAppointmentRequestForAuthenticatedPatient(
        FIXTURE_CLINIC_ID,
        'user-1',
        FIXTURE_APPOINTMENT_ID,
        { reason: 'Travelling that week' },
        REQUEST_ID,
      );

      expect(prisma.appointment.updateMany).not.toHaveBeenCalled();
      expect(collaborators.auditService.logWrite).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'APPT.REQUEST.CANCEL_REQUEST.CREATE' }),
      );
    });

    it.each(
      Object.values(AppointmentStatus).filter((status) => status !== AppointmentStatus.CONFIRMED),
    )('refuses a change request against a %s appointment', async (status) => {
      prisma.appointment.findFirst.mockResolvedValue(
        appointmentFixture({ status, startsAt: new Date('2099-03-26T14:00:00.000Z') }),
      );

      const error = await service
        .createCancelAppointmentRequestForAuthenticatedPatient(
          FIXTURE_CLINIC_ID,
          'user-1',
          FIXTURE_APPOINTMENT_ID,
          { reason: 'Travelling that week' },
          REQUEST_ID,
        )
        .catch((err: BadRequestException) => err);

      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: 'APPOINTMENT_CHANGE_REQUEST_NOT_ALLOWED',
        currentStatus: status,
      });
      expect(prisma.appointmentRequest.create).not.toHaveBeenCalled();
    });

    it('refuses a change request against an appointment that has already started', async () => {
      prisma.appointment.findFirst.mockResolvedValue(
        appointmentFixture({ ...STARTED, status: AppointmentStatus.CONFIRMED }),
      );

      const error = await service
        .createRescheduleAppointmentRequestForAuthenticatedPatient(
          FIXTURE_CLINIC_ID,
          'user-1',
          FIXTURE_APPOINTMENT_ID,
          { preferredStartDate: '2099-05-01', preferredEndDate: '2099-05-05' },
          REQUEST_ID,
        )
        .catch((err: BadRequestException) => err);

      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: 'APPOINTMENT_CHANGE_REQUEST_TOO_LATE',
      });
      expect(prisma.appointmentRequest.create).not.toHaveBeenCalled();
    });
  });
});
