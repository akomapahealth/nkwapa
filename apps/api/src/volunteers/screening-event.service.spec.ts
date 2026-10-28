import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { ROSTER_RESEND_LIMIT, ScreeningEventService } from './screening-event.service';

const CLINIC_A = 'aa000000-0000-4000-8000-0000000000a1';
const EVENT_ID = 'ee000000-0000-4000-8000-0000000000e1';
const ASSIGNMENT_ID = 'ff000000-0000-4000-8000-0000000000f1';
const CONTACT_ID = 'cc000000-0000-4000-8000-0000000000c1';
const DAY = 24 * 60 * 60 * 1000;

function eventRow(overrides: Record<string, unknown> = {}) {
  const startsAt = new Date(Date.now() + 7 * DAY);
  return {
    id: EVENT_ID,
    clinicId: CLINIC_A,
    title: 'Saturday screening',
    startsAt,
    endsAt: new Date(startsAt.getTime() + 4 * 60 * 60 * 1000),
    siteName: 'Community hall',
    siteAddress: null,
    notes: null,
    status: 'SCHEDULED',
    createdByUserId: 'manager-a',
    cancelledAt: null,
    cancelReason: null,
    detailsChangedAt: new Date(Date.now() - DAY),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

const recipient = {
  id: ASSIGNMENT_ID,
  status: 'ASSIGNED',
  volunteerContactId: CONTACT_ID,
  volunteerContact: { displayName: 'Ama Owusu', email: 'ama@clinic.org' },
};

describe('ScreeningEventService', () => {
  let prisma: {
    screeningEvent: { findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
    screeningEventAssignment: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      upsert: jest.Mock;
    };
    volunteerContact: { findMany: jest.Mock };
    clinic: { findUniqueOrThrow: jest.Mock };
    user: { findUnique: jest.Mock };
    auditEvent: { count: jest.Mock };
  };
  let audit: { logWrite: jest.Mock };
  let reminders: { sendNotificationNow: jest.Mock };
  let service: ScreeningEventService;

  beforeEach(() => {
    prisma = {
      screeningEvent: {
        findFirst: jest.fn().mockResolvedValue(eventRow()),
        create: jest.fn(async ({ data }) => eventRow(data)),
        update: jest.fn(async ({ data }) => eventRow(data)),
      },
      screeningEventAssignment: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(recipient),
        update: jest.fn(),
        upsert: jest.fn(),
      },
      volunteerContact: { findMany: jest.fn() },
      clinic: {
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue({ name: 'Clinic A', timezone: 'Africa/Accra' }),
      },
      user: { findUnique: jest.fn().mockResolvedValue({ displayName: 'Kofi Manager' }) },
      auditEvent: { count: jest.fn().mockResolvedValue(0) },
    };
    audit = { logWrite: jest.fn() };
    reminders = {
      sendNotificationNow: jest.fn().mockResolvedValue({ id: 'reminder-1', status: 'QUEUED' }),
    };
    const emailStatus = { getStatus: () => ({ available: true }) };
    service = new ScreeningEventService(
      prisma as never,
      audit as never,
      reminders as never,
      emailStatus as never,
    );
  });

  const actions = () => audit.logWrite.mock.calls.map(([call]) => call.action);

  describe('create', () => {
    const base = { title: 'Screening', siteName: 'Hall' };

    it('refuses an end before the start', async () => {
      const startsAt = new Date(Date.now() + DAY).toISOString();
      await expect(
        service.create(CLINIC_A, 'manager-a', { ...base, startsAt, endsAt: startsAt }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses a start in the past', async () => {
      await expect(
        service.create(CLINIC_A, 'manager-a', {
          ...base,
          startsAt: new Date(Date.now() - DAY).toISOString(),
          endsAt: new Date(Date.now() + DAY).toISOString(),
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('creates and audits once', async () => {
      await service.create(CLINIC_A, 'manager-a', {
        ...base,
        startsAt: new Date(Date.now() + DAY).toISOString(),
        endsAt: new Date(Date.now() + DAY + 3600_000).toISOString(),
      });
      expect(actions()).toEqual(['SCREENING_EVENT.CREATE']);
    });
  });

  it('answers 404 for an event outside the path clinic', async () => {
    prisma.screeningEvent.findFirst.mockResolvedValue(null);
    await expect(service.get(CLINIC_A, EVENT_ID)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.screeningEvent.findFirst).toHaveBeenCalledWith({
      where: { id: EVENT_ID, clinicId: CLINIC_A },
    });
  });

  it.each(['CANCELLED', 'COMPLETED'])('returns 409 on edits to a %s event', async (status) => {
    prisma.screeningEvent.findFirst.mockResolvedValue(eventRow({ status }));
    await expect(
      service.update(CLINIC_A, EVENT_ID, 'manager-a', { title: 'New' }),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service.cancel(CLINIC_A, EVENT_ID, 'manager-a', { reason: 'x' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  describe('update', () => {
    it('emails notified volunteers when the time changes and the option is on', async () => {
      prisma.screeningEventAssignment.findMany.mockResolvedValue([recipient]);
      const startsAt = new Date(Date.now() + 8 * DAY);
      const result = await service.update(CLINIC_A, EVENT_ID, 'manager-a', {
        startsAt: startsAt.toISOString(),
        endsAt: new Date(startsAt.getTime() + 3600_000).toISOString(),
      });
      expect(result.notified).toBe(1);
      expect(prisma.screeningEventAssignment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'ASSIGNED', lastNotifiedAt: { not: null } }),
        }),
      );
      expect(reminders.sendNotificationNow.mock.calls[0][0]).toMatchObject({
        templateKey: 'VOLUNTEER_ROSTER_UPDATED_V1',
        screeningEventAssignmentId: ASSIGNMENT_ID,
        recipientType: 'USER',
      });
      expect(actions()).toEqual(['SCREENING_EVENT.UPDATE']);
    });

    it('sends nothing when the manager turns the option off', async () => {
      prisma.screeningEventAssignment.findMany.mockResolvedValue([recipient]);
      await service.update(CLINIC_A, EVENT_ID, 'manager-a', {
        siteName: 'Another hall',
        notifyChange: false,
      });
      expect(reminders.sendNotificationNow).not.toHaveBeenCalled();
    });

    it('sends nothing when only the title changes', async () => {
      prisma.screeningEventAssignment.findMany.mockResolvedValue([recipient]);
      await service.update(CLINIC_A, EVENT_ID, 'manager-a', { title: 'Renamed' });
      expect(reminders.sendNotificationNow).not.toHaveBeenCalled();
    });
  });

  it('cancels with a CANCELLED email unless turned off', async () => {
    prisma.screeningEventAssignment.findMany.mockResolvedValue([recipient]);
    await service.cancel(CLINIC_A, EVENT_ID, 'manager-a', { reason: 'Rain' });
    expect(reminders.sendNotificationNow.mock.calls[0][0]).toMatchObject({
      templateKey: 'VOLUNTEER_ROSTER_CANCELLED_V1',
      payload: expect.objectContaining({ cancelReason: 'Rain' }),
    });

    reminders.sendNotificationNow.mockClear();
    prisma.screeningEvent.findFirst.mockResolvedValue(eventRow());
    await service.cancel(CLINIC_A, EVENT_ID, 'manager-a', {
      reason: 'Rain',
      notifyVolunteers: false,
    });
    expect(reminders.sendNotificationNow).not.toHaveBeenCalled();
    expect(actions()).toEqual(['SCREENING_EVENT.CANCEL', 'SCREENING_EVENT.CANCEL']);
  });

  describe('roster', () => {
    it('refuses an inactive contact with 400', async () => {
      prisma.volunteerContact.findMany.mockResolvedValue([{ id: CONTACT_ID, isActive: false }]);
      await expect(
        service.addToRoster(CLINIC_A, EVENT_ID, 'manager-a', [CONTACT_ID]),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.screeningEventAssignment.upsert).not.toHaveBeenCalled();
    });

    it("answers 404 for another clinic's contact", async () => {
      prisma.volunteerContact.findMany.mockResolvedValue([]);
      await expect(
        service.addToRoster(CLINIC_A, EVENT_ID, 'manager-a', [CONTACT_ID]),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('re-adding reactivates the same row and audits once', async () => {
      prisma.volunteerContact.findMany.mockResolvedValue([{ id: CONTACT_ID, isActive: true }]);
      await service.addToRoster(CLINIC_A, EVENT_ID, 'manager-a', [CONTACT_ID, CONTACT_ID]);
      expect(prisma.screeningEventAssignment.upsert).toHaveBeenCalledTimes(1);
      expect(prisma.screeningEventAssignment.upsert.mock.calls[0][0]).toMatchObject({
        where: {
          eventId_volunteerContactId: { eventId: EVENT_ID, volunteerContactId: CONTACT_ID },
        },
        update: { status: 'ASSIGNED', removedAt: null },
      });
      expect(actions()).toEqual(['ROSTER.ADD']);
    });

    it('removes without email by default, and with REMOVED when asked', async () => {
      await service.removeFromRoster(CLINIC_A, EVENT_ID, ASSIGNMENT_ID, 'manager-a', false);
      expect(reminders.sendNotificationNow).not.toHaveBeenCalled();
      await service.removeFromRoster(CLINIC_A, EVENT_ID, ASSIGNMENT_ID, 'manager-a', true);
      expect(reminders.sendNotificationNow.mock.calls[0][0].templateKey).toBe(
        'VOLUNTEER_ROSTER_REMOVED_V1',
      );
      expect(actions()).toEqual(['ROSTER.REMOVE', 'ROSTER.REMOVE']);
    });
  });

  it('notify sends only to ASSIGNED rows not told the current details', async () => {
    const event = eventRow();
    prisma.screeningEvent.findFirst.mockResolvedValue(event);
    prisma.screeningEventAssignment.findMany.mockResolvedValue([recipient]);
    const result = await service.notify(CLINIC_A, EVENT_ID, 'manager-a');
    expect(result).toEqual({ queued: 1 });
    expect(prisma.screeningEventAssignment.findMany.mock.calls[0][0].where).toEqual({
      clinicId: CLINIC_A,
      eventId: EVENT_ID,
      status: 'ASSIGNED',
      OR: [{ lastNotifiedAt: null }, { lastNotifiedAt: { lt: event.detailsChangedAt } }],
    });
    const sent = reminders.sendNotificationNow.mock.calls[0][0];
    expect(sent.templateKey).toBe('VOLUNTEER_ROSTER_ASSIGNED_V1');
    expect(sent.toAddress).toBe('ama@clinic.org');
    expect(Object.keys(sent.payload).sort()).toEqual(
      [
        'clinicName',
        'endsAt',
        'firstName',
        'notes',
        'senderName',
        'siteAddress',
        'siteName',
        'startsAt',
        'timezone',
        'title',
      ].sort(),
    );
    expect(sent.payload.firstName).toBe('Ama');
    expect(prisma.screeningEventAssignment.update).toHaveBeenCalledWith({
      where: { id: ASSIGNMENT_ID },
      data: { lastNotifiedAt: expect.any(Date) },
    });
    expect(actions()).toEqual(['ROSTER.NOTIFY']);
  });

  describe('resend', () => {
    it('creates a new ledger row and audits it', async () => {
      const result = await service.resend(CLINIC_A, EVENT_ID, ASSIGNMENT_ID, 'manager-a');
      expect(result).toEqual({ reminderId: 'reminder-1', status: 'QUEUED' });
      expect(reminders.sendNotificationNow.mock.calls[0][0].payload.resend).toBe(true);
      expect(actions()).toEqual(['ROSTER.RESEND']);
    });

    it(`refuses the resend after ${ROSTER_RESEND_LIMIT} in an hour with 429`, async () => {
      prisma.auditEvent.count.mockResolvedValue(ROSTER_RESEND_LIMIT);
      const attempt = service.resend(CLINIC_A, EVENT_ID, ASSIGNMENT_ID, 'manager-a');
      await expect(attempt).rejects.toBeInstanceOf(HttpException);
      await attempt.catch((error: HttpException) =>
        expect(error.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS),
      );
      expect(prisma.auditEvent.count.mock.calls[0][0].where).toMatchObject({
        clinicId: CLINIC_A,
        action: 'ROSTER.RESEND',
        entityId: ASSIGNMENT_ID,
      });
      expect(reminders.sendNotificationNow).not.toHaveBeenCalled();
    });

    it("answers 404 for another event's assignment", async () => {
      prisma.screeningEventAssignment.findFirst.mockResolvedValue(null);
      await expect(
        service.resend(CLINIC_A, EVENT_ID, ASSIGNMENT_ID, 'manager-a'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.screeningEventAssignment.findFirst.mock.calls[0][0].where).toEqual({
        id: ASSIGNMENT_ID,
        clinicId: CLINIC_A,
        eventId: EVENT_ID,
      });
    });
  });
});
