import { ReminderService } from './reminder.service';
import { SYSTEM_ACTOR_USER_ID } from '../common/system-actor';

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
    $queryRaw: jest.Mock;
    $executeRaw: jest.Mock;
    $transaction: jest.Mock;
    reminder: {
      create: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    appointment: { findFirst: jest.Mock };
    patient: { findFirst: jest.Mock };
    clinic: { findUnique: jest.Mock };
  };
  let auditService: { logWrite: jest.Mock };
  let smsProvider: { send: jest.Mock };
  let emailProvider: { send: jest.Mock };
  let reminderQueue: { add: jest.Mock; getJob: jest.Mock };
  let service: ReminderService;

  beforeEach(() => {
    prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ locked: true }]),
      $executeRaw: jest.fn().mockResolvedValue(0),
      $transaction: jest.fn(),
      reminder: {
        create: jest.fn(async ({ data }) => createReminder({ ...data, id: 'reminder-1' })),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(async ({ where, data }) => createReminder({ id: where.id, ...data })),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      appointment: { findFirst: jest.fn() },
      patient: { findFirst: jest.fn() },
      clinic: {
        findUnique: jest.fn().mockResolvedValue({ name: 'Clinic One', timezone: 'Africa/Accra' }),
      },
    };
    prisma.$transaction.mockImplementation((callback: (tx: typeof prisma) => unknown) =>
      callback(prisma),
    );
    auditService = { logWrite: jest.fn().mockResolvedValue(undefined) };
    smsProvider = {
      send: jest.fn().mockResolvedValue({ success: true, providerMessageId: 'sms-1' }),
    };
    emailProvider = {
      send: jest.fn().mockResolvedValue({ success: true, providerMessageId: 'email-1' }),
    };
    reminderQueue = {
      add: jest.fn().mockResolvedValue({ id: 'reminder-reminder-1' }),
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

  describe('sendNotificationNow', () => {
    const base = {
      clinicId: 'clinic-1',
      recipientType: 'PATIENT' as const,
      patientId: 'patient-1',
      toAddress: 'ama@example.org',
      templateKey: 'PORTAL_INVITE_V1',
      payload: { patientCode: 'NKP-2026-000001' },
      actorUserId: 'manager-1',
    };

    it('queues immediately rather than sending inside the request transaction', async () => {
      // The whole request runs in one Postgres transaction, so an inline SMTP call
      // would hold a database connection open for a network round trip.
      await service.sendNotificationNow(base);

      expect(prisma.reminder.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          channel: 'EMAIL',
          templateKey: 'PORTAL_INVITE_V1',
          status: 'QUEUED',
          recipientType: 'PATIENT',
        }),
      });
      expect(reminderQueue.add.mock.calls[0][2].delay).toBe(0);
    });

    it('records a visible failure when the recipient has no address', async () => {
      // Skipping silently would leave staff believing an invite went out.
      await service.sendNotificationNow({ ...base, toAddress: null });

      expect(prisma.reminder.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          status: 'FAILED',
          failureReason: 'NO_CONTACT_METHOD',
        }),
      });
      expect(reminderQueue.add).not.toHaveBeenCalled();
    });

    it('degrades to a failed row when the queue is unreachable', async () => {
      // Redis is now in the blast radius of invite creation and role assignment; an
      // outage must not turn into a 500 on the workflow itself.
      reminderQueue.add.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(service.sendNotificationNow(base)).resolves.toBeDefined();
      expect(prisma.reminder.update).toHaveBeenCalledWith({
        where: { id: 'reminder-1' },
        data: { status: 'FAILED', failureReason: 'QUEUE_UNAVAILABLE' },
      });
    });

    it('marks a system-scoped notification so the worker does not discard it', async () => {
      await service.sendNotificationNow({
        ...base,
        clinicId: null,
        recipientType: 'USER',
        patientId: null,
        recipientUserId: 'user-9',
        templateKey: 'PORTAL_INVITE_V1',
      });

      expect(reminderQueue.add.mock.calls[0][1]).toMatchObject({ scope: 'global' });
      expect(reminderQueue.add.mock.calls[0][1]).not.toHaveProperty('clinicId');
    });

    it('never lets a USER recipient carry a patient id', async () => {
      // The database check constraint enforces this too; keeping the service honest
      // means the constraint stays a backstop rather than the first line of defence.
      await service.sendNotificationNow({
        ...base,
        recipientType: 'USER',
        patientId: 'patient-1',
        recipientUserId: 'user-9',
      });

      expect(prisma.reminder.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ patientId: null, recipientUserId: 'user-9' }),
      });
    });

    it('refuses a template that does not exist instead of queueing a doomed row', async () => {
      await expect(
        service.sendNotificationNow({ ...base, templateKey: 'NOT_A_TEMPLATE_V1' }),
      ).rejects.toThrow('Unknown notification template');
      expect(prisma.reminder.create).not.toHaveBeenCalled();
    });
  });

  describe('email delivery', () => {
    function queueEmailReminder(overrides: Record<string, unknown> = {}) {
      prisma.reminder.findUnique.mockResolvedValue(
        createReminder({
          channel: 'EMAIL',
          toAddress: 'patient@example.org',
          appointment: {
            id: 'appointment-1',
            status: 'CONFIRMED',
            startsAt: new Date('2026-03-26T14:00:00.000Z'),
          },
          ...overrides,
        }),
      );
      prisma.appointment.findFirst.mockResolvedValue({
        id: 'appointment-1',
        status: 'CONFIRMED',
        startsAt: new Date('2026-03-26T14:00:00.000Z'),
      });
    }

    it('sends the html and text bodies through the email provider', async () => {
      queueEmailReminder();

      await service.processReminder('reminder-1');

      expect(emailProvider.send).toHaveBeenCalledTimes(1);
      const [to, subject, html, text] = emailProvider.send.mock.calls[0];
      expect(to).toBe('patient@example.org');
      expect(subject).toContain('Clinic One');
      expect(html).toContain('<!doctype html>');
      expect(text).not.toContain('<td');
      expect(smsProvider.send).not.toHaveBeenCalled();
    });

    it('fails an email reminder instead of texting the SMS body to an inbox', async () => {
      // The defect this guards: the dispatch read `channel === 'EMAIL' && emailProvider`
      // and fell through to the SMS branch when the provider was absent, delivering the
      // 160-character SMS body to an email address and recording it as SENT.
      const withoutEmail = new ReminderService(
        prisma as never,
        auditService as never,
        smsProvider,
        null,
        reminderQueue as never,
      );
      queueEmailReminder();

      await withoutEmail.processReminder('reminder-1');

      expect(smsProvider.send).not.toHaveBeenCalled();
      expect(prisma.reminder.update).toHaveBeenCalledWith({
        where: { id: 'reminder-1' },
        data: { status: 'FAILED', failureReason: 'EMAIL_CHANNEL_UNAVAILABLE' },
      });
    });

    it('keeps the provider failure code so an operator can act on it', async () => {
      queueEmailReminder();
      emailProvider.send.mockResolvedValue({ success: false, error: 'EMAIL_NOT_CONFIGURED' });

      await service.processReminder('reminder-1');

      expect(prisma.reminder.updateMany).toHaveBeenCalledWith({
        where: { id: 'reminder-1', status: 'SENDING' },
        data: { status: 'FAILED', failureReason: 'EMAIL_NOT_CONFIGURED' },
      });
    });

    it('collapses provider prose to the generic code rather than storing it', async () => {
      // failureReason is VarChar(255) and is rendered straight to operators.
      queueEmailReminder();
      emailProvider.send.mockResolvedValue({
        success: false,
        error: '550 5.1.1 <patient@example.org> recipient rejected',
      });

      await service.processReminder('reminder-1');

      expect(prisma.reminder.updateMany).toHaveBeenCalledWith({
        where: { id: 'reminder-1', status: 'SENDING' },
        data: { status: 'FAILED', failureReason: 'SEND_FAILED' },
      });
    });

    it('hands a transient failure back to the queue instead of marking it failed', async () => {
      /*
        The defect this guards: every send failure was caught, written FAILED and returned
        normally, so the queue's `attempts: 3` never once fired for a send and one blocked relay
        killed the notification outright. The row has to stay QUEUED, because processReminder
        refuses to act on a row that is not.
      */
      queueEmailReminder();
      emailProvider.send.mockResolvedValue({
        success: false,
        error: 'EMAIL_SEND_FAILED',
        retryable: true,
      });

      await expect(
        service.processReminder('reminder-1', { attemptsMade: 0, maxAttempts: 3 }),
      ).rejects.toThrow(/send failed transiently/i);

      expect(prisma.reminder.update).not.toHaveBeenCalled();
    });

    it('marks a transient failure failed once the attempts are spent', async () => {
      queueEmailReminder();
      emailProvider.send.mockResolvedValue({
        success: false,
        error: 'EMAIL_SEND_FAILED',
        retryable: true,
      });

      await service.processReminder('reminder-1', { attemptsMade: 2, maxAttempts: 3 });

      expect(prisma.reminder.updateMany).toHaveBeenCalledWith({
        where: { id: 'reminder-1', status: 'SENDING' },
        data: { status: 'FAILED', failureReason: 'EMAIL_SEND_FAILED' },
      });
    });

    it('never retries a failure the provider did not call transient', async () => {
      // Absent `retryable` means terminal, so anything unclassified behaves as it always has.
      queueEmailReminder();
      emailProvider.send.mockResolvedValue({ success: false, error: 'EMAIL_NOT_CONFIGURED' });

      await service.processReminder('reminder-1', { attemptsMade: 0, maxAttempts: 3 });

      expect(prisma.reminder.updateMany).toHaveBeenCalledWith({
        where: { id: 'reminder-1', status: 'SENDING' },
        data: { status: 'FAILED', failureReason: 'EMAIL_NOT_CONFIGURED' },
      });
    });

    it('treats a caller with no attempt budget as a single final attempt', async () => {
      // The default argument, which is what a non-queue caller and an older queued job get.
      queueEmailReminder();
      emailProvider.send.mockResolvedValue({
        success: false,
        error: 'EMAIL_SEND_FAILED',
        retryable: true,
      });

      await service.processReminder('reminder-1');

      expect(prisma.reminder.updateMany).toHaveBeenCalledWith({
        where: { id: 'reminder-1', status: 'SENDING' },
        data: { status: 'FAILED', failureReason: 'EMAIL_SEND_FAILED' },
      });
    });

    it('records an unknown template distinctly from a send failure', async () => {
      queueEmailReminder({ templateKey: 'REMOVED_TEMPLATE_V9' });

      await service.processReminder('reminder-1');

      expect(emailProvider.send).not.toHaveBeenCalled();
      expect(prisma.reminder.update).toHaveBeenCalledWith({
        where: { id: 'reminder-1' },
        data: { status: 'FAILED', failureReason: 'TEMPLATE_NOT_FOUND:REMOVED_TEMPLATE_V9' },
      });
    });
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
      { reminderId: 'reminder-1', clinicId: 'clinic-1', userId: null, scope: 'clinic' },
      expect.objectContaining({ jobId: 'reminder-reminder-1' }),
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
    expect(reminderQueue.getJob).toHaveBeenCalledWith('reminder-reminder-1');
    expect(reminderQueue.getJob).toHaveBeenCalledWith('reminder-reminder-2');
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
    expect(prisma.reminder.updateMany).toHaveBeenCalledWith({
      where: { id: 'reminder-1', status: 'QUEUED' },
      data: expect.objectContaining({ status: 'SENDING' }),
    });
    expect(prisma.reminder.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'reminder-1',
        OR: [{ status: 'SENDING' }, { status: 'FAILED', failureReason: 'SEND_OUTCOME_UNKNOWN' }],
      },
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

  // AuditEvent.actorUserId is a UUID with a foreign key to User. This used to pass the
  // literal string 'system', which Postgres rejects outright, so every delivery receipt
  // recorded nothing. Nothing noticed because the audit service is mocked here.
  it('attributes machine-written delivery audit to the system actor row', async () => {
    prisma.reminder.findFirst.mockResolvedValue(createReminder({ providerMessageId: 'sms-1' }));

    await service.updateDeliveryStatus('sms-1', 'DELIVERED');

    expect(auditService.logWrite).toHaveBeenCalledWith(
      expect.objectContaining({ actorUserId: SYSTEM_ACTOR_USER_ID }),
    );
    expect(SYSTEM_ACTOR_USER_ID).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });
  // #116: a follow-up reminder a staff member schedules directly for a patient.
  describe('scheduleStaffFollowUp', () => {
    const patient = {
      id: 'patient-1',
      patientCode: 'NKP-2026-000001',
      phoneE164: '+233240000000',
      email: 'ama@example.org',
      mergedIntoPatientId: null,
    };
    const inDays = (days: number) =>
      new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const params = (followUpDate = inDays(14)) => ({
      clinicId: 'clinic-1',
      patientId: 'patient-1',
      followUpDate,
      actorUserId: 'volunteer-1',
      requestId: 'req-1',
    });

    it('queues the follow-up template on every channel the chart has, and audits each', async () => {
      prisma.patient.findFirst.mockResolvedValue(patient);
      const date = inDays(14);
      const created = await service.scheduleStaffFollowUp(params(date));

      expect(created).toHaveLength(2);
      const rows = prisma.reminder.create.mock.calls.map(([{ data }]) => data);
      expect(rows.map((row) => row.channel).sort()).toEqual(['EMAIL', 'SMS']);
      for (const row of rows) {
        expect(row).toMatchObject({
          templateKey: 'FOLLOWUP_REMINDER_V1',
          clinicId: 'clinic-1',
          patientId: 'patient-1',
          encounterId: null,
          status: 'QUEUED',
          scheduledAt: new Date(`${date}T00:00:00.000Z`),
        });
      }
      expect(auditService.logWrite).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'REMINDER.CREATE', actorUserId: 'volunteer-1' }),
      );
      expect(reminderQueue.add).toHaveBeenCalledTimes(2);
    });

    it('records a visible failure when the chart has no contact method', async () => {
      prisma.patient.findFirst.mockResolvedValue({ ...patient, phoneE164: null, email: null });
      const [row] = await service.scheduleStaffFollowUp(params());
      expect(prisma.reminder.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ status: 'FAILED', failureReason: 'NO_CONTACT_METHOD' }),
      });
      expect(row).toBeDefined();
      expect(reminderQueue.add).not.toHaveBeenCalled();
    });

    it('refuses a patient outside the clinic and a merged chart', async () => {
      prisma.patient.findFirst.mockResolvedValue(null);
      await expect(service.scheduleStaffFollowUp(params())).rejects.toThrow(
        'Patient not found for this clinic',
      );
      expect(prisma.patient.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'patient-1', primaryClinicId: 'clinic-1' } }),
      );

      prisma.patient.findFirst.mockResolvedValue({ ...patient, mergedIntoPatientId: 'patient-2' });
      await expect(service.scheduleStaffFollowUp(params())).rejects.toMatchObject({
        response: { code: 'PATIENT_MERGED', canonicalPatientId: 'patient-2' },
      });
      expect(prisma.reminder.create).not.toHaveBeenCalled();
    });

    it.each([
      ['a past date', () => inDays(-2)],
      ['a date more than a year out', () => inDays(400)],
      ['a date that does not exist', () => '2026-02-30'],
    ])('refuses %s', async (_label, date) => {
      prisma.patient.findFirst.mockResolvedValue(patient);
      await expect(service.scheduleStaffFollowUp(params(date()))).rejects.toMatchObject({
        response: { code: 'VALIDATION_ERROR' },
      });
      expect(prisma.reminder.create).not.toHaveBeenCalled();
    });
  });

  it('limits the ledger to patient reminders when asked', async () => {
    prisma.reminder.findMany.mockResolvedValue([]);
    await service.list({ clinicId: 'clinic-1', patientRemindersOnly: true });
    expect(prisma.reminder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ clinicId: 'clinic-1', recipientType: 'PATIENT' }),
      }),
    );

    await service.list({ clinicId: 'clinic-1' });
    expect(prisma.reminder.findMany.mock.calls[1][0].where).not.toHaveProperty('recipientType');
  });
  // #116: staff may cancel a reminder they scheduled, while it is still queued.
  describe('cancelStaffReminder', () => {
    const staffReminder = (overrides: Record<string, unknown> = {}) =>
      createReminder({
        id: 'reminder-9',
        templateKey: 'FOLLOWUP_REMINDER_V1',
        appointmentId: null,
        appointment: null,
        createdByUserId: 'volunteer-1',
        status: 'QUEUED',
        ...overrides,
      });
    const cancel = (actorUserId = 'volunteer-1', canCancelAny = false) =>
      service.cancelStaffReminder({
        clinicId: 'clinic-1',
        reminderId: 'reminder-9',
        actorUserId,
        canCancelAny,
        requestId: 'req-1',
      });

    it('cancels its own queued reminder under the send lock, audits it and removes the job', async () => {
      prisma.reminder.findFirst.mockResolvedValue(staffReminder());
      const job = { remove: jest.fn().mockResolvedValue(undefined) };
      reminderQueue.getJob.mockResolvedValue(job);

      const result = await cancel();

      expect(prisma.$executeRaw).toHaveBeenCalled();
      expect(prisma.reminder.update).toHaveBeenCalledWith({
        where: { id: 'reminder-9' },
        data: { status: 'FAILED', failureReason: 'CANCELLED_BY_STAFF' },
      });
      expect(result).toMatchObject({ status: 'FAILED', failureReason: 'CANCELLED_BY_STAFF' });
      expect(auditService.logWrite).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'REMINDER.CANCEL', actorUserId: 'volunteer-1' }),
        prisma,
      );
      expect(job.remove).toHaveBeenCalled();
    });

    it("lets a manager cancel a colleague's, but not a volunteer", async () => {
      prisma.reminder.findFirst.mockResolvedValue(staffReminder());
      await expect(cancel('volunteer-2')).rejects.toThrow('Only the person who scheduled');
      await expect(cancel('manager-1', true)).resolves.toMatchObject({ status: 'FAILED' });
    });

    it.each([
      ['a reminder a workflow created', { createdByUserId: null }, 'REMINDER_NOT_CANCELLABLE'],
      ['a reminder already sent', { status: 'SENT' }, 'REMINDER_NOT_QUEUED'],
    ])('refuses %s', async (_label, overrides, code) => {
      prisma.reminder.findFirst.mockResolvedValue(staffReminder(overrides));
      await expect(cancel('volunteer-1', true)).rejects.toMatchObject({ response: { code } });
      expect(prisma.reminder.update).not.toHaveBeenCalled();
    });

    it('does not find a reminder from another clinic', async () => {
      prisma.reminder.findFirst.mockResolvedValue(null);
      await expect(cancel()).rejects.toThrow('Reminder not found in this clinic');
      expect(prisma.reminder.findFirst).toHaveBeenCalledWith({
        where: { id: 'reminder-9', clinicId: 'clinic-1' },
      });
    });
  });

  it('records who scheduled a staff follow-up, and only that path', async () => {
    prisma.patient.findFirst.mockResolvedValue({
      id: 'patient-1',
      patientCode: 'NKP-2026-000001',
      phoneE164: '+233240000000',
      email: null,
      mergedIntoPatientId: null,
    });
    await service.scheduleStaffFollowUp({
      clinicId: 'clinic-1',
      patientId: 'patient-1',
      followUpDate: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10),
      actorUserId: 'volunteer-1',
    });
    expect(prisma.reminder.create.mock.calls[0][0].data.createdByUserId).toBe('volunteer-1');

    prisma.reminder.create.mockClear();
    await service.scheduleFollowUpReminder({
      clinicId: 'clinic-1',
      clinicName: 'Clinic One',
      patientId: 'patient-1',
      patientCode: 'NKP-2026-000001',
      phoneE164: '+233240000000',
      encounterId: 'encounter-1',
      followUpDate: new Date(),
      actorUserId: 'doctor-1',
    });
    expect(prisma.reminder.create.mock.calls[0][0].data.createdByUserId).toBeNull();
  });
});
