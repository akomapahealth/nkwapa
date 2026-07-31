import { ReminderService } from './reminder.service';

function createReminder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'reminder-1',
    clinicId: 'clinic-1',
    patientId: 'patient-1',
    encounterId: null,
    appointmentId: 'appointment-1',
    channel: 'SMS',
    toAddress: '+233240000000',
    templateKey: 'APPOINTMENT_REMINDER_V1',
    payloadJson: JSON.stringify({
      patientCode: 'NKP-2026-000001',
      clinicName: 'Clinic One',
      patientId: 'patient-1',
      appointmentId: 'appointment-1',
      startsAt: '2026-03-26T14:00:00.000Z',
    }),
    scheduledAt: new Date('2026-03-25T14:00:00.000Z'),
    sentAt: null,
    status: 'QUEUED',
    providerMessageId: null,
    failureReason: null,
    createdAt: new Date('2026-03-21T09:00:00.000Z'),
    updatedAt: new Date('2026-03-21T09:00:00.000Z'),
    appointment: {
      id: 'appointment-1',
      status: 'CONFIRMED',
      startsAt: new Date('2026-03-26T14:00:00.000Z'),
    },
    ...overrides,
  };
}

describe('ReminderService', () => {
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
  let service: ReminderService;

  beforeEach(() => {
    prisma = {
      reminder: {
        create: jest.fn(async ({ data }) => createReminder({ ...data, id: 'reminder-1' })),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(async ({ where, data }) => createReminder({ id: where.id, ...data })),
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
    reminderQueue = {
      add: jest.fn().mockResolvedValue({ id: 'reminder:reminder-1' }),
      getJob: jest.fn().mockResolvedValue({ remove: jest.fn().mockResolvedValue(undefined) }),
    };
    service = new ReminderService(
      prisma as never,
      auditService as never,
      smsProvider,
      emailProvider,
      reminderQueue as never,
    );
  });

  it('creates predictable SMS appointment reminder records and deterministic jobs', async () => {
    await service.scheduleAppointmentReminder({
      clinicId: 'clinic-1',
      clinicName: 'Clinic One',
      patientId: 'patient-1',
      patientCode: 'NKP-2026-000001',
      phoneE164: '+233240000000',
      appointmentId: 'appointment-1',
      startsAt: new Date('2026-03-26T14:00:00.000Z'),
      actorUserId: 'manager-1',
      requestId: 'req-1',
    });

    expect(prisma.reminder.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        appointmentId: 'appointment-1',
        channel: 'SMS',
        toAddress: '+233240000000',
        templateKey: 'APPOINTMENT_REMINDER_V1',
        status: 'QUEUED',
      }),
    });
    expect(JSON.parse(prisma.reminder.create.mock.calls[0][0].data.payloadJson)).toMatchObject({
      appointmentId: 'appointment-1',
      startsAt: '2026-03-26T14:00:00.000Z',
    });
    expect(reminderQueue.add).toHaveBeenCalledWith(
      'send',
      { reminderId: 'reminder-1', clinicId: 'clinic-1', userId: null },
      expect.objectContaining({ jobId: 'reminder:reminder-1' }),
    );
  });

  it('creates visible failed appointment records when no contact method exists', async () => {
    await service.scheduleAppointmentReminderNoContact({
      clinicId: 'clinic-1',
      patientId: 'patient-1',
      patientCode: 'NKP-2026-000001',
      appointmentId: 'appointment-1',
      startsAt: new Date('2026-03-26T14:00:00.000Z'),
      actorUserId: 'manager-1',
      requestId: 'req-1',
    });

    expect(prisma.reminder.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        appointmentId: 'appointment-1',
        status: 'FAILED',
        failureReason: 'NO_CONTACT_METHOD',
        toAddress: 'N/A',
      }),
    });
    expect(reminderQueue.add).not.toHaveBeenCalled();
  });

  it('suppresses queued appointment reminders and removes deterministic jobs', async () => {
    prisma.reminder.findMany.mockResolvedValue([
      createReminder({ id: 'reminder-1' }),
      createReminder({ id: 'reminder-2' }),
    ]);

    await service.suppressQueuedAppointmentReminders(
      'clinic-1',
      'appointment-1',
      'manager-1',
      'APPOINTMENT_RESCHEDULED',
      'req-1',
    );

    expect(prisma.reminder.findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        clinicId: 'clinic-1',
        status: 'QUEUED',
        templateKey: 'APPOINTMENT_REMINDER_V1',
        OR: expect.arrayContaining([expect.objectContaining({ appointmentId: 'appointment-1' })]),
      }),
    });
    expect(prisma.reminder.update).toHaveBeenCalledTimes(2);
    expect(prisma.reminder.update).toHaveBeenCalledWith({
      where: { id: 'reminder-1' },
      data: { status: 'FAILED', failureReason: 'APPOINTMENT_RESCHEDULED' },
    });
    expect(reminderQueue.getJob).toHaveBeenCalledWith('reminder:reminder-1');
    expect(reminderQueue.getJob).toHaveBeenCalledWith('reminder:reminder-2');
  });

  it('does not send appointment reminders for cancelled appointments', async () => {
    prisma.reminder.findUnique.mockResolvedValue(
      createReminder({ appointment: { id: 'appointment-1', status: 'CANCELLED' } }),
    );

    await service.processReminder('reminder-1');

    expect(smsProvider.send).not.toHaveBeenCalled();
    expect(prisma.reminder.update).toHaveBeenCalledWith({
      where: { id: 'reminder-1' },
      data: { status: 'FAILED', failureReason: 'APPOINTMENT_NOT_CONFIRMED:CANCELLED' },
    });
  });

  it('does not send stale appointment reminders after reschedule', async () => {
    prisma.reminder.findUnique.mockResolvedValue(
      createReminder({
        appointment: {
          id: 'appointment-1',
          status: 'CONFIRMED',
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

  it('sends current appointment reminders through the configured provider', async () => {
    prisma.reminder.findUnique.mockResolvedValue(createReminder());

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

  it('records delivery status callbacks through existing reminder statuses', async () => {
    prisma.reminder.findFirst.mockResolvedValue(createReminder({ providerMessageId: 'sms-1' }));

    await service.updateDeliveryStatus('sms-1', 'FAILED', '30005');

    expect(prisma.reminder.update).toHaveBeenCalledWith({
      where: { id: 'reminder-1' },
      data: { status: 'FAILED', failureReason: 'DELIVERY_FAILED:30005' },
    });
    expect(auditService.logWrite).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'REMINDER.DELIVERY_UPDATE' }),
    );
  });
});
