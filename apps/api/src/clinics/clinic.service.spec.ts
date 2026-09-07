import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { ClinicService } from './clinic.service';

/** The unique-key violation Postgres raises for `@@unique([organizationId, locationCode])`. */
function uniqueViolation() {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target: ['organizationId', 'locationCode'] },
  });
}

function buildService() {
  const prisma = {
    clinic: {
      create: jest.fn(),
      update: jest.fn(),
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    organization: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn(),
      create: jest.fn(),
    },
  };
  return { prisma, service: new ClinicService(prisma as never) };
}

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';

describe('ClinicService.create', () => {
  it('stores the metadata it was given, normalized', async () => {
    const { prisma, service } = buildService();
    prisma.organization.findUnique.mockResolvedValue({ id: ORGANIZATION_ID });
    prisma.clinic.create.mockResolvedValue({ id: 'clinic-1' });

    await service.create({
      name: 'Ridge Clinic',
      organizationId: ORGANIZATION_ID,
      timezone: 'Africa/Accra',
      locationCode: 'Ridge-Clinic',
      zoneCode: '  Greater-Accra  ',
      countryCode: 'gh',
    });

    expect(prisma.clinic.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        locationCode: 'ridge-clinic',
        zoneCode: 'greater-accra',
        countryCode: 'GH',
        timezone: 'Africa/Accra',
      }),
    });
  });

  it('derives a location code from the name when none was given', async () => {
    const { prisma, service } = buildService();
    prisma.organization.findFirst.mockResolvedValue({ id: ORGANIZATION_ID });
    prisma.clinic.create.mockResolvedValue({ id: 'clinic-1' });

    await service.create({ name: 'Nkwapa Clinic - Demo' });

    expect(prisma.clinic.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ locationCode: 'nkwapa-clinic-demo' }),
    });
  });

  it('stores an absent zone code as null rather than an empty string', async () => {
    const { prisma, service } = buildService();
    prisma.organization.findFirst.mockResolvedValue({ id: ORGANIZATION_ID });
    prisma.clinic.create.mockResolvedValue({ id: 'clinic-1' });

    await service.create({ name: 'Ridge Clinic', zoneCode: '   ' });

    expect(prisma.clinic.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ zoneCode: null }),
    });
  });

  it('refuses an organization that does not exist, naming the field', async () => {
    const { prisma, service } = buildService();
    prisma.organization.findUnique.mockResolvedValue(null);

    await expect(
      service.create({ name: 'Ridge Clinic', organizationId: ORGANIZATION_ID }),
    ).rejects.toMatchObject({
      response: {
        fieldErrors: [{ field: 'organizationId', message: expect.any(String) }],
      },
    });
    expect(prisma.clinic.create).not.toHaveBeenCalled();
  });

  it('refuses a location code already used in the same organization', async () => {
    const { prisma, service } = buildService();
    prisma.organization.findFirst.mockResolvedValue({ id: ORGANIZATION_ID });
    prisma.clinic.findFirst.mockResolvedValue({ id: 'clinic-9', name: 'Ridge Clinic' });

    const error = await service
      .create({ name: 'Ridge Annex', locationCode: 'ridge' })
      .catch((e) => e);

    expect(error).toBeInstanceOf(ConflictException);
    expect(error.response).toMatchObject({
      code: 'CLINIC_LOCATION_CODE_CONFLICT',
      fieldErrors: [{ field: 'locationCode', message: expect.any(String) }],
    });
    // The clash is named, so the operator knows which clinic already holds the code.
    expect(error.response.message).toContain('Ridge Clinic');
    expect(prisma.clinic.create).not.toHaveBeenCalled();
  });

  it('turns a lost uniqueness race into a conflict rather than a 500', async () => {
    const { prisma, service } = buildService();
    prisma.organization.findFirst.mockResolvedValue({ id: ORGANIZATION_ID });
    // The pre-check passes, then a concurrent create takes the code first.
    prisma.clinic.create.mockRejectedValue(uniqueViolation());

    const error = await service.create({ name: 'Ridge Clinic' }).catch((e) => e);

    expect(error).toBeInstanceOf(ConflictException);
    expect(error.response.code).toBe('CLINIC_LOCATION_CODE_CONFLICT');
  });

  it('lets an unrelated database error surface unchanged', async () => {
    const { prisma, service } = buildService();
    prisma.organization.findFirst.mockResolvedValue({ id: ORGANIZATION_ID });
    prisma.clinic.create.mockRejectedValue(new Error('connection reset'));

    await expect(service.create({ name: 'Ridge Clinic' })).rejects.toThrow('connection reset');
  });

  it('clamps a derived code to the column width', async () => {
    const { prisma, service } = buildService();
    prisma.organization.findFirst.mockResolvedValue({ id: ORGANIZATION_ID });
    prisma.clinic.create.mockResolvedValue({ id: 'clinic-1' });

    await service.create({ name: `${'Kumasi Regional Teaching '.repeat(5)}Annex` });

    const { locationCode } = prisma.clinic.create.mock.calls[0][0].data;
    expect(locationCode.length).toBeLessThanOrEqual(64);
    expect(locationCode.endsWith('-')).toBe(false);
  });
});

