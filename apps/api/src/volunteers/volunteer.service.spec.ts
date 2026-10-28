import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { VolunteerService } from './volunteer.service';

const CLINIC_A = 'aa000000-0000-4000-8000-0000000000a1';
const CONTACT_ID = 'cc000000-0000-4000-8000-0000000000c1';
const USER_ID = 'dd000000-0000-4000-8000-0000000000d1';

function contactRow(overrides: Record<string, unknown> = {}) {
  return {
    id: CONTACT_ID,
    clinicId: CLINIC_A,
    displayName: 'Ama Owusu',
    email: 'ama@clinic.org',
    phoneE164: null,
    notes: null,
    linkedUserId: null,
    isActive: true,
    createdByUserId: 'manager-a',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('VolunteerService', () => {
  let prisma: {
    volunteerContact: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    user: { findFirst: jest.Mock; findMany: jest.Mock };
  };
  let audit: { logWrite: jest.Mock };
  let deliverability: { assertDomainAcceptsEmail: jest.Mock };
  let service: VolunteerService;

  beforeEach(() => {
    prisma = {
      volunteerContact: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(async ({ data }) => contactRow(data)),
        update: jest.fn(async ({ data }) => contactRow(data)),
      },
      user: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    };
    audit = { logWrite: jest.fn() };
    deliverability = { assertDomainAcceptsEmail: jest.fn() };
    service = new VolunteerService(prisma as never, audit as never, deliverability as never);
  });

  it('creates a contact, checks the domain, and audits once', async () => {
    const created = await service.create(CLINIC_A, 'manager-a', {
      displayName: 'Ama Owusu',
      email: 'ama@clinic.org',
    });
    expect(created.email).toBe('ama@clinic.org');
    expect(deliverability.assertDomainAcceptsEmail).toHaveBeenCalledWith('ama@clinic.org');
    expect(audit.logWrite).toHaveBeenCalledTimes(1);
    expect(audit.logWrite.mock.calls[0][0]).toMatchObject({
      clinicId: CLINIC_A,
      action: 'VOLUNTEER.CREATE',
    });
  });

  it('refuses a duplicate email in the same clinic with 409 and the existing id', async () => {
    prisma.volunteerContact.findFirst.mockResolvedValueOnce({ id: CONTACT_ID });
    const attempt = service.create(CLINIC_A, 'manager-a', {
      displayName: 'Ama',
      email: 'ama@clinic.org',
    });
    await expect(attempt).rejects.toBeInstanceOf(ConflictException);
    await attempt.catch((error: ConflictException) =>
      expect(error.getResponse()).toMatchObject({
        code: 'VOLUNTEER_EMAIL_EXISTS',
        existingId: CONTACT_ID,
      }),
    );
    expect(prisma.volunteerContact.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { clinicId: CLINIC_A, email: 'ama@clinic.org' } }),
    );
    expect(prisma.volunteerContact.create).not.toHaveBeenCalled();
    expect(audit.logWrite).not.toHaveBeenCalled();
  });

  it('answers 404 for a contact outside the path clinic', async () => {
    await expect(
      service.update(CLINIC_A, CONTACT_ID, 'manager-a', { displayName: 'X' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.volunteerContact.findFirst).toHaveBeenCalledWith({
      where: { id: CONTACT_ID, clinicId: CLINIC_A },
    });
  });

  it('re-validates the email only when it changes', async () => {
    prisma.volunteerContact.findFirst.mockResolvedValueOnce(contactRow());
    await service.update(CLINIC_A, CONTACT_ID, 'manager-a', { email: 'ama@clinic.org' });
    expect(deliverability.assertDomainAcceptsEmail).not.toHaveBeenCalled();

    prisma.volunteerContact.findFirst
      .mockResolvedValueOnce(contactRow())
      .mockResolvedValueOnce(null);
    await service.update(CLINIC_A, CONTACT_ID, 'manager-a', { email: 'ama.new@clinic.org' });
    expect(deliverability.assertDomainAcceptsEmail).toHaveBeenCalledWith('ama.new@clinic.org');
  });

  it('deactivates and reactivates with one audit each', async () => {
    prisma.volunteerContact.findFirst.mockResolvedValue(contactRow());
    await service.setActive(CLINIC_A, CONTACT_ID, 'manager-a', false);
    await service.setActive(CLINIC_A, CONTACT_ID, 'manager-a', true);
    expect(audit.logWrite.mock.calls.map(([call]) => call.action)).toEqual([
      'VOLUNTEER.DEACTIVATE',
      'VOLUNTEER.REACTIVATE',
    ]);
  });

  describe('link', () => {
    beforeEach(() => prisma.volunteerContact.findFirst.mockResolvedValue(contactRow()));

    it('links a user with a role at this clinic and the same email', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: USER_ID, email: 'Ama@Clinic.org' });
      const linked = await service.link(CLINIC_A, CONTACT_ID, 'manager-a', USER_ID);
      expect(linked.linkedUserId).toBe(USER_ID);
      expect(prisma.user.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: USER_ID, clinicRoles: { some: { clinicId: CLINIC_A } } },
        }),
      );
      expect(audit.logWrite.mock.calls[0][0].action).toBe('VOLUNTEER.LINK');
    });

    it('refuses a user with no role at this clinic', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      await expect(service.link(CLINIC_A, CONTACT_ID, 'manager-a', USER_ID)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.volunteerContact.update).not.toHaveBeenCalled();
    });

    it('refuses a user whose email differs', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: USER_ID, email: 'someone@clinic.org' });
      await expect(service.link(CLINIC_A, CONTACT_ID, 'manager-a', USER_ID)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(audit.logWrite).not.toHaveBeenCalled();
    });

    it('unlinks with one audit', async () => {
      await service.unlink(CLINIC_A, CONTACT_ID, 'manager-a');
      expect(prisma.volunteerContact.update).toHaveBeenCalledWith({
        where: { id: CONTACT_ID },
        data: { linkedUserId: null },
      });
      expect(audit.logWrite.mock.calls[0][0].action).toBe('VOLUNTEER.UNLINK');
    });
  });

  it('offers a link candidate by matching email but never links on its own', async () => {
    prisma.volunteerContact.findMany.mockResolvedValue([{ ...contactRow(), linkedUser: null }]);
    prisma.user.findMany.mockResolvedValue([
      { id: USER_ID, displayName: 'Ama Owusu', email: 'AMA@clinic.org' },
    ]);
    const { items } = await service.list(CLINIC_A);
    expect(items[0].linkCandidate).toEqual({ id: USER_ID, displayName: 'Ama Owusu' });
    expect(items[0].linkedUserId).toBeNull();
    expect(prisma.volunteerContact.update).not.toHaveBeenCalled();
  });
});
