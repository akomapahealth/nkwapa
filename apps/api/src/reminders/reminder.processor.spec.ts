import { ReminderProcessor } from './reminder.processor';

describe('ReminderProcessor tenant context', () => {
  const reminderService = {
    processReminder: jest.fn(),
    findReminderClinicId: jest.fn(),
  };
  const prisma = {
    withClinicContext: jest.fn(async (_clinicId, _context, callback) => callback()),
    withSystemContext: jest.fn(async (_context, callback) => callback()),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('processes new reminder jobs inside the queued clinic context', async () => {
    const processor = new ReminderProcessor(reminderService as never, prisma as never);

    await processor.process({
      id: 'job-1',
      data: { reminderId: 'reminder-1', clinicId: 'clinic-1' },
    } as never);

    expect(prisma.withSystemContext).not.toHaveBeenCalled();
    expect(prisma.withClinicContext).toHaveBeenCalledWith(
      'clinic-1',
      { requestId: 'job-1', userId: null },
      expect.any(Function),
    );
    expect(reminderService.processReminder).toHaveBeenCalledWith('reminder-1');
  });

  it('uses system context only to resolve legacy jobs missing clinicId', async () => {
    reminderService.findReminderClinicId.mockResolvedValue('clinic-1');
    const processor = new ReminderProcessor(reminderService as never, prisma as never);

    await processor.process({ id: 'job-1', data: { reminderId: 'reminder-1' } } as never);

    expect(prisma.withSystemContext).toHaveBeenCalledWith(
      {
        requestId: 'job-1',
        systemReason: 'Resolve tenant for a legacy reminder payload',
      },
      expect.any(Function),
    );
    expect(reminderService.findReminderClinicId).toHaveBeenCalledWith('reminder-1');
    expect(prisma.withClinicContext).toHaveBeenCalledWith(
      'clinic-1',
      { requestId: 'job-1', userId: null },
      expect.any(Function),
    );
  });
});
