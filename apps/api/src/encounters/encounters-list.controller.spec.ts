import { BadRequestException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PERMISSIONS } from '../auth/constants/permissions';
import { REQUIRE_PERMISSION_KEY } from '../auth/decorators/require-permission.decorator';
import { EncounterRepository, isGlucoseFlagged } from './encounter.repository';
import { EncounterService } from './encounter.service';
import { EncounterListQueryDto, EncountersController } from './encounters.controller';

/** Queue search and filters on GET /clinics/:clinicId/encounters (#340). */
describe('encounter list search and filters', () => {
  const invalid = async (query: object) =>
    (await validate(plainToInstance(EncounterListQueryDto, query))).map((e) => e.property);

  it('accepts each filter and trims the search', async () => {
    const query = {
      search: '  Abena ',
      bpClassification: 'STAGE2',
      glucoseFlagged: 'true',
      createdFrom: '2026-10-01',
      createdTo: '2026-10-31',
    };
    expect(await invalid(query)).toEqual([]);
    expect(plainToInstance(EncounterListQueryDto, query)).toMatchObject({
      search: 'Abena',
      glucoseFlagged: true,
    });
  });

  it.each([
    ['search', '   '],
    ['search', 'x'.repeat(81)],
    ['bpClassification', 'STAGE3'],
    ['glucoseFlagged', 'yes'],
    ['createdFrom', '10/01/2026'],
    ['createdTo', '2026-10-1'],
  ])('rejects %s=%j', async (field, value) => {
    expect(await invalid({ [field]: value })).toEqual([field]);
  });

  it('still requires ENCOUNTER.READ', () => {
    const permission = new Reflector().get(
      REQUIRE_PERMISSION_KEY,
      EncountersController.prototype.list,
    );
    expect(permission).toBe(PERMISSIONS.ENCOUNTER_READ);
  });

  function setup() {
    const prisma = {
      encounter: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(73),
      },
      clinic: { findUnique: jest.fn().mockResolvedValue({ timezone: 'America/New_York' }) },
    };
    const service = new EncounterService(
      new EncounterRepository(prisma as never),
      prisma as never,
      {} as never,
      {} as never,
    );
    return { prisma, service, controller: new EncountersController(service) };
  }

  it('keeps every filter inside the clinic and returns the match count in a header', async () => {
    const { prisma, controller } = setup();
    const res = { setHeader: jest.fn() };
    await controller.list(
      { clinicId: 'clinic-1' },
      {
        status: 'IN_REVIEW',
        stage: 'REVIEW',
        search: 'abena',
        bpClassification: 'STAGE1',
        glucoseFlagged: true,
        createdFrom: '2026-10-09',
        createdTo: '2026-10-09',
      },
      res as never,
    );
    const where = prisma.encounter.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({
      clinicId: 'clinic-1',
      status: 'IN_REVIEW',
      preceptorReviewedById: null,
      hypertensionAssessment: { is: { classification: 'STAGE1' } },
      diabetesScreening: { is: expect.any(Object) },
      // The New York day of 9 Oct, not the UTC one.
      createdAt: {
        gte: new Date('2026-10-09T04:00:00.000Z'),
        lte: new Date('2026-10-10T03:59:59.999Z'),
      },
    });
    expect(where.patient.OR).toHaveLength(4);
    expect(prisma.encounter.count.mock.calls[0][0].where).toEqual(where);
    expect(res.setHeader).toHaveBeenCalledWith('X-Total-Count', '73');
  });

  it.each([
    [{ from: '2026-02-30' }, 'createdFrom'],
    [{ from: '2026-10-10', to: '2026-10-09' }, 'createdTo'],
  ])('refuses the dates %j before querying', async (created, field) => {
    const { prisma, service } = setup();
    const error = await service.listQueuePage('clinic-1', {}, created).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      fieldErrors: [{ field }],
    });
    expect(prisma.encounter.findMany).not.toHaveBeenCalled();
  });

  it.each([
    [{ glucoseType: 'FASTING', glucoseMgDl: 126 }, true],
    [{ glucoseType: 'FASTING', glucoseMgDl: 125 }, false],
    [{ glucoseType: 'RANDOM', glucoseMgDl: 200 }, true],
    [{ glucoseType: 'RANDOM', glucoseMgDl: 199 }, false],
    [{ glucoseType: 'UNKNOWN', glucoseMgDl: 400 }, false],
    [{ glucoseType: 'FASTING', glucoseMgDl: null }, false],
  ])('flags glucose %j as %s', (screening, flagged) => {
    expect(isGlucoseFlagged(screening)).toBe(flagged);
  });
});
