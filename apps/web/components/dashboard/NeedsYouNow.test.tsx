/** @jest-environment jsdom */
import { workRows } from './NeedsYouNow';

jest.mock('./volunteer-welcome.module.css', () => ({}));

describe('urgent row in Needs you now (#337)', () => {
  const item = { patientId: 'p1', patientCode: 'NK-1', patientName: 'Ama Mensah', raisedAt: null };

  it('leads, above the volunteer worklist, and opens the one chart', () => {
    const rows = workRows({
      urgent: { unclaimed: 1, items: [item] },
      volunteer: { patientsRegisteredToday: 0, encountersCreatedToday: 0, pendingSubmissions: 2 },
      worklistHref: null,
    });
    expect(rows[0]).toMatchObject({
      title: '1 urgent patient nobody has taken',
      tone: 'destructive',
      href: '/patients/p1?tab=overview',
    });
    expect(rows[0].detail).toBe('Ama Mensah (NK-1). See them today.');
  });

  it('opens the longest waiting when there are several, and is absent when none', () => {
    const later = { ...item, patientId: 'p2', patientCode: 'NK-2' };
    const rows = workRows({ urgent: { unclaimed: 3, items: [item, later] }, worklistHref: null });
    expect(rows[0]).toMatchObject({
      href: '/patients/p1?tab=overview',
      label: 'Open longest waiting',
    });
    expect(rows[0].detail).toContain('and 1 more');
    expect(workRows({ urgent: { unclaimed: 0, items: [] }, worklistHref: null })).toEqual([]);
  });
});

describe('follow-up contacts row (#338)', () => {
  it('counts contacts due today or late and opens the worklist, after any urgent row', () => {
    const item = { patientId: 'p1', patientCode: 'NK-1', patientName: 'Ama', raisedAt: null };
    const rows = workRows({
      urgent: { unclaimed: 1, items: [item], contactsDue: 4 },
      worklistHref: null,
    });
    expect(rows.map((row) => row.title)).toEqual([
      '1 urgent patient nobody has taken',
      '4 follow-up contacts due',
    ]);
    expect(rows[1]).toMatchObject({ href: '/follow-up', label: 'Open follow-up' });
    expect(
      workRows({ urgent: { unclaimed: 0, items: [], contactsDue: 0 }, worklistHref: null }),
    ).toEqual([]);
  });
});
