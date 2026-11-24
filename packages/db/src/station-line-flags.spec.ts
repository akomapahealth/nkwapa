import {
  lineFlagsFor,
  mergeLineFlags,
  parseLineFlags,
  worstLineFlag,
  type LineFlag,
} from './station-line-flags';

const at = (
  flag: Omit<LineFlag, 'stationName' | 'at'>,
  stationName = 'Blood pressure',
): LineFlag => ({
  ...flag,
  stationName,
  at: '2026-11-24T10:42:00Z',
});

describe('lineFlagsFor (#415)', () => {
  it('refers a crisis BP today and repeats stage 2 at review', () => {
    expect(lineFlagsFor({ systolic: 184, diastolic: 112 })).toEqual([
      { kind: 'REFER_TODAY', source: 'BP', systolic: 184, diastolic: 112 },
    ]);
    expect(lineFlagsFor({ systolic: 150, diastolic: 95 })).toEqual([
      { kind: 'REPEAT_AT_REVIEW', source: 'BP', systolic: 150, diastolic: 95 },
    ]);
    expect(lineFlagsFor({ systolic: 128, diastolic: 82 })).toEqual([]);
  });

  it('refers a very high glucose today and repeats a suspected one at review', () => {
    expect(lineFlagsFor({ glucoseMgDl: 420, glucoseType: 'RANDOM' })).toEqual([
      { kind: 'REFER_TODAY', source: 'GLUCOSE', glucoseMgDl: 420 },
    ]);
    expect(lineFlagsFor({ glucoseMgDl: 210, glucoseType: 'RANDOM' })).toEqual([
      { kind: 'REPEAT_AT_REVIEW', source: 'GLUCOSE', glucoseMgDl: 210 },
    ]);
    // Unknown timing cannot be judged suspected, so it raises nothing short of danger.
    expect(lineFlagsFor({ glucoseMgDl: 210, glucoseType: 'UNKNOWN' })).toEqual([]);
  });

  it('needs both BP numbers, and flags each source on its own', () => {
    expect(lineFlagsFor({ systolic: 190, diastolic: null })).toEqual([]);
    expect(
      lineFlagsFor({ systolic: 150, diastolic: 95, glucoseMgDl: 420, glucoseType: 'FASTING' }).map(
        (flag) => `${flag.source}:${flag.kind}`,
      ),
    ).toEqual(['BP:REPEAT_AT_REVIEW', 'GLUCOSE:REFER_TODAY']);
  });
});

describe('mergeLineFlags (#415)', () => {
  const stage2 = at({ kind: 'REPEAT_AT_REVIEW', source: 'BP', systolic: 150, diastolic: 95 });
  const crisis = at({ kind: 'REFER_TODAY', source: 'BP', systolic: 184, diastolic: 112 });

  it('lets the worse flag win and never takes one back', () => {
    expect(mergeLineFlags([stage2], [crisis])).toEqual([crisis]);
    expect(mergeLineFlags([crisis], [stage2])).toEqual([crisis]);
    // A normal repeat at review raises nothing; the original reading stays.
    expect(mergeLineFlags([stage2], [])).toEqual([stage2]);
  });

  it('keeps the first reading on an equal flag, and each source apart', () => {
    const later = { ...stage2, systolic: 155, stationName: 'Review' };
    expect(mergeLineFlags([stage2], [later])).toEqual([stage2]);
    const glucose = at(
      { kind: 'REPEAT_AT_REVIEW', source: 'GLUCOSE', glucoseMgDl: 210 },
      'Glucose',
    );
    expect(mergeLineFlags([stage2], [glucose])).toEqual([stage2, glucose]);
  });

  it('names the worst flag', () => {
    expect(worstLineFlag([])).toBeNull();
    expect(worstLineFlag([stage2, crisis])).toBe('REFER_TODAY');
  });
});

describe('parseLineFlags', () => {
  it('keeps well-formed flags and drops anything else', () => {
    const good = at({ kind: 'REFER_TODAY', source: 'BP', systolic: 184, diastolic: 112 });
    expect(parseLineFlags([good, { kind: 'NOPE' }, null, 'x'])).toEqual([good]);
    expect(parseLineFlags(null)).toEqual([]);
  });
});
