import { AppointmentStatus } from '@prisma/client';
import { ReminderService } from './reminder.service';
import {
  APPOINTMENT_TRANSITIONS,
  transitionFor,
  type AppointmentLifecycleAction,
} from '../testing/appointment-lifecycle';
import {
  FIXTURE_ACTOR_ID,
  FIXTURE_APPOINTMENT_ID,
  FIXTURE_CLINIC_ID,
  FIXTURE_PATIENT_ID,
  appointmentReminderFixture,
} from '../testing/appointment-fixtures';

/**
 * What the appointment lifecycle does to a reminder.
 *
 * A reminder is queued the moment a request is confirmed and sits in the queue for up to a day.
 * Every lifecycle action that happens in that window invalidates it, and the failure mode is a
 * patient being told to attend a visit that was cancelled. This suite asserts both defences: the
 * suppression at mutation time, and the re-check at send time that catches a job which escaped it.
 */

const REQUEST_ID = 'req-reminder-1';
const SCHEDULE_PARAMS = {
  clinicId: FIXTURE_CLINIC_ID,
  clinicName: 'Clinic One',
  patientId: FIXTURE_PATIENT_ID,
  patientCode: 'NKP-2026-000001',
  appointmentId: FIXTURE_APPOINTMENT_ID,
  startsAt: new Date('2099-03-26T14:00:00.000Z'),
  actorUserId: FIXTURE_ACTOR_ID,
  requestId: REQUEST_ID,
};

