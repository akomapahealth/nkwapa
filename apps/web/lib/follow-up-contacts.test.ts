import { dueLabel, formatDueDay } from './follow-up-contacts';

describe('follow-up contact dates (#338)', () => {
  const today = '2026-11-18';

  it('says how late, then today, then the day', () => {
    expect(dueLabel({ dueOn: '2026-11-15', daysOverdue: 3, status: 'DUE' }, today)).toBe(
      '3 days late',
    );
    expect(dueLabel({ dueOn: '2026-11-17', daysOverdue: 1, status: 'MISSED' }, today)).toBe(
      '1 day late',
    );
    expect(dueLabel({ dueOn: today, daysOverdue: 0, status: 'DUE' }, today)).toBe('Due today');
    expect(dueLabel({ dueOn: '2026-12-18', daysOverdue: 0, status: 'DUE' }, today)).toBe(
      'Due 18 Dec',
    );
  });

  it('reads a day as that calendar day, whatever the time zone', () => {
    expect(formatDueDay('2027-01-01', { year: 'numeric' })).toBe('1 Jan 2027');
  });
});
