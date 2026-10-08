import {
  COUNTED_ACTIONS,
  STAFF_ACTIVITY_CATEGORIES,
  categoryOf,
  recordHref,
  shiftHoursInWindow,
} from './staff-activity.categories';
import { STAFF_ACTIVITY_MAX_DAYS, StaffActivityService } from './staff-activity.service';

const CLINIC = '11111111-1111-4111-8111-111111111111';
const NOW = new Date('2026-10-08T12:00:00Z');

describe('staff activity categories (#33)', () => {
  it('counts each action under exactly one category', () => {
    expect(new Set(COUNTED_ACTIONS).size).toBe(COUNTED_ACTIONS.length);
    expect(categoryOf('ENCOUNTER.FINALIZE')).toBe('finalized');
    expect(categoryOf('VITALS.UPSERT')).toBe('screeningRecords');
  });

  it('leaves reads and administration out of workload', () => {
    for (const action of ['PATIENT.DUPLICATE.CROSS_CLINIC.VIEW', 'ROLE.GRANT', 'REMINDER.SENT']) {
      expect(categoryOf(action)).toBeNull();
    }
  });

  it('links only the records that have a page', () => {
    expect(recordHref('Encounter', 'e1')).toBe('/encounters/e1');
    expect(recordHref('PatientStationVisit', 'v1')).toBe('/stations/visits/v1');
    expect(recordHref('Vitals', 'x')).toBeNull();
  });

  it('counts shift hours inside the window only, and an open shift up to now', () => {
    const window = { from: new Date('2026-10-08T00:00:00Z'), to: new Date('2026-10-08T23:59:59Z') };
    expect(
      shiftHoursInWindow(
        [
          // Started the evening before: only the part inside the window counts.
          {
            checkedInAt: new Date('2026-10-07T22:00:00Z'),
            checkedOutAt: new Date('2026-10-08T02:00:00Z'),
          },
          // Still open at noon: counts to now, not to the end of the day.
          { checkedInAt: new Date('2026-10-08T09:30:00Z'), checkedOutAt: null },
        ],
        window,
        NOW,
      ),
    ).toBe(4.5);
  });
});

function setup() {
  const prisma = {
    clinic: { findUnique: jest.fn().mockResolvedValue({ timezone: 'Africa/Accra' }) },
    userClinicRole: {
      findMany: jest.fn().mockResolvedValue([
        { role: 'VOLUNTEER', user: { id: 'u-zed', displayName: 'Zed Volunteer', isActive: true } },
        { role: 'DOCTOR', user: { id: 'u-ama', displayName: 'Ama Doctor', isActive: true } },
        { role: 'MANAGER', user: { id: 'u-ama', displayName: 'Ama Doctor', isActive: true } },
      ]),
    },
    staffShift: {
      findMany: jest.fn().mockResolvedValue([
        {
          userId: 'u-zed',
          checkedInAt: new Date('2026-10-08T08:00:00Z'),
          checkedOutAt: new Date('2026-10-08T11:00:00Z'),
        },
      ]),
    },
    user: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ id: 'u-admin', displayName: 'Admin', isActive: true }]),
      findUnique: jest.fn(),
    },
    $queryRaw: jest.fn(),
  };
  const service = new StaffActivityService(prisma as never);
  return { prisma, service };
}

