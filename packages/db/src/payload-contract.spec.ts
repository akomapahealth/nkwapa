import {
  PayloadIssues,
  readBoolean,
  readEnum,
  readEnumArray,
  readInteger,
  readObject,
  readSchemaVersion,
  readText,
  rejectUnknownKeys,
} from './payload-contract';

const COLOURS = ['RED', 'GREEN'] as const;

describe('readObject', () => {
  it('treats an absent section as empty rather than an error', () => {
    const issues = new PayloadIssues();
    expect(readObject(null, 'lifestyle', issues)).toEqual({});
    expect(readObject(undefined, 'lifestyle', issues)).toEqual({});
    expect(issues.ok).toBe(true);
  });

  it('reports a non-object', () => {
    const issues = new PayloadIssues();
    readObject([1, 2], 'lifestyle', issues);
    expect(issues.list).toEqual([
      { path: 'lifestyle', code: 'WRONG_TYPE', message: 'Expected an object.' },
    ]);
  });
});

describe('rejectUnknownKeys', () => {
  /*
    A silently dropped key is how a client that believes it is recording something and a server
    that never stores it coexist for months without anyone noticing.
  */
  it('reports a key the contract does not declare', () => {
    const issues = new PayloadIssues();
    rejectUnknownKeys({ saltCooking: 'NEVER', smokes: true }, ['saltCooking'], 'lifestyle', issues);
    expect(issues.list).toHaveLength(1);
    expect(issues.list[0]).toMatchObject({ path: 'lifestyle.smokes', code: 'UNKNOWN_KEY' });
  });

  it('accepts a payload that declares only known keys', () => {
    const issues = new PayloadIssues();
    rejectUnknownKeys({ saltCooking: 'NEVER' }, ['saltCooking', 'saltTable'], '', issues);
    expect(issues.ok).toBe(true);
  });
});

describe('readEnum', () => {
  it('reads a declared member', () => {
    const issues = new PayloadIssues();
    expect(readEnum({ colour: 'GREEN' }, 'colour', COLOURS, 'RED', '', issues)).toBe('GREEN');
    expect(issues.ok).toBe(true);
  });

  it('falls back without complaint when the key is absent', () => {
    const issues = new PayloadIssues();
    expect(readEnum({}, 'colour', COLOURS, 'RED', '', issues)).toBe('RED');
    expect(issues.ok).toBe(true);
  });

  it('reports a value outside the vocabulary and falls back', () => {
    const issues = new PayloadIssues();
    expect(readEnum({ colour: 'BLUE' }, 'colour', COLOURS, 'RED', 'x', issues)).toBe('RED');
    expect(issues.list[0]).toMatchObject({ path: 'x.colour', code: 'UNKNOWN_VALUE' });
  });

  it('reports a non-string', () => {
    const issues = new PayloadIssues();
    readEnum({ colour: 7 }, 'colour', COLOURS, 'RED', '', issues);
    expect(issues.list[0]).toMatchObject({ path: 'colour', code: 'WRONG_TYPE' });
  });
});

describe('readEnumArray', () => {
  it('de-duplicates while preserving order', () => {
    const issues = new PayloadIssues();
    expect(readEnumArray({ c: ['GREEN', 'RED', 'GREEN'] }, 'c', COLOURS, '', issues)).toEqual([
      'GREEN',
      'RED',
    ]);
    expect(issues.ok).toBe(true);
  });

  /* One pass must surface every problem, so a volunteer fixes a long form once. */
  it('reports every bad entry, by index, and keeps the good ones', () => {
    const issues = new PayloadIssues();
    const out = readEnumArray({ c: ['RED', 'BLUE', 9] }, 'c', COLOURS, 'sec', issues);
    expect(out).toEqual(['RED']);
    expect(issues.list.map((i) => i.path)).toEqual(['sec.c[1]', 'sec.c[2]']);
  });

  it('reports a non-array', () => {
    const issues = new PayloadIssues();
    readEnumArray({ c: 'RED' }, 'c', COLOURS, '', issues);
    expect(issues.list[0]).toMatchObject({ code: 'WRONG_TYPE' });
  });
});

