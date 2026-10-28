import { BadRequestException } from '@nestjs/common';
import { Patient } from '@prisma/client';
import { PatientService } from './patient.service';
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
});
