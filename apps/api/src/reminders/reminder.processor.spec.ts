import { ReminderProcessor } from './reminder.processor';

describe('ReminderProcessor tenant context', () => {
  const reminderService = {
    processReminder: jest.fn(),
    findReminderClinicId: jest.fn(),
  };
  const tenantContext = {
    runClinicJob: jest.fn(async (_context, callback) => callback()),
    runSystemJob: jest.fn(async (_context, callback) => callback()),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('passes new reminder jobs through the queued clinic context', async () => {
    const processor = new ReminderProcessor(reminderService as never, tenantContext as never);

    await processor.process({
      id: 'job-1',
      data: {
        reminderId: 'reminder-1',
        clinicId: 'clinic-1',
        userId: null,
      },
    } as never);

    expect(tenantContext.runClinicJob).toHaveBeenCalledWith(
      expect.objectContaining({
        queueName: 'reminders',
        jobId: 'job-1',
        resourceId: 'reminder-1',
        tenant: { clinicId: 'clinic-1', userId: null },
        unresolvedTenant: 'discard',
      }),
      expect.any(Function),
    );
    expect(reminderService.findReminderClinicId).not.toHaveBeenCalled();
    expect(reminderService.processReminder).toHaveBeenCalledWith('reminder-1');
  });

  it('runs a deliberately global notification as system work instead of discarding it', async () => {
    // The defect this guards: runClinicJob applies `unresolvedTenant: 'discard'`, so a
    // notification with no clinic — a global account deactivation — would be dropped
    // with only a warn line once clinicId became nullable.
    const processor = new ReminderProcessor(reminderService as never, tenantContext as never);

    await processor.process({
      id: 'job-global',
      data: { reminderId: 'reminder-global', userId: null, scope: 'global' },
    } as never);

    expect(tenantContext.runClinicJob).not.toHaveBeenCalled();
    expect(tenantContext.runSystemJob).toHaveBeenCalledWith(
      expect.objectContaining({
        queueName: 'reminders',
        resourceId: 'reminder-global',
        systemReason: expect.stringContaining('not scoped to a single clinic'),
      }),
      expect.any(Function),
    );
    expect(reminderService.processReminder).toHaveBeenCalledWith('reminder-global');
  });

  it('still resolves a legacy payload rather than treating it as global', async () => {
    // An absent `scope` predates this field and must keep the old behaviour, or every
    // job queued before the deploy would be misrouted.
    reminderService.findReminderClinicId.mockResolvedValue('clinic-legacy');
    const processor = new ReminderProcessor(reminderService as never, tenantContext as never);

    await processor.process({
      id: 'job-legacy',
      data: { reminderId: 'reminder-legacy' },
    } as never);

    expect(tenantContext.runSystemJob).not.toHaveBeenCalled();
    expect(tenantContext.runClinicJob).toHaveBeenCalled();
  });

  it('declares safe discard and resolves legacy reminder tenants as system work', async () => {
    reminderService.findReminderClinicId.mockResolvedValue('clinic-legacy');
    const processor = new ReminderProcessor(reminderService as never, tenantContext as never);

    await processor.process({
      id: 'job-legacy',
      data: { reminderId: 'reminder-legacy' },
    } as never);

    const context = tenantContext.runClinicJob.mock.calls[0][0];
    expect(context).toMatchObject({
      tenant: null,
      unresolvedTenant: 'discard',
      legacy: {
        systemReason: 'Resolve tenant for a legacy reminder payload',
      },
    });
    await expect(context.legacy.resolveTenant()).resolves.toEqual({
      clinicId: 'clinic-legacy',
      userId: null,
    });
  });

  it('does not replace a supplied tenant with a database lookup', async () => {
    const processor = new ReminderProcessor(reminderService as never, tenantContext as never);

    await processor.process({
      id: 'job-1',
      data: {
        reminderId: 'reminder-1',
        clinicId: 'different-clinic',
        userId: null,
      },
    } as never);

    expect(tenantContext.runClinicJob.mock.calls[0][0].tenant).toEqual({
      clinicId: 'different-clinic',
      userId: null,
    });
    expect(reminderService.findReminderClinicId).not.toHaveBeenCalled();
  });
});
