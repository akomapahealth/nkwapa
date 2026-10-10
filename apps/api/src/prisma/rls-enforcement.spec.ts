import {
  describeRlsEnforcement,
  evaluateRlsEnforcement,
  reportRlsEnforcement,
  RlsNotEnforcedError,
  rlsEnforcementMode,
} from './rls-enforcement';

const logger = () => ({ log: jest.fn(), warn: jest.fn(), error: jest.fn() });

const probe = (overrides: Partial<Parameters<typeof evaluateRlsEnforcement>[0]> = {}) => ({
  role: 'nkwapa_app',
  isSuperuser: false,
  bypassesRls: false,
  unforcedTables: [] as string[],
  ...overrides,
});

describe('row level security enforcement', () => {
  it('treats a plain role with every table forced as enforcing', () => {
    expect(evaluateRlsEnforcement(probe()).enforced).toBe(true);
  });

  it('does not treat a superuser as enforcing', () => {
    // The defect this check exists for: policies were declared everywhere and applied nowhere,
    // because the application connected as the superuser that owns the tables.
    expect(evaluateRlsEnforcement(probe({ isSuperuser: true })).enforced).toBe(false);
  });

  it('does not treat a BYPASSRLS role as enforcing', () => {
    expect(evaluateRlsEnforcement(probe({ bypassesRls: true })).enforced).toBe(false);
  });

  it('does not treat an unforced table as enforcing', () => {
    // A table owner is exempt from its own policies unless the table is FORCEd.
    expect(evaluateRlsEnforcement(probe({ unforcedTables: ['Patient'] })).enforced).toBe(false);
  });

  it('names every reason in the report', () => {
    const message = describeRlsEnforcement(
      evaluateRlsEnforcement(
        probe({ isSuperuser: true, bypassesRls: true, unforcedTables: ['Patient', 'Encounter'] }),
      ),
    );
    expect(message).toContain('superuser');
    expect(message).toContain('BYPASSRLS');
    expect(message).toContain('Patient');
    expect(message).toContain('2 table(s)');
  });

  it('summarises a long list of unforced tables without printing all of them', () => {
    const message = describeRlsEnforcement(
      evaluateRlsEnforcement(probe({ unforcedTables: ['A', 'B', 'C', 'D', 'E', 'F', 'G'] })),
    );
    expect(message).toContain('7 table(s)');
    expect(message).toContain('and 2 more');
  });

  it('logs rather than throws by default, and throws when enforcement is required', () => {
    const status = evaluateRlsEnforcement(probe({ isSuperuser: true }));

    const warnLogger = logger();
    expect(() => reportRlsEnforcement(status, 'warn', warnLogger)).not.toThrow();
    expect(warnLogger.error).toHaveBeenCalledTimes(1);

    expect(() => reportRlsEnforcement(status, 'required', logger())).toThrow(RlsNotEnforcedError);
  });

  it('stays quiet about a healthy database beyond one confirmation', () => {
    const healthy = logger();
    reportRlsEnforcement(evaluateRlsEnforcement(probe()), 'required', healthy);
    expect(healthy.error).not.toHaveBeenCalled();
    expect(healthy.log).toHaveBeenCalledTimes(1);
  });

  it('only requires enforcement when explicitly asked to', () => {
    expect(rlsEnforcementMode({})).toBe('warn');
    expect(rlsEnforcementMode({ DATABASE_RLS_ENFORCEMENT: 'warn' })).toBe('warn');
    expect(rlsEnforcementMode({ DATABASE_RLS_ENFORCEMENT: 'required' })).toBe('required');
  });
});
