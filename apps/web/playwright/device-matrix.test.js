const { describe, it, expect } = require('@jest/globals');
const { requireAuditDatabase } = require('./device-matrix.cjs');

describe('device matrix database isolation', () => {
  const audit = 'postgresql://synthetic:synthetic@localhost:5433/nkwapa_audit';
  it('accepts only the audit database for both connections', () => {
    expect(() =>
      requireAuditDatabase({ DATABASE_URL: audit, APP_DATABASE_URL: audit }),
    ).not.toThrow();
  });
  it.each([undefined, '', 'invalid', audit.replace('/nkwapa_audit', '/nkwapa'), `${audit}_shots`])(
    'refuses an absent, malformed or different database without exposing credentials',
    (url) => {
      for (const key of ['DATABASE_URL', 'APP_DATABASE_URL']) {
        const env = { DATABASE_URL: audit, APP_DATABASE_URL: audit, [key]: url };
        expect(() => requireAuditDatabase(env)).toThrow(/^BAD-DB:/);
        try {
          requireAuditDatabase(env);
        } catch (error) {
          expect(error.message).not.toContain('synthetic');
        }
      }
    },
  );
});
