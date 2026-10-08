import type { JobStep } from '../prisma/job-tenant-context.runner';
import {
  REMINDER_SEND_STALE_AFTER_MS,
  ReminderService,
  SEND_OUTCOME_UNKNOWN,
  TransientReminderSendError,
} from './reminder.service';

/*
  #164: no provider call runs inside a database transaction.

  The reminder row lives in memory here, and `step` stands in for one short transaction under the
  job's tenant context. It records whether a transaction is open, so each test can check what the
  provider saw when it was called, and what the row says when a step fails partway.
*/

type Row = Record<string, unknown>;

function reminderRow(overrides: Row = {}): Row {
  return {
    id: 'reminder-1',
    clinicId: 'clinic-1',
    patientId: 'patient-1',
    appointmentId: null,
    encounterId: null,
    channel: 'SMS',
    toAddress: '+233240000000',
    templateKey: 'FOLLOWUP_REMINDER_V1',
    payloadJson: JSON.stringify({
      patientCode: 'NKP-2026-000001',
      clinicName: 'Clinic One',
      followUpDate: '2026-11-01',
    }),
    scheduledAt: new Date('2026-10-01T09:00:00Z'),
    status: 'QUEUED',
    sendingStartedAt: null,
    sentAt: null,
    providerMessageId: null,
    failureReason: null,
    clinic: { name: 'Clinic One', timezone: 'Africa/Accra' },
    patient: null,
    appointment: null,
    ...overrides,
  };
}

function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === 'OR') return (value as Row[]).some((branch) => matches(row, branch));
    return row[key] === value;
  });
}

function setup(initial: Row = {}) {
  let row = reminderRow(initial);
  let openSteps = 0;
  let failNextStep: Error | null = null;

  const prisma = {
    $queryRaw: jest.fn().mockResolvedValue([{ locked: true }]),
    reminder: {
      findUnique: jest.fn(async () => ({ ...row })),
      findMany: jest.fn(async () => (row.status === 'SENDING' ? [{ ...row }] : [])),
      update: jest.fn(async ({ data }: { data: Row }) => {
        row = { ...row, ...data };
        return row;
      }),
      updateMany: jest.fn(async ({ where, data }: { where: Row; data: Row }) => {
        if (!matches(row, where)) return { count: 0 };
        row = { ...row, ...data };
        return { count: 1 };
      }),
    },
  };
  const step: JobStep = async (callback) => {
    if (failNextStep) {
      const error = failNextStep;
      failNextStep = null;
      throw error;
    }
    openSteps += 1;
    try {
      return await callback(prisma as never);
    } finally {
      openSteps -= 1;
    }
  };
  const smsProvider = {
    send: jest.fn(async () => {
      expect(openSteps).toBe(0);
      return { success: true, providerMessageId: 'SM-1' };
    }),
  };
  const audit = { logWrite: jest.fn().mockResolvedValue(undefined) };
  const service = new ReminderService(prisma as never, audit as never, smsProvider, null, {
    add: jest.fn(),
  } as never);
  return {
    service,
    step,
    prisma,
    smsProvider,
    audit,
    row: () => row,
    failNextStepWith: (error: Error) => {
      failNextStep = error;
    },
  };
}

const actions = (audit: { logWrite: jest.Mock }) =>
  audit.logWrite.mock.calls.map(([event]) => (event as { action: string }).action);

