/**
 * @jest-environment jsdom
 */
import type { WhoAmIResponse } from './bootstrap-context';
import {
  clearRecent,
  loadRecent,
  pageResults,
  rankResults,
  rememberRecent,
  scoreMatch,
  type SearchResult,
} from './smart-search';

function whoAmI(
  roles: string[],
  permissions: string[],
  globalRoles: string[] = [],
): WhoAmIResponse {
  return {
    userId: 'user-1',
    displayName: 'Ama Volunteer',
    globalRoles,
    activeClinicId: 'clinic-1',
    effectivePermissionsForActiveClinic: permissions,
    effectiveRolesForActiveClinic: roles,
    memberships: [{ clinicId: 'clinic-1', clinicName: 'Clinic One', roles }],
  } as unknown as WhoAmIResponse;
}

const page = (title: string, extra: Partial<SearchResult> = {}): SearchResult => ({
  id: `page:${title}`,
  kind: 'page',
  title,
  ...extra,
});

describe('scoreMatch', () => {
  it('ranks an exact label above a prefix, a word start, a substring and a keyword', () => {
    const scores = [
      scoreMatch('patients', page('Patients')),
      scoreMatch('pat', page('Patients')),
      scoreMatch('new pat', page('Register new patient')),
      scoreMatch('tien', page('Patients')),
      scoreMatch('roles', page('Staff', { keywords: 'team roles access' })),
    ];
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    expect(new Set(scores).size).toBe(scores.length);
  });

  it('ignores case, accents and punctuation', () => {
    expect(scoreMatch('FOLLOW-UP', page('Follow-up'))).toBe(100);
    expect(scoreMatch('clinique', page('Cliniqué'))).toBe(100);
  });

  it('does not match on unrelated text or empty input', () => {
    expect(scoreMatch('audit', page('Patients'))).toBe(0);
    expect(scoreMatch('   ', page('Patients'))).toBe(0);
  });
});

describe('rankResults', () => {
  it('returns matches best first, keeping registry order on ties, up to the limit', () => {
    const results = [page('Today'), page('Stations'), page('Staff'), page('Stats')];
    expect(rankResults('sta', results).map((r) => r.title)).toEqual(['Stations', 'Staff', 'Stats']);
    expect(rankResults('sta', results, 1)).toHaveLength(1);
  });
});

describe('pageResults', () => {
  it('offers only the pages the role may open', () => {
    const volunteer = pageResults(whoAmI(['VOLUNTEER'], ['PATIENT.READ', 'PATIENT.SEARCH']));
    const admin = pageResults(whoAmI([], ['*'], ['SYSTEM_ADMIN']));

    const hrefs = (results: SearchResult[]) => results.map((result) => result.href);
    expect(hrefs(volunteer)).not.toContain('/admin/users');
    expect(hrefs(volunteer)).not.toContain('/audit');
    expect(hrefs(admin)).toContain('/admin/users');
    expect(hrefs(admin)).toContain('/admin/clinics');
  });

  it('points clinic pages at the active clinic', () => {
    const results = pageResults(whoAmI(['VOLUNTEER'], ['PATIENT.READ', 'PATIENT.SEARCH']));
    expect(results.map((result) => result.href)).toContain('/clinics/clinic-1/patients');
  });

  it('finds a page by a word its label lacks', () => {
    const admin = pageResults(whoAmI([], ['*'], ['SYSTEM_ADMIN']));
    expect(rankResults('team', admin)[0]?.href).toBe('/admin/users');
  });
});

describe('recent choices', () => {
  beforeEach(() => localStorage.clear());

  it('remembers pages per person and clinic, newest first, without duplicates', () => {
    rememberRecent('user-1', 'clinic-1', page('Today'));
    rememberRecent('user-1', 'clinic-1', page('Staff'));
    rememberRecent('user-1', 'clinic-1', page('Today'));

    expect(loadRecent('user-1', 'clinic-1').map((r) => r.title)).toEqual(['Today', 'Staff']);
    expect(loadRecent('user-2', 'clinic-1')).toEqual([]);
    expect(loadRecent('user-1', 'clinic-2')).toEqual([]);
  });

  it('never stores a patient, so a shared laptop does not show the last charts opened', () => {
    rememberRecent('user-1', 'clinic-1', {
      id: 'patient:p-1',
      kind: 'patient',
      title: 'Ama Mensah',
      href: '/clinics/clinic-1/patients/p-1',
    });
    expect(loadRecent('user-1', 'clinic-1')).toEqual([]);
    expect(JSON.stringify(localStorage)).not.toContain('Mensah');
  });

  it('clears on request and survives corrupt storage', () => {
    rememberRecent('user-1', 'clinic-1', page('Today'));
    clearRecent('user-1', 'clinic-1');
    expect(loadRecent('user-1', 'clinic-1')).toEqual([]);

    localStorage.setItem('nkwapa:smart-search:recent:user-1:clinic-1', '{not json');
    expect(loadRecent('user-1', 'clinic-1')).toEqual([]);
  });
});
