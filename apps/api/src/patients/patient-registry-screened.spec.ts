import { BadRequestException } from '@nestjs/common';
import { Patient } from '@prisma/client';
import { PatientService, rankByLastVisit } from './patient.service';
import type { MatchingScreeningRow, PatientRepository } from './patient.repository';
import type { PrismaService } from '../prisma/prisma.service';

function patient(id: string): Patient {
  return { id, patientCode: `NKP-${id}`, firstName: 'Ama', lastName: id } as Patient;
}

function reviewRow(
  patientId: string,
  checkInId: string,
  completedAt: string,
): MatchingScreeningRow {
  return {
    id: checkInId,
    patientId,
    checkedInAt: new Date(new Date(completedAt).getTime() - 3_600_000),
    stationVisits: [{ completedAt: new Date(completedAt) }],
  };
}

function legacyRow(
  patientId: string,
  checkInId: string,
  checkedInAt: string,
): MatchingScreeningRow {
  return { id: checkInId, patientId, checkedInAt: new Date(checkedInAt), stationVisits: [] };
}

describe('PatientService.listRegistry - completed screening filter', () => {
  let repo: {
    findMany: jest.Mock;
    count: jest.Mock;
    findIds: jest.Mock;
    findManyByIds: jest.Mock;
    findMatchingScreenings: jest.Mock;
    findLastVisits: jest.Mock;
  };
  let clinicFindUnique: jest.Mock;
  let service: PatientService;

  beforeEach(() => {
    repo = {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      findIds: jest.fn().mockResolvedValue([]),
      findManyByIds: jest.fn().mockResolvedValue([]),
      findMatchingScreenings: jest.fn().mockResolvedValue([]),
      findLastVisits: jest.fn().mockResolvedValue(new Map()),
    };
    clinicFindUnique = jest.fn().mockResolvedValue({ timezone: 'America/New_York' });
    const prisma = { clinic: { findUnique: clinicFindUnique } } as unknown as PrismaService;
    service = new PatientService(
      repo as unknown as PatientRepository,
      prisma,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
    );
  });

  it('is unchanged without the date params: no lookup, no matchingScreenings, no timezone', async () => {
    repo.findMany.mockResolvedValue([patient('p1')]);
    repo.count.mockResolvedValue(1);

    const page = await service.listRegistry('clinic-1', '', 1, 25);

    expect(repo.findMany.mock.calls[0][0].screened).toBeUndefined();
    expect(repo.findMatchingScreenings).not.toHaveBeenCalled();
    expect(clinicFindUnique).not.toHaveBeenCalled();
    expect(page).not.toHaveProperty('timezone');
    expect(page.items[0]).not.toHaveProperty('matchingScreenings');
  });

  it('scopes the filter to the requested clinic, in its timezone', async () => {
    await service.listRegistry('clinic-1', '', 1, 25, { screened: { from: '2026-10-10' } });

    expect(repo.findMany.mock.calls[0][0].screened).toEqual({
      clinicId: 'clinic-1',
      start: new Date('2026-10-10T04:00:00.000Z'),
      end: new Date('2026-10-11T03:59:59.999Z'),
    });
    expect(repo.count.mock.calls[0][0].screened.clinicId).toBe('clinic-1');
  });

  it('dates a 23:30 local Review completion on the local day and lists both of a patient’s dates once', async () => {
    repo.findMany.mockResolvedValue([patient('p1')]);
    repo.count.mockResolvedValue(1);
    repo.findMatchingScreenings.mockResolvedValue([
      reviewRow('p1', 'c-3oct', '2026-10-03T14:00:00.000Z'),
      // 23:30 in New York on 10 Oct.
      reviewRow('p1', 'c-10oct', '2026-10-11T03:30:00.000Z'),
    ]);

    const page = await service.listRegistry('clinic-1', '', 1, 25, {
      screened: { from: '2026-10-01', to: '2026-10-15' },
    });

    expect(page.total).toBe(1);
    expect(page.timezone).toBe('America/New_York');
    expect(page.items).toHaveLength(1);
    expect(page.items[0].matchingScreenings).toEqual([
      {
        date: '2026-10-10',
        completedAt: '2026-10-11T03:30:00.000Z',
        source: 'REVIEW_STATION',
        checkInId: 'c-10oct',
      },
      {
        date: '2026-10-03',
        completedAt: '2026-10-03T14:00:00.000Z',
        source: 'REVIEW_STATION',
        checkInId: 'c-3oct',
      },
    ]);
  });

  it('labels a check-in with no station visits as legacy, with no completion time', async () => {
    clinicFindUnique.mockResolvedValue({ timezone: 'Africa/Accra' });
    repo.findMany.mockResolvedValue([patient('p1')]);
    repo.findMatchingScreenings.mockResolvedValue([
      legacyRow('p1', 'c-import', '2026-10-10T08:15:00.000Z'),
    ]);

    const page = await service.listRegistry('clinic-1', '', 1, 25, {
      screened: { from: '2026-10-10' },
    });

    expect(page.items[0].matchingScreenings).toEqual([
      { date: '2026-10-10', completedAt: null, source: 'LEGACY_CHECKIN', checkInId: 'c-import' },
    ]);
  });

  it('rejects bad input before touching the database', async () => {
    await expect(
      service.listRegistry('clinic-1', '', 1, 25, { screened: { to: '2026-10-10' } }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.listRegistry('clinic-1', '', 1, 25, {
        sort: { field: 'lastScreenedAt', direction: 'desc' },
      }),
    ).rejects.toMatchObject({ response: { code: 'SORT_REQUIRES_SCREENED_FILTER' } });
    await expect(
      service.listRegistry('clinic-1', '', 1, 25, {
        cursor: 'p1',
        sort: { field: 'lastScreenedAt', direction: 'desc' },
        screened: { from: '2026-10-10' },
      }),
    ).rejects.toMatchObject({ response: { code: 'CURSOR_UNSUPPORTED_FOR_SORT' } });
    expect(repo.findMany).not.toHaveBeenCalled();
    expect(clinicFindUnique).not.toHaveBeenCalled();
  });

  describe('sortBy=lastScreenedAt', () => {
    const sort = { field: 'lastScreenedAt' as const, direction: 'desc' as const };

    beforeEach(() => {
      clinicFindUnique.mockResolvedValue({ timezone: 'Africa/Accra' });
      repo.findManyByIds.mockImplementation(async (ids: string[]) =>
        // Unordered on purpose: the database does not keep the ranked order.
        [...ids].reverse().map(patient),
      );
    });

    it('orders by the latest matching day, newest first, ties on id', async () => {
      repo.findIds.mockResolvedValue(['b', 'a', 'c']);
      repo.findMatchingScreenings.mockResolvedValue([
        reviewRow('a', 'ca', '2026-10-03T10:00:00.000Z'),
        reviewRow('b', 'cb1', '2026-10-01T10:00:00.000Z'),
        reviewRow('b', 'cb2', '2026-10-10T09:00:00.000Z'),
        legacyRow('c', 'cc', '2026-10-10T07:00:00.000Z'),
      ]);

      const page = await service.listRegistry('clinic-1', '', 1, 25, {
        sort,
        screened: { from: '2026-10-01', to: '2026-10-15' },
      });

      expect(page.items.map((item) => item.id)).toEqual(['c', 'b', 'a']);
      expect(page.total).toBe(3);
      expect(page.items[1].matchingScreenings?.map((s) => s.date)).toEqual([
        '2026-10-10',
        '2026-10-01',
      ]);
      expect(repo.findMany).not.toHaveBeenCalled();
    });

    it('pages through same-day patients with no duplicates or gaps', async () => {
      const ids = Array.from({ length: 7 }, (_, i) => `p${i}`);
      repo.findIds.mockResolvedValue([...ids].reverse());
      repo.findMatchingScreenings.mockResolvedValue(
        ids.map((id) => reviewRow(id, `c-${id}`, '2026-10-10T10:00:00.000Z')),
      );

      const seen: string[] = [];
      for (const pageNumber of [1, 2, 3]) {
        const page = await service.listRegistry('clinic-1', '', pageNumber, 3, {
          sort,
          screened: { from: '2026-10-10' },
        });
        expect(page.total).toBe(7);
        seen.push(...page.items.map((item) => item.id));
      }

      expect(seen).toEqual(['p6', 'p5', 'p4', 'p3', 'p2', 'p1', 'p0']);
    });
  });
});

describe('PatientService.listRegistry - last visit and location', () => {
  const at = (iso: string) => new Date(iso);
  let repo: {
    findMany: jest.Mock;
    count: jest.Mock;
    findIds: jest.Mock;
    findManyByIds: jest.Mock;
    findMatchingScreenings: jest.Mock;
    findLastVisits: jest.Mock;
  };
  let service: PatientService;

  beforeEach(() => {
    repo = {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      findIds: jest.fn().mockResolvedValue([]),
      findManyByIds: jest.fn(async (ids: string[]) => [...ids].reverse().map(patient)),
      findMatchingScreenings: jest.fn().mockResolvedValue([]),
      findLastVisits: jest.fn().mockResolvedValue(new Map()),
    };
    const prisma = {
      clinic: { findUnique: jest.fn().mockResolvedValue({ timezone: 'Africa/Accra' }) },
    } as unknown as PrismaService;
    service = new PatientService(
      repo as unknown as PatientRepository,
      prisma,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
    );
  });

  it('gives every item its last visit at this clinic and its location, never the address note', async () => {
    repo.findMany.mockResolvedValue([
      {
        ...patient('p1'),
        residentialLocationStatus: 'RECORDED',
        residentialRegion: 'CENTRAL',
        residentialDistrict: 'Cape Coast Metropolitan',
        residentialCommunity: 'Abura',
        residentialAddressNote: 'Blue gate behind the school',
      } as Patient,
      patient('p2'),
    ]);
    repo.count.mockResolvedValue(2);
    repo.findLastVisits.mockResolvedValue(new Map([['p1', at('2026-11-05T09:00:00Z')]]));

    const page = await service.listRegistry('clinic-1', '', 1, 25);

    expect(repo.findLastVisits).toHaveBeenCalledWith(['p1', 'p2'], 'clinic-1');
    expect(page.items[0]).toMatchObject({
      lastVisitAt: at('2026-11-05T09:00:00Z'),
      residentialRegion: 'CENTRAL',
      residentialDistrict: 'Cape Coast Metropolitan',
      residentialCommunity: 'Abura',
    });
    expect(page.items[0]).not.toHaveProperty('residentialAddressNote');
    expect(page.items[1].lastVisitAt).toBeNull();
  });

  it('sorts by last visit across the whole registry, not just one page', async () => {
    repo.findIds.mockResolvedValue(['a', 'b', 'c', 'd']);
    repo.findLastVisits.mockResolvedValue(
      new Map([
        ['a', at('2026-10-01T00:00:00Z')],
        ['c', at('2026-11-01T00:00:00Z')],
        ['d', at('2026-10-15T00:00:00Z')],
      ]),
    );

    const page = await service.listRegistry('clinic-1', '', 1, 2, {
      sort: { field: 'lastVisitAt', direction: 'desc' },
    });

    expect(page.items.map((item) => item.id)).toEqual(['c', 'd']);
    expect(page.total).toBe(4);
    expect(repo.findMany).not.toHaveBeenCalled();
    expect(page).not.toHaveProperty('timezone');
  });

  it('keeps the screened dates when sorting by last visit with the screened filter on', async () => {
    repo.findIds.mockResolvedValue(['a']);
    repo.findMatchingScreenings.mockResolvedValue([
      reviewRow('a', 'ca', '2026-10-10T10:00:00.000Z'),
    ]);

    const page = await service.listRegistry('clinic-1', '', 1, 25, {
      sort: { field: 'lastVisitAt', direction: 'asc' },
      screened: { from: '2026-10-10' },
    });

    expect(page.timezone).toBe('Africa/Accra');
    expect(page.items[0].matchingScreenings?.map((s) => s.date)).toEqual(['2026-10-10']);
  });

  it('refuses a cursor with the last-visit sort', async () => {
    await expect(
      service.listRegistry('clinic-1', '', 1, 25, {
        cursor: 'x',
        sort: { field: 'lastVisitAt', direction: 'desc' },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('rankByLastVisit', () => {
  const visits = new Map([
    ['b', new Date('2026-10-01T00:00:00Z')],
    ['c', new Date('2026-11-01T00:00:00Z')],
    ['e', new Date('2026-11-01T00:00:00Z')],
  ]);
  const ids = ['e', 'a', 'd', 'c', 'b'];

  it('puts never-seen patients last in both directions, ties on id', () => {
    expect(rankByLastVisit(ids, visits, 'desc')).toEqual(['c', 'e', 'b', 'a', 'd']);
    expect(rankByLastVisit(ids, visits, 'asc')).toEqual(['b', 'c', 'e', 'a', 'd']);
  });

  it('pages without duplicates or gaps', () => {
    const ranked = rankByLastVisit(ids, visits, 'desc');
    const pages = [ranked.slice(0, 2), ranked.slice(2, 4), ranked.slice(4)];
    expect(pages.flat()).toEqual(ranked);
    expect(new Set(pages.flat()).size).toBe(ids.length);
  });
});
