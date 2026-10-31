import { describeDataRequestDue } from './data-requests';

describe('describeDataRequestDue', () => {
  const now = new Date('2026-10-31T12:00:00Z');
  const due = (iso: string, status = 'RECEIVED' as const) =>
    describeDataRequestDue({ status, dueAt: iso }, now);

  it('counts down to the deadline', () => {
    expect(due('2026-11-12T12:00:00Z')).toEqual({ label: 'Due in 12 days', overdue: false });
    expect(due('2026-11-01T10:00:00Z')).toEqual({ label: 'Due in 1 day', overdue: false });
    expect(due('2026-10-31T12:00:00Z')).toEqual({ label: 'Due today', overdue: false });
  });

  it('flags a missed deadline', () => {
    expect(due('2026-10-28T12:00:00Z')).toEqual({ label: '3 days overdue', overdue: true });
  });

  it('says nothing once the request is answered', () => {
    expect(
      describeDataRequestDue({ status: 'COMPLETED', dueAt: '2026-10-01T00:00:00Z' }, now),
    ).toBeNull();
  });
});