describe('StaffActivityService.overview', () => {
  it('lists everyone with a seat by name, with their workload and shift hours', async () => {
    const { prisma, service } = setup();
    prisma.$queryRaw.mockResolvedValueOnce([
      { userId: 'u-zed', category: 'visitsStarted', n: 12 },
      { userId: 'u-zed', category: 'screeningRecords', n: 30 },
      { userId: 'u-ama', category: 'finalized', n: 9 },
      // A system administrator who acted here without a seat still appears.
      { userId: 'u-admin', category: 'reviews', n: 1 },
    ]);

    const result = await service.overview(CLINIC, { from: '2026-10-02', to: '2026-10-08' }, NOW);

    expect(result.staff.map((row) => row.displayName)).toEqual([
      'Admin',
      'Ama Doctor',
      'Zed Volunteer',
    ]);
    const zed = result.staff.find((row) => row.userId === 'u-zed')!;
    expect(zed).toMatchObject({ roles: ['VOLUNTEER'], shifts: 1, shiftHours: 3, total: 42 });
    expect(zed.counts).toMatchObject({ visitsStarted: 12, screeningRecords: 30, finalized: 0 });
    expect(result.staff.find((row) => row.userId === 'u-ama')!.roles).toEqual([
      'DOCTOR',
      'MANAGER',
    ]);
    expect(result.totals).toMatchObject({ visitsStarted: 12, finalized: 9, reviews: 1 });
    expect(result.categories).toHaveLength(STAFF_ACTIVITY_CATEGORIES.length);
  });

  it('keeps a member of staff with no activity in the table at zero', async () => {
    const { prisma, service } = setup();
    prisma.$queryRaw.mockResolvedValueOnce([]);
    const result = await service.overview(CLINIC, {}, NOW);
    expect(result.staff.find((row) => row.userId === 'u-ama')).toMatchObject({ total: 0 });
    // Defaults to the last seven clinic days, ending today.
    expect(result).toMatchObject({ from: '2026-10-02', to: '2026-10-08' });
  });

  it('refuses a backwards range and one longer than the limit', async () => {
    const { service } = setup();
    await expect(
      service.overview(CLINIC, { from: '2026-10-08', to: '2026-10-01' }, NOW),
    ).rejects.toMatchObject({ response: { code: 'INVALID_DATE_RANGE' } });
    await expect(
      service.overview(CLINIC, { from: '2026-01-01', to: '2026-10-08' }, NOW),
    ).rejects.toMatchObject({ response: { code: 'INVALID_DATE_RANGE' } });
    expect(STAFF_ACTIVITY_MAX_DAYS).toBe(92);
  });
});

describe('StaffActivityService.person', () => {
  function withPerson() {
    const ctx = setup();
    ctx.prisma.user.findUnique.mockResolvedValue({
      id: 'u-zed',
      displayName: 'Zed Volunteer',
      isActive: true,
      clinicRoles: [{ role: 'VOLUNTEER' }],
    });
    ctx.prisma.$queryRaw
      .mockResolvedValueOnce([
        { day: '2026-10-08', category: 'visitsStarted', n: 2 },
        { day: '2026-10-07', category: 'visitsStarted', n: 1 },
      ])
      .mockResolvedValueOnce([
        { action: 'ENCOUNTER.CREATE', entityType: 'Encounter', entityId: 'enc-1', at: NOW },
        { action: 'VITALS.CREATE', entityType: 'Vitals', entityId: 'vit-1', at: NOW },
      ]);
    return ctx;
  }

  it('gives the day-by-day counts and links the records the viewer can open', async () => {
    const { service } = withPerson();
    const result = await service.person(
      CLINIC,
      'u-zed',
      [{ clinicId: CLINIC, role: 'DIRECTOR' }] as never,
      {},
      NOW,
    );
    expect(result.days.map((day) => day.day)).toEqual(['2026-10-07', '2026-10-08']);
    expect(result.records).toEqual([
      expect.objectContaining({ category: 'visitsStarted', href: '/encounters/enc-1' }),
      expect.objectContaining({ category: 'screeningRecords', href: null }),
    ]);
    // Records carry what was done and when, never the patient.
    expect(JSON.stringify(result.records)).not.toMatch(/patient/i);
  });

  it('withholds links a viewer could not follow', async () => {
    const { service } = withPerson();
    const result = await service.person(
      CLINIC,
      'u-zed',
      [{ clinicId: 'another-clinic', role: 'DIRECTOR' }] as never,
      {},
      NOW,
    );
    expect(result.records.every((record) => record.href === null)).toBe(true);
  });
});
