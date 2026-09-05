import {
  confirmationMatches,
  describeCount,
  describePortalOutcome,
  mergePreviewPath,
  partitionRelations,
  type MergeRelationCount,
  type PatientMergePreview,
} from './patient-merge';
import { MERGE_BLOCKER_CODES, MERGE_FINDING_LABELS, MERGE_WARNING_CODES } from '@nkwapa/db';

function relation(
  key: string,
  canonicalCount: number,
  sourceCount: number,
  label = key,
): MergeRelationCount {
  return { key, label, canonicalCount, sourceCount };
}

const chart = (patientCode: string) =>
  ({ patientCode }) as unknown as PatientMergePreview['canonical'];

describe('mergePreviewPath', () => {
  it('asks the chart-scoped route about the duplicate', () => {
    expect(
      mergePreviewPath({
        clinicId: 'clinic-1',
        canonicalPatientId: 'patient-1',
        sourcePatientId: 'patient-2',
      }),
    ).toBe('/clinics/clinic-1/patients/patient-1/merge-preview?sourcePatientId=patient-2');
  });

  it('carries a strategy only once one has been chosen', () => {
    const path = mergePreviewPath({
      clinicId: 'clinic-1',
      canonicalPatientId: 'patient-1',
      sourcePatientId: 'patient-2',
      portalLinkStrategy: 'SOURCE',
    });
    expect(path).toContain('portalLinkStrategy=SOURCE');
    expect(path).not.toContain('inviteStrategy');
  });

  it('escapes ids rather than pasting them into a path', () => {
    expect(
      mergePreviewPath({
        clinicId: 'a/b',
        canonicalPatientId: 'c d',
        sourcePatientId: 'e&f',
      }),
    ).toBe('/clinics/a%2Fb/patients/c%20d/merge-preview?sourcePatientId=e%26f');
  });
});

describe('partitionRelations', () => {
  const relations = [
    relation('encounter', 2, 3, 'Visits'),
    relation('clinicalNote', 1, 0, 'Clinical notes'),
    relation('appointment', 0, 0, 'Appointments'),
    relation('reminder', 0, 4, 'Reminders and messages'),
  ];

  it('leads with what actually moves', () => {
    expect(partitionRelations(relations).moving.map((row) => row.key)).toEqual([
      'encounter',
      'reminder',
    ]);
  });

  it('keeps what the surviving chart already holds, which the merge does not touch', () => {
    expect(partitionRelations(relations).untouched.map((row) => row.key)).toEqual(['clinicalNote']);
  });

  it('counts the rows nobody needs to read rather than printing them', () => {
    // Fourteen rows of zero would bury the two that matter.
    expect(partitionRelations(relations).emptyCount).toBe(1);
  });

  it('totals everything the merge would move', () => {
    expect(partitionRelations(relations).totalMoving).toBe(7);
  });

  it('reports an entirely empty duplicate without claiming anything moves', () => {
    const empty = partitionRelations([relation('encounter', 0, 0)]);
    expect(empty.moving).toEqual([]);
    expect(empty.totalMoving).toBe(0);
  });
});

describe('describeCount', () => {
  it('agrees about number', () => {
    expect(describeCount(1, 'Visits')).toBe('1 visit');
    expect(describeCount(3, 'Visits')).toBe('3 visits');
    expect(describeCount(0, 'Visits')).toBe('0 visits');
  });

  it('leaves a label that is already singular alone', () => {
    expect(describeCount(1, 'Medical history')).toBe('1 medical history');
  });
});

describe('describePortalOutcome', () => {
  const canonical = chart('NKP-1');
  const source = chart('NKP-2');
  const base = { canonicalPendingInvites: 0, sourcePendingInvites: 0, invitesCancelled: 0 };

  it('says plainly when nobody is affected', () => {
    expect(
      describePortalOutcome({
        canonical,
        source,
        portal: { ...base, canonicalLinked: false, sourceLinked: false, retains: 'NONE' },
      }),
    ).toContain('Neither chart has an app account');
  });

  it('names the account that loses access when there are two', () => {
    const text = describePortalOutcome({
      canonical,
      source,
      portal: { ...base, canonicalLinked: true, sourceLinked: true, retains: 'CANONICAL' },
    });
    expect(text).toContain('NKP-1');
    expect(text).toContain('NKP-2 will no longer open this chart');
  });

  it('does not invent a loser when only one account exists', () => {
    const text = describePortalOutcome({
      canonical,
      source,
      portal: { ...base, canonicalLinked: false, sourceLinked: true, retains: 'SOURCE' },
    });
    expect(text).toContain('NKP-2');
    expect(text).not.toContain('no longer');
  });

  it('never puts a strategy name on screen', () => {
    for (const retains of ['CANONICAL', 'SOURCE', 'NONE'] as const) {
      const text = describePortalOutcome({
        canonical,
        source,
        portal: { ...base, canonicalLinked: true, sourceLinked: true, retains },
      });
      expect(text).not.toMatch(/CANONICAL|SOURCE|NONE/);
    }
  });
});

describe('confirmationMatches', () => {
  it('accepts the code as displayed', () => {
    expect(confirmationMatches('NKP-2026-000099', 'NKP-2026-000099')).toBe(true);
  });

  it('forgives case and surrounding space, but nothing else', () => {
    expect(confirmationMatches('  nkp-2026-000099 ', 'NKP-2026-000099')).toBe(true);
    expect(confirmationMatches('NKP-2026-00009', 'NKP-2026-000099')).toBe(false);
    expect(confirmationMatches('', 'NKP-2026-000099')).toBe(false);
    // The surviving chart's code is not the one being retired.
    expect(confirmationMatches('NKP-2026-000001', 'NKP-2026-000099')).toBe(false);
  });
});

describe('the finding copy the dialog renders', () => {
  it('has a label for every code the API can send', () => {
    for (const code of [...MERGE_BLOCKER_CODES, ...MERGE_WARNING_CODES]) {
      expect(MERGE_FINDING_LABELS[code]).toBeTruthy();
    }
  });
});