describe('appointment reminders across the lifecycle', () => {
  let prisma: {
    reminder: {
      create: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    appointment: { findFirst: jest.Mock };
  };
  let auditService: { logWrite: jest.Mock };
  let smsProvider: { send: jest.Mock };
  let emailProvider: { send: jest.Mock };
  let reminderQueue: { add: jest.Mock; getJob: jest.Mock };
  let removeJob: jest.Mock;
  let service: ReminderService;

  beforeEach(() => {
    prisma = {
      reminder: {
        create: jest.fn(async ({ data }) =>
          appointmentReminderFixture({ ...data, id: 'reminder-1' }),
        ),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(async ({ where, data }) =>
          appointmentReminderFixture({ id: where.id, ...data }),
        ),
      },
      appointment: { findFirst: jest.fn() },
    };
    auditService = { logWrite: jest.fn().mockResolvedValue(undefined) };
    smsProvider = {
      send: jest.fn().mockResolvedValue({ success: true, providerMessageId: 'sms-1' }),
    };
    emailProvider = {
      send: jest.fn().mockResolvedValue({ success: true, providerMessageId: 'email-1' }),
    };
    removeJob = jest.fn().mockResolvedValue(undefined);
    reminderQueue = {
      add: jest.fn().mockResolvedValue({ id: 'reminder-reminder-1' }),
      getJob: jest.fn().mockResolvedValue({ remove: removeJob }),
    };
    service = new ReminderService(
      prisma as never,
      auditService as never,
      smsProvider,
      emailProvider,
      reminderQueue as never,
    );
  });

  describe('scheduling when a request is confirmed', () => {
    it('queues an SMS reminder a day before the visit', async () => {
      await service.scheduleAppointmentReminder({
        ...SCHEDULE_PARAMS,
        phoneE164: '+233240000000',
      });

      const created = prisma.reminder.create.mock.calls[0][0].data;
      expect(created).toMatchObject({
        clinicId: FIXTURE_CLINIC_ID,
        appointmentId: FIXTURE_APPOINTMENT_ID,
        channel: 'SMS',
        toAddress: '+233240000000',
        templateKey: 'APPOINTMENT_REMINDER_V1',
        status: 'QUEUED',
      });
      expect(created.scheduledAt).toEqual(new Date('2099-03-25T14:00:00.000Z'));
      // The payload carries the start time so a later reschedule can be detected at send time.
      expect(JSON.parse(created.payloadJson)).toMatchObject({
        appointmentId: FIXTURE_APPOINTMENT_ID,
        startsAt: '2099-03-26T14:00:00.000Z',
      });
      expect(auditService.logWrite).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'REMINDER.CREATE', requestId: REQUEST_ID }),
      );
    });

    it('queues an email reminder on the same schedule', async () => {
      await service.scheduleAppointmentEmailReminder({
        ...SCHEDULE_PARAMS,
        email: 'ama@example.com',
      });

      expect(prisma.reminder.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          channel: 'EMAIL',
          toAddress: 'ama@example.com',
          status: 'QUEUED',
        }),
      });
    });

    it('sends immediately when the visit is already inside the reminder window', async () => {
      // A visit confirmed for tomorrow morning cannot get a reminder 24 hours ago.
      const soon = new Date(Date.now() + 60 * 60 * 1000);
      const before = Date.now();

      await service.scheduleAppointmentReminder({
        ...SCHEDULE_PARAMS,
        startsAt: soon,
        phoneE164: '+233240000000',
      });

      const scheduledAt = prisma.reminder.create.mock.calls[0][0].data.scheduledAt as Date;
      expect(scheduledAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(scheduledAt.getTime()).toBeLessThanOrEqual(Date.now());
    });

    it('records a visible failure rather than nothing when there is no way to reach the patient', async () => {
      await service.scheduleAppointmentReminderNoContact(SCHEDULE_PARAMS);

      expect(prisma.reminder.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          status: 'FAILED',
          failureReason: 'NO_CONTACT_METHOD',
          toAddress: 'N/A',
        }),
      });
      // Nothing is queued, but the row exists so staff can see the patient was never told.
      expect(reminderQueue.add).not.toHaveBeenCalled();
      expect(auditService.logWrite).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'REMINDER.CREATE' }),
      );
    });

    it('gives the queue an id it will accept', async () => {
      // BullMQ builds its Redis keys around `:` and rejects a custom id containing one. The id
      // used to be `reminder:<id>`, so every scheduled reminder threw after its row was written,
      // surfacing as a 500 from appointment confirmation, reschedule, and follow-up scheduling.
      await service.scheduleAppointmentReminder({
        ...SCHEDULE_PARAMS,
        phoneE164: '+233240000000',
      });

      const { jobId } = reminderQueue.add.mock.calls[0][2];
      expect(jobId).not.toContain(':');
      expect(jobId).toBe('reminder-reminder-1');
    });

    it('gives the job a deterministic id so it can be found and removed later', async () => {
      await service.scheduleAppointmentReminder({
        ...SCHEDULE_PARAMS,
        phoneE164: '+233240000000',
      });

      expect(reminderQueue.add).toHaveBeenCalledWith(
        'send',
        { reminderId: 'reminder-1', clinicId: FIXTURE_CLINIC_ID, userId: null, scope: 'clinic' },
        expect.objectContaining({ jobId: 'reminder-reminder-1', attempts: 3 }),
      );
    });
  });

  describe('suppression when the appointment moves', () => {
    it.each(APPOINTMENT_TRANSITIONS.map((t) => [t.action, t.reminderSuppressionReason]))(
      'records %s against every queued reminder as %s',
      async (action, reason) => {
        prisma.reminder.findMany.mockResolvedValue([
          appointmentReminderFixture({ id: 'reminder-1' }),
          appointmentReminderFixture({ id: 'reminder-2', channel: 'EMAIL' }),
        ]);

        await service.suppressQueuedAppointmentReminders(
          FIXTURE_CLINIC_ID,
          FIXTURE_APPOINTMENT_ID,
          FIXTURE_ACTOR_ID,
          reason,
          REQUEST_ID,
        );

        expect(prisma.reminder.findMany).toHaveBeenCalledWith({
          where: expect.objectContaining({
            clinicId: FIXTURE_CLINIC_ID,
            status: 'QUEUED',
            templateKey: 'APPOINTMENT_REMINDER_V1',
          }),
        });
        for (const id of ['reminder-1', 'reminder-2']) {
          expect(prisma.reminder.update).toHaveBeenCalledWith({
            where: { id },
            data: { status: 'FAILED', failureReason: reason },
          });
          expect(reminderQueue.getJob).toHaveBeenCalledWith(`reminder-${id}`);
        }
        expect(removeJob).toHaveBeenCalledTimes(2);
        expect(auditService.logWrite).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'REMINDER.SUPPRESS',
            entityType: 'Reminder',
            requestId: REQUEST_ID,
          }),
        );
        expect(transitionFor(action as AppointmentLifecycleAction).reminderSuppressionReason).toBe(
          reason,
        );
      },
    );

    it('reaches a reminder created before appointmentId was a column', async () => {
      // Legacy rows carry the appointment only inside the payload. Missing them would leave a
      // queued reminder for an appointment that no longer exists.
      await service.suppressQueuedAppointmentReminders(
        FIXTURE_CLINIC_ID,
        FIXTURE_APPOINTMENT_ID,
        FIXTURE_ACTOR_ID,
        'APPOINTMENT_CANCELLED',
        REQUEST_ID,
      );

      const where = prisma.reminder.findMany.mock.calls[0][0].where;
      expect(where.OR).toEqual(
        expect.arrayContaining([
          { appointmentId: FIXTURE_APPOINTMENT_ID },
          expect.objectContaining({
            appointmentId: null,
            payloadJson: { contains: `"appointmentId":"${FIXTURE_APPOINTMENT_ID}"` },
          }),
        ]),
      );
    });

    it('leaves an already-sent reminder alone', async () => {
      // Only QUEUED rows are matched; rewriting a SENT row would falsify the delivery record.
      await service.suppressQueuedAppointmentReminders(
        FIXTURE_CLINIC_ID,
        FIXTURE_APPOINTMENT_ID,
        FIXTURE_ACTOR_ID,
        'APPOINTMENT_COMPLETED',
        REQUEST_ID,
      );

      expect(prisma.reminder.findMany.mock.calls[0][0].where.status).toBe('QUEUED');
      expect(prisma.reminder.update).not.toHaveBeenCalled();
    });
  });

  describe('the second defence, at send time', () => {
    it('sends a reminder whose appointment is still confirmed and unmoved', async () => {
      prisma.reminder.findUnique.mockResolvedValue(appointmentReminderFixture());

      await service.processReminder('reminder-1');

      expect(smsProvider.send).toHaveBeenCalledWith(
        '+233240000000',
        expect.stringContaining('your appointment is scheduled'),
      );
      expect(prisma.reminder.update).toHaveBeenCalledWith({
        where: { id: 'reminder-1' },
        data: expect.objectContaining({ status: 'SENT', providerMessageId: 'sms-1' }),
      });
    });

    it.each(
      Object.values(AppointmentStatus).filter((status) => status !== AppointmentStatus.CONFIRMED),
    )('refuses to send once the appointment is %s', async (status) => {
      prisma.reminder.findUnique.mockResolvedValue(
        appointmentReminderFixture({
          appointment: {
            id: FIXTURE_APPOINTMENT_ID,
            status,
            startsAt: new Date('2026-03-26T14:00:00.000Z'),
          },
        }),
      );

      await service.processReminder('reminder-1');

      expect(smsProvider.send).not.toHaveBeenCalled();
      expect(emailProvider.send).not.toHaveBeenCalled();
      expect(prisma.reminder.update).toHaveBeenCalledWith({
        where: { id: 'reminder-1' },
        data: { status: 'FAILED', failureReason: `APPOINTMENT_NOT_CONFIRMED:${status}` },
      });
      expect(auditService.logWrite).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'REMINDER.SUPPRESS' }),
      );
    });

    it('refuses to send a reminder for a time the appointment no longer holds', async () => {
      prisma.reminder.findUnique.mockResolvedValue(
        appointmentReminderFixture({
          appointment: {
            id: FIXTURE_APPOINTMENT_ID,
            status: AppointmentStatus.CONFIRMED,
            startsAt: new Date('2026-03-27T14:00:00.000Z'),
          },
        }),
      );

      await service.processReminder('reminder-1');

      expect(smsProvider.send).not.toHaveBeenCalled();
      expect(prisma.reminder.update).toHaveBeenCalledWith({
        where: { id: 'reminder-1' },
        data: { status: 'FAILED', failureReason: 'APPOINTMENT_RESCHEDULED' },
      });
    });

    it('refuses to send when the appointment has gone entirely', async () => {
      prisma.reminder.findUnique.mockResolvedValue(
        appointmentReminderFixture({ appointment: null, appointmentId: null, payloadJson: '{}' }),
      );

      await service.processReminder('reminder-1');

      expect(smsProvider.send).not.toHaveBeenCalled();
      expect(prisma.reminder.update).toHaveBeenCalledWith({
        where: { id: 'reminder-1' },
        data: { status: 'FAILED', failureReason: 'APPOINTMENT_NOT_FOUND' },
      });
    });

    it('resolves a legacy reminder through the clinic-scoped appointment lookup', async () => {
      prisma.reminder.findUnique.mockResolvedValue(
        appointmentReminderFixture({ appointment: null, appointmentId: null }),
      );
      prisma.appointment.findFirst.mockResolvedValue({
        id: FIXTURE_APPOINTMENT_ID,
        status: AppointmentStatus.CANCELLED,
        startsAt: new Date('2026-03-26T14:00:00.000Z'),
      });

      await service.processReminder('reminder-1');

      expect(prisma.appointment.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: FIXTURE_APPOINTMENT_ID, clinicId: FIXTURE_CLINIC_ID },
        }),
      );
      expect(smsProvider.send).not.toHaveBeenCalled();
    });

    it('does nothing for a reminder that is no longer queued', async () => {
      prisma.reminder.findUnique.mockResolvedValue(appointmentReminderFixture({ status: 'SENT' }));

      await service.processReminder('reminder-1');

      expect(smsProvider.send).not.toHaveBeenCalled();
      expect(prisma.reminder.update).not.toHaveBeenCalled();
    });

    it('does nothing before the reminder is due', async () => {
      prisma.reminder.findUnique.mockResolvedValue(
        appointmentReminderFixture({ scheduledAt: new Date('2099-01-01T00:00:00.000Z') }),
      );

      await service.processReminder('reminder-1');

      expect(smsProvider.send).not.toHaveBeenCalled();
      expect(prisma.reminder.update).not.toHaveBeenCalled();
    });
  });
});
