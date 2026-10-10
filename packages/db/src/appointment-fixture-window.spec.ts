import {
  confirmedVisitStart,
  isInVisibleWeek,
  terminalVisitStart,
  weekStartUtc,
} from './appointment-fixture-window';

/** Every hour of a full week, so no run time is left untested. */
function everyHourOfAWeek(): Date[] {
  const start = Date.UTC(2026, 7, 24, 0, 0, 0); // Monday 2026-08-24
  return Array.from({ length: 24 * 7 }, (_, i) => new Date(start + i * 60 * 60 * 1000));
}

describe('appointment fixture window', () => {
  it('starts the week on Monday, matching the schedule view', () => {
    // Sunday must resolve back to the preceding Monday, which is the case the old fixtures broke on.
    expect(weekStartUtc(new Date('2026-08-30T03:58:00Z')).toISOString()).toBe(
      '2026-08-24T00:00:00.000Z',
    );
    expect(weekStartUtc(new Date('2026-08-24T00:00:00Z')).toISOString()).toBe(
      '2026-08-24T00:00:00.000Z',
    );
    expect(weekStartUtc(new Date('2026-08-31T09:00:00Z')).toISOString()).toBe(
      '2026-08-31T00:00:00.000Z',
    );
  });

  it('keeps both fixtures inside the visible week whatever hour the suite runs at', () => {
    for (const reference of everyHourOfAWeek()) {
      const confirmed = confirmedVisitStart(reference);
      const terminal = terminalVisitStart(reference);
      expect({
        at: reference.toISOString(),
        confirmed: isInVisibleWeek(reference, confirmed),
      }).toEqual({ at: reference.toISOString(), confirmed: true });
      expect({
        at: reference.toISOString(),
        terminal: isInVisibleWeek(reference, terminal),
      }).toEqual({ at: reference.toISOString(), terminal: true });
    }
  });

  it('leaves the original offsets alone away from the week edges', () => {
    // Wednesday midday: +26h and -48h are both comfortably inside the week, so nothing moves.
    const wednesday = new Date('2026-08-26T12:00:00Z');
    expect(confirmedVisitStart(wednesday).toISOString()).toBe('2026-08-27T14:00:00.000Z');
    expect(terminalVisitStart(wednesday).toISOString()).toBe('2026-08-24T12:00:00.000Z');
  });

  it('pulls the confirmed visit back rather than letting it cross into next week', () => {
    // The exact run that failed CI: a Sunday. +26h would have been Monday 05:58.
    const sunday = new Date('2026-08-30T03:58:00Z');
    const confirmed = confirmedVisitStart(sunday);
    expect(confirmed.toISOString()).toBe('2026-08-30T21:00:00.000Z');
    expect(confirmed.getTime()).toBeGreaterThan(sunday.getTime());
  });

  it('pushes the terminal rows forward rather than letting them fall into last week', () => {
    // A Monday morning: -48h would have been Saturday, in the previous week.
    const monday = new Date('2026-08-31T09:00:00Z');
    const terminal = terminalVisitStart(monday);
    expect(terminal.toISOString()).toBe('2026-08-31T01:00:00.000Z');
    expect(terminal.getTime()).toBeLessThan(monday.getTime());
  });

  it('keeps the confirmed visit in the future for all but the tail of a Sunday', () => {
    const stillFuture = everyHourOfAWeek().filter(
      (reference) => confirmedVisitStart(reference) > reference,
    );
    // 165 of 168 hours. The exceptions are the last three hours of Sunday, where no time remains
    // in the visible week; the row is then a past CONFIRMED one, which still renders its menu.
    expect(stillFuture.length).toBe(165);
  });
});
