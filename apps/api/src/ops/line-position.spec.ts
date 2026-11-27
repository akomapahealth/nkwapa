import { alreadyCheckedInMessage, linePositions, type LinePosition } from './line-position';

const base: LinePosition = {
  checkInId: 'c1',
  status: 'IN_PROGRESS',
  dayNumber: 14,
  stationName: 'Glucose',
  holderName: 'Ama',
  since: '2026-11-21T09:42:00Z',
};

describe('alreadyCheckedInMessage (#414)', () => {
  it('names the station, who has them, and since when, in the clinic time zone', () => {
    expect(alreadyCheckedInMessage(base, 'Africa/Accra')).toBe(
      'Already on the line: No. 14 at Glucose, with Ama since 9:42 AM.',
    );
    expect(alreadyCheckedInMessage(base, 'America/New_York')).toContain('since 4:42 AM');
  });

  it('says they are waiting when nobody has them yet', () => {
    expect(alreadyCheckedInMessage({ ...base, holderName: null }, 'Africa/Accra')).toBe(
      'Already on the line: No. 14, waiting at Glucose since 9:42 AM.',
    );
  });

  it('points at the Today board when they are at no station', () => {
    expect(
      alreadyCheckedInMessage(
        { ...base, stationName: null, holderName: null, since: null, dayNumber: null },
        'Africa/Accra',
      ),
    ).toBe('Already checked in today: This patient. Find them on the Today board.');
  });
});

describe('linePositions', () => {
  it('reads every open stop in one query and keeps the holder only while in progress', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        patientCheckInId: 'c1',
        status: 'QUEUED',
        queuedAt: new Date('2026-11-21T09:00:00Z'),
        claimedAt: null,
        station: { name: 'Blood pressure' },
        claimedBy: null,
      },
    ]);
    const positions = await linePositions({ patientStationVisit: { findMany } } as never, [
      { id: 'c1', status: 'WAITING', dayNumber: 3 },
      { id: 'c2', status: 'WAITING', dayNumber: 4 },
    ]);
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(positions.get('c1')).toMatchObject({
      stationName: 'Blood pressure',
      holderName: null,
      since: '2026-11-21T09:00:00.000Z',
    });
    expect(positions.get('c2')).toMatchObject({ stationName: null, dayNumber: 4 });
  });
});