describe('sending a reminder outside the job transaction (#164)', () => {
  it('claims, sends with no transaction open, then records SENT', async () => {
    const { service, step, smsProvider, row, audit } = setup();
    await service.processReminder('reminder-1', undefined, step);

    expect(smsProvider.send).toHaveBeenCalledTimes(1);
    expect(row()).toMatchObject({ status: 'SENT', providerMessageId: 'SM-1' });
    expect(actions(audit)).toEqual(['REMINDER.SENT']);
  });

  it('sends exactly once however long the provider takes', async () => {
    // The defect: a provider slower than the transaction timeout rolled back the SENT write and
    // the retry sent again. Nothing here holds a transaction across the call, so a slow send
    // costs time and nothing else.
    jest.useFakeTimers();
    try {
      const { service, step, smsProvider, row } = setup();
      smsProvider.send.mockImplementationOnce(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve({ success: true, providerMessageId: 'SM-slow' }), 30_000),
          ),
      );
      const sending = service.processReminder('reminder-1', undefined, step);
      await jest.advanceTimersByTimeAsync(30_000);
      await sending;

      expect(row()).toMatchObject({ status: 'SENT', providerMessageId: 'SM-slow' });
      await service.processReminder('reminder-1', undefined, step);
      expect(smsProvider.send).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('stands down when another delivery of the job already holds the send', async () => {
    const { service, step, smsProvider } = setup({
      status: 'SENDING',
      sendingStartedAt: new Date(),
    });
    await service.processReminder('reminder-1', undefined, step);
    expect(smsProvider.send).not.toHaveBeenCalled();
  });

  it('leaves the row SENDING when SENT cannot be recorded, so the retry does not resend', async () => {
    const { service, step, smsProvider, row, failNextStepWith } = setup();
    smsProvider.send.mockImplementationOnce(async () => {
      failNextStepWith(new Error('connection reset'));
      return { success: true, providerMessageId: 'SM-1' };
    });

    await expect(service.processReminder('reminder-1', undefined, step)).rejects.toThrow(
      'connection reset',
    );
    expect(row().status).toBe('SENDING');

    // The queue's retry.
    await service.processReminder('reminder-1', undefined, step);
    expect(smsProvider.send).toHaveBeenCalledTimes(1);
  });

  it('leaves an unclassified provider throw for reconciliation instead of retrying it', async () => {
    const { service, step, smsProvider, row } = setup();
    smsProvider.send.mockRejectedValueOnce(new Error('socket hang up'));

    await expect(
      service.processReminder('reminder-1', { attemptsMade: 0, maxAttempts: 3 }, step),
    ).resolves.toBeUndefined();
    expect(row().status).toBe('SENDING');
  });

  it('hands a send that certainly failed back to the queue for its retry', async () => {
    const { service, step, smsProvider, row } = setup();
    smsProvider.send.mockResolvedValueOnce({
      success: false,
      error: 'EMAIL_SEND_FAILED',
      retryable: true,
    } as never);

    await expect(
      service.processReminder('reminder-1', { attemptsMade: 0, maxAttempts: 3 }, step),
    ).rejects.toBeInstanceOf(TransientReminderSendError);
    expect(row()).toMatchObject({ status: 'QUEUED', sendingStartedAt: null });

    await service.processReminder('reminder-1', { attemptsMade: 1, maxAttempts: 3 }, step);
    expect(smsProvider.send).toHaveBeenCalledTimes(2);
    expect(row().status).toBe('SENT');
  });

  it('records a terminal provider failure', async () => {
    const { service, step, smsProvider, row, audit } = setup();
    smsProvider.send.mockResolvedValueOnce({
      success: false,
      error: 'Twilio API error 400',
    } as never);

    await service.processReminder('reminder-1', undefined, step);
    expect(row()).toMatchObject({ status: 'FAILED', failureReason: 'SEND_FAILED' });
    expect(actions(audit)).toEqual(['REMINDER.SEND_FAILED']);
  });

  describe('reconcileStaleSends', () => {
    const now = new Date('2026-10-08T12:00:00Z');

    it('records a long-stuck send as outcome unknown, without sending anything', async () => {
      const { service, smsProvider, row, audit } = setup({
        status: 'SENDING',
        sendingStartedAt: new Date(now.getTime() - REMINDER_SEND_STALE_AFTER_MS - 1),
      });

      await expect(service.reconcileStaleSends(now)).resolves.toBe(1);
      expect(row()).toMatchObject({ status: 'FAILED', failureReason: SEND_OUTCOME_UNKNOWN });
      expect(actions(audit)).toEqual(['REMINDER.OUTCOME_UNKNOWN']);
      expect(smsProvider.send).not.toHaveBeenCalled();
    });

    it('asks only for sends claimed before the stale line', async () => {
      const { service, prisma } = setup();
      await service.reconcileStaleSends(now);
      expect(prisma.reminder.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            status: 'SENDING',
            OR: [
              { sendingStartedAt: { lt: new Date(now.getTime() - REMINDER_SEND_STALE_AFTER_MS) } },
              { sendingStartedAt: null },
            ],
          },
        }),
      );
    });

    it('lets a worker that did send record SENT after the sweep', async () => {
      const { service, step, smsProvider, row } = setup();
      smsProvider.send.mockImplementationOnce(async () => {
        // The sweep runs while the provider call is still outstanding.
        await service.reconcileStaleSends(new Date(Date.now() + REMINDER_SEND_STALE_AFTER_MS + 1));
        return { success: true, providerMessageId: 'SM-late' };
      });

      await service.processReminder('reminder-1', undefined, step);
      expect(row()).toMatchObject({
        status: 'SENT',
        providerMessageId: 'SM-late',
        failureReason: null,
      });
    });
  });
});
