import type { JobStep } from '../prisma/job-tenant-context.runner';
import { REMINDER_OVERDUE_GRACE_MS, ReminderService } from './reminder.service';

/*
  #165: a reminder is never dropped because its job arrived early or went missing.

  An early job used to find the row not yet due, return, and complete, leaving a QUEUED row with no
  job behind it. The worker now hands the job back to the queue until the reminder's time, and the
  reconciliation sweep re-queues any reminder past its time whose job is gone.
*/

// Real time: queueReminder computes the delay from the clock, not from the sweep's `now`.
const NOW = new Date();
const step: JobStep = (callback) => callback({} as never);

function service({
  reminder = {},
  overdue = [] as Array<Record<string, unknown>>,
  jobs = {} as Record<string, string | null>,
} = {}) {
  const smsProvider = { send: jest.fn() };
  const removed: string[] = [];
  const queue = {
    add: jest.fn().mockResolvedValue({}),
    getJob: jest.fn(async (jobId: string) => {
      const state = jobs[jobId];
      if (state === undefined || state === null) return null;
      return {
        getState: jest.fn().mockResolvedValue(state),
        remove: jest.fn(async () => {
          removed.push(jobId);
        }),
      };
    }),
  };
  const prisma = {
    $queryRaw: jest.fn().mockResolvedValue([{ locked: true }]),
    reminder: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'reminder-1',
        clinicId: 'clinic-1',
        status: 'QUEUED',
        channel: 'SMS',
        scheduledAt: new Date(Date.now() + 60 * 60 * 1000),
        payloadJson: '{}',
        ...reminder,
      }),
      findMany: jest.fn().mockResolvedValue(overdue),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const reminders = new ReminderService(
    prisma as never,
    { logWrite: jest.fn() } as never,
    smsProvider,
    null,
    queue as never,
  );
  return { reminders, smsProvider, queue, prisma, removed };
}

describe('a reminder job delivered before its time (#165)', () => {
  it('asks to run again at the reminder time, without sending or claiming', async () => {
    const scheduledAt = new Date(Date.now() + 90_000);
    const { reminders, smsProvider, prisma } = service({ reminder: { scheduledAt } });

    await expect(reminders.processReminder('reminder-1', undefined, step)).resolves.toEqual({
      notDueUntil: scheduledAt,
    });
    expect(smsProvider.send).not.toHaveBeenCalled();
    expect(prisma.reminder.updateMany).not.toHaveBeenCalled();
  });

  it('does nothing for a reminder that is no longer queued, however early', async () => {
    const { reminders } = service({
      reminder: { status: 'SENT', scheduledAt: new Date(Date.now() + 90_000) },
    });
    await expect(reminders.processReminder('reminder-1', undefined, step)).resolves.toBeUndefined();
  });
});

describe('requeueOverdue (#165)', () => {
  const overdueAt = new Date(NOW.getTime() - REMINDER_OVERDUE_GRACE_MS - 60_000);

  it('looks only at queued reminders past their time by more than the grace period', async () => {
    const { reminders, prisma } = service();
    await reminders.requeueOverdue(step, NOW);
    expect(prisma.reminder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: 'QUEUED',
          scheduledAt: { lt: new Date(NOW.getTime() - REMINDER_OVERDUE_GRACE_MS) },
        },
      }),
    );
  });

  it('re-queues a reminder whose job is gone, under its own clinic', async () => {
    const { reminders, queue } = service({
      overdue: [
        { id: 'r-a', clinicId: 'clinic-a', scheduledAt: overdueAt },
        { id: 'r-b', clinicId: 'clinic-b', scheduledAt: overdueAt },
      ],
    });

    await expect(reminders.requeueOverdue(step, NOW)).resolves.toBe(2);
    expect(queue.add).toHaveBeenCalledWith(
      'send',
      { reminderId: 'r-a', clinicId: 'clinic-a', userId: null, scope: 'clinic' },
      expect.objectContaining({ jobId: 'reminder-r-a', delay: 0 }),
    );
    expect(queue.add).toHaveBeenCalledWith(
      'send',
      { reminderId: 'r-b', clinicId: 'clinic-b', userId: null, scope: 'clinic' },
      expect.objectContaining({ jobId: 'reminder-r-b', delay: 0 }),
    );
  });

  it('keeps a notification that belongs to no clinic global', async () => {
    const { reminders, queue } = service({
      overdue: [{ id: 'r-g', clinicId: null, scheduledAt: overdueAt }],
    });
    await reminders.requeueOverdue(step, NOW);
    expect(queue.add).toHaveBeenCalledWith(
      'send',
      { reminderId: 'r-g', userId: null, scope: 'global' },
      expect.anything(),
    );
  });

  it('removes a finished job first, since BullMQ ignores an add under an id it still holds', async () => {
    const { reminders, queue, removed } = service({
      overdue: [{ id: 'r-a', clinicId: 'clinic-a', scheduledAt: overdueAt }],
      jobs: { 'reminder-r-a': 'completed' },
    });
    await reminders.requeueOverdue(step, NOW);
    expect(removed).toEqual(['reminder-r-a']);
    expect(queue.add).toHaveBeenCalledTimes(1);
  });

  it.each(['waiting', 'delayed', 'active'])(
    'leaves a reminder alone while its job is %s',
    async (state) => {
      const { reminders, queue, removed } = service({
        overdue: [{ id: 'r-a', clinicId: 'clinic-a', scheduledAt: overdueAt }],
        jobs: { 'reminder-r-a': state },
      });
      await expect(reminders.requeueOverdue(step, NOW)).resolves.toBe(0);
      expect(removed).toEqual([]);
      expect(queue.add).not.toHaveBeenCalled();
    },
  );
});