describe('ClinicService.update', () => {
  const existing = { organizationId: ORGANIZATION_ID, locationCode: 'ridge' };

  it('writes only the fields it was given', async () => {
    const { prisma, service } = buildService();
    prisma.clinic.findUnique.mockResolvedValue(existing);
    prisma.clinic.update.mockResolvedValue({ id: 'clinic-1' });

    await service.update('clinic-1', { timezone: 'Europe/London' });

    expect(prisma.clinic.update).toHaveBeenCalledWith({
      where: { id: 'clinic-1' },
      data: { timezone: 'Europe/London' },
    });
  });

  it('refuses to blank out a location code', async () => {
    const { prisma, service } = buildService();
    prisma.clinic.findUnique.mockResolvedValue(existing);

    const error = await service.update('clinic-1', { locationCode: '   ' }).catch((e) => e);

    expect(error).toBeInstanceOf(BadRequestException);
    expect(error.response.fieldErrors).toEqual([
      { field: 'locationCode', message: expect.any(String) },
    ]);
    expect(prisma.clinic.update).not.toHaveBeenCalled();
  });

  it('allows saving a clinic with its code unchanged', async () => {
    const { prisma, service } = buildService();
    prisma.clinic.findUnique.mockResolvedValue(existing);
    prisma.clinic.update.mockResolvedValue({ id: 'clinic-1' });

    await service.update('clinic-1', { locationCode: 'ridge' });

    // No uniqueness lookup, because the code did not move.
    expect(prisma.clinic.findFirst).not.toHaveBeenCalled();
    expect(prisma.clinic.update).toHaveBeenCalled();
  });

  it('refuses to move a code onto one another clinic already holds', async () => {
    const { prisma, service } = buildService();
    prisma.clinic.findUnique.mockResolvedValue(existing);
    prisma.clinic.findFirst.mockResolvedValue({ id: 'clinic-2', name: 'Tema Annex' });

    await expect(service.update('clinic-1', { locationCode: 'tema' })).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.clinic.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { not: 'clinic-1' } }),
      }),
    );
  });

  it('clears a zone code when it is explicitly emptied', async () => {
    const { prisma, service } = buildService();
    prisma.clinic.findUnique.mockResolvedValue(existing);
    prisma.clinic.update.mockResolvedValue({ id: 'clinic-1' });

    await service.update('clinic-1', { zoneCode: '' });

    expect(prisma.clinic.update).toHaveBeenCalledWith({
      where: { id: 'clinic-1' },
      data: { zoneCode: null },
    });
  });

  it('reports a clinic that has since been removed', async () => {
    const { prisma, service } = buildService();
    prisma.clinic.findUnique.mockResolvedValue(null);

    await expect(service.update('clinic-1', { name: 'Ridge' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('ClinicService.listAllForAdmin', () => {
  const clinicRow = {
    id: 'clinic-1',
    organizationId: ORGANIZATION_ID,
    name: 'Ridge Clinic',
    region: 'Greater Accra',
    countryCode: 'GH',
    timezone: 'Africa/Accra',
    locationCode: 'ridge-clinic',
    zoneCode: 'greater-accra',
    isActive: true,
    organization: {
      id: ORGANIZATION_ID,
      name: 'Nkwapa Health',
      slug: 'default',
      timezone: 'Africa/Accra',
    },
  };
  const systemAdmin = {
    userId: 'admin-1',
    roles: [{ clinicId: null, role: UserRole.SYSTEM_ADMIN }],
  };

  it('attaches the organization and an empty issue list to a healthy clinic', async () => {
    const { prisma, service } = buildService();
    prisma.clinic.findMany.mockResolvedValue([clinicRow]);

    const [clinic] = await service.listAllForAdmin(systemAdmin);

    expect(clinic.organization).toMatchObject({ name: 'Nkwapa Health', slug: 'default' });
    expect(clinic.metadataIssues).toEqual([]);
  });

  it('reports the metadata problems on a drifted clinic', async () => {
    const { prisma, service } = buildService();
    prisma.clinic.findMany.mockResolvedValue([
      { ...clinicRow, timezone: 'Africa/Akra', locationCode: '', zoneCode: null },
    ]);

    const [clinic] = await service.listAllForAdmin(systemAdmin);

    expect(clinic.metadataIssues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(['TIMEZONE_UNKNOWN', 'LOCATION_CODE_MISSING', 'ZONE_CODE_MISSING']),
    );
  });

  it('returns nothing for a director with no clinics, without querying', async () => {
    const { prisma, service } = buildService();

    await expect(
      service.listAllForAdmin({
        userId: 'd',
        roles: [{ clinicId: null, role: UserRole.DIRECTOR }],
      }),
    ).resolves.toEqual([]);
    expect(prisma.clinic.findMany).not.toHaveBeenCalled();
  });

  it('limits a director to the clinics they direct', async () => {
    const { prisma, service } = buildService();
    prisma.clinic.findMany.mockResolvedValue([clinicRow]);

    await service.listAllForAdmin({
      userId: 'd',
      roles: [{ clinicId: 'clinic-1', role: UserRole.DIRECTOR }],
    });

    expect(prisma.clinic.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ['clinic-1'] } } }),
    );
  });
});

describe('ClinicService.listOrganizations', () => {
  it('reports each organization with how many clinics it holds', async () => {
    const { prisma, service } = buildService();
    prisma.organization.findMany.mockResolvedValue([
      {
        id: ORGANIZATION_ID,
        name: 'Nkwapa Health',
        slug: 'default',
        timezone: 'Africa/Accra',
        _count: { clinics: 3 },
      },
    ]);

    await expect(service.listOrganizations()).resolves.toEqual([
      {
        id: ORGANIZATION_ID,
        name: 'Nkwapa Health',
        slug: 'default',
        timezone: 'Africa/Accra',
        clinicCount: 3,
      },
    ]);
  });
});

describe('ClinicService default organization', () => {
  it('reuses the existing organization rather than making another', async () => {
    const { prisma, service } = buildService();
    prisma.organization.findFirst.mockResolvedValue({ id: ORGANIZATION_ID });
    prisma.clinic.create.mockResolvedValue({ id: 'clinic-1' });

    await service.create({ name: 'Ridge Clinic' });

    expect(prisma.organization.upsert).not.toHaveBeenCalled();
    expect(prisma.clinic.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ organizationId: ORGANIZATION_ID }),
    });
  });

  it('upserts on the slug when there is no organization at all', async () => {
    const { prisma, service } = buildService();
    prisma.organization.findFirst.mockResolvedValue(null);
    prisma.organization.upsert.mockResolvedValue({ id: ORGANIZATION_ID });
    prisma.clinic.create.mockResolvedValue({ id: 'clinic-1' });

    await service.create({ name: 'Ridge Clinic' });

    // An upsert, not a create: a read-then-create could mint a second "default" organization
    // under concurrency, which is the metadata problem this work exists to stop.
    expect(prisma.organization.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { slug: 'default' } }),
    );
  });
});