describe('readInteger', () => {
  it('reads a value inside its bounds', () => {
    const issues = new PayloadIssues();
    expect(readInteger({ days: 5 }, 'days', { min: 0, max: 7 }, '', issues)).toBe(5);
    expect(issues.ok).toBe(true);
  });

  it('rejects rather than rounds a fractional value', () => {
    const issues = new PayloadIssues();
    expect(readInteger({ days: 3.5 }, 'days', { min: 0, max: 7 }, '', issues)).toBeNull();
    expect(issues.list[0]).toMatchObject({ code: 'WRONG_TYPE' });
  });

  it('rejects a value outside its bounds', () => {
    const issues = new PayloadIssues();
    expect(readInteger({ days: 9 }, 'days', { min: 0, max: 7 }, '', issues)).toBeNull();
    expect(issues.list[0]).toMatchObject({ code: 'UNKNOWN_VALUE' });
  });

  it('rejects NaN', () => {
    const issues = new PayloadIssues();
    expect(readInteger({ days: Number.NaN }, 'days', { min: 0, max: 7 }, '', issues)).toBeNull();
    expect(issues.ok).toBe(false);
  });
});

describe('readText', () => {
  it('trims and treats blank as absent', () => {
    const issues = new PayloadIssues();
    expect(readText({ t: '  kenkey  ' }, 't', 50, '', issues)).toBe('kenkey');
    expect(readText({ t: '   ' }, 't', 50, '', issues)).toBeNull();
    expect(issues.ok).toBe(true);
  });

  /*
    Reported, not truncated.

    Silently cutting a note loses the end of the sentence, which is usually where the meaning was.
  */
  it('reports over-long text instead of truncating it', () => {
    const issues = new PayloadIssues();
    expect(readText({ t: 'x'.repeat(51) }, 't', 50, 'sec', issues)).toBeNull();
    expect(issues.list[0]).toMatchObject({ path: 'sec.t', code: 'TOO_LONG' });
  });
});

describe('readBoolean', () => {
  it('reads a boolean and treats absence as unknown', () => {
    const issues = new PayloadIssues();
    expect(readBoolean({ b: false }, 'b', '', issues)).toBe(false);
    expect(readBoolean({}, 'b', '', issues)).toBeNull();
    expect(issues.ok).toBe(true);
  });

  /* "true" is not true. Coercing it hides a client that is serialising the wrong type. */
  it('reports a stringly-typed boolean', () => {
    const issues = new PayloadIssues();
    expect(readBoolean({ b: 'true' }, 'b', '', issues)).toBeNull();
    expect(issues.list[0]).toMatchObject({ code: 'WRONG_TYPE' });
  });
});

describe('readSchemaVersion', () => {
  it('defaults to the current version when absent', () => {
    const issues = new PayloadIssues();
    expect(readSchemaVersion({}, 2, issues)).toBe(2);
    expect(issues.ok).toBe(true);
  });

  it('accepts an older version without complaint', () => {
    const issues = new PayloadIssues();
    expect(readSchemaVersion({ schemaVersion: 1 }, 2, issues)).toBe(1);
    expect(issues.ok).toBe(true);
  });

  /*
    A newer payload is an issue, not an exception.

    A newer client talking to an older server should degrade to "this section could not be read"
    rather than failing the whole interview save; the record's other sections are still worth
    keeping.
  */
  it('reports a version from the future without throwing', () => {
    const issues = new PayloadIssues();
    expect(readSchemaVersion({ schemaVersion: 9 }, 2, issues)).toBe(9);
    expect(issues.list[0]).toMatchObject({ path: 'schemaVersion', code: 'SCHEMA_VERSION' });
  });

  it('reports a nonsensical version', () => {
    const issues = new PayloadIssues();
    expect(readSchemaVersion({ schemaVersion: 0 }, 2, issues)).toBe(2);
    expect(issues.list[0]).toMatchObject({ code: 'WRONG_TYPE' });
  });
});
