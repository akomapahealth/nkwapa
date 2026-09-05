import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  MERGE_BLOCKER_CODES,
  MERGE_FINDING_LABELS,
  MERGE_FINDING_RECOVERY,
  MERGE_RELATIONS,
  MERGE_SPECIAL_CASE_MODELS,
  MERGE_WARNING_CODES,
  isMergeBlocked,
  isMergeBlockerCode,
  mergeFinding,
  mergePreviewFingerprint,
  type MergeFindingCode,
  type MergeFingerprintInput,
} from './patient-merge';

const ALL_CODES: MergeFindingCode[] = [...MERGE_BLOCKER_CODES, ...MERGE_WARNING_CODES];

function fingerprintInput(overrides: Partial<MergeFingerprintInput> = {}): MergeFingerprintInput {
  return {
    canonicalPatientId: 'a0000000-0000-4000-8000-000000000001',
    sourcePatientId: 'a0000000-0000-4000-8000-000000000002',
    canonicalUpdatedAt: new Date('2026-09-04T10:00:00.000Z'),
    sourceUpdatedAt: new Date('2026-09-04T11:00:00.000Z'),
    canonicalPatientCode: 'NKP-2026-000001',
    sourcePatientCode: 'NKP-2026-000099',
    counts: { encounter: 3, appointment: 1 },
    ...overrides,
  };
}

describe('merge findings', () => {
  it.each(ALL_CODES)('gives %s a plain-language label and a next step', (code) => {
    expect(MERGE_FINDING_LABELS[code]).toBeTruthy();
    expect(MERGE_FINDING_RECOVERY[code]).toBeTruthy();
    // A refusal an operator cannot act on sends them to support, which is what the preview is
    // supposed to make unnecessary.
    expect(MERGE_FINDING_RECOVERY[code].length).toBeGreaterThan(20);
  });

  it.each(ALL_CODES)('never renders the code %s as its own label', (code) => {
    expect(MERGE_FINDING_LABELS[code]).not.toContain(code);
    expect(MERGE_FINDING_LABELS[code]).not.toMatch(/^[A-Z_]+$/);
  });

  it('separates the two severities', () => {
    for (const code of MERGE_BLOCKER_CODES) {
      expect(isMergeBlockerCode(code)).toBe(true);
      expect(mergeFinding(code).severity).toBe('BLOCK');
    }
    for (const code of MERGE_WARNING_CODES) {
      expect(isMergeBlockerCode(code)).toBe(false);
      expect(mergeFinding(code).severity).toBe('WARN');
    }
  });

  it('carries a detail only when one was given', () => {
    expect(mergeFinding('CROSS_CLINIC')).not.toHaveProperty('detail');
    expect(mergeFinding('CROSS_CLINIC', 'Kumasi and Accra').detail).toBe('Kumasi and Accra');
  });

  it('is blocked by one blocker among any number of warnings', () => {
    const warnings = MERGE_WARNING_CODES.map((code) => mergeFinding(code));
    expect(isMergeBlocked(warnings)).toBe(false);
    expect(isMergeBlocked([...warnings, mergeFinding('CROSS_CLINIC')])).toBe(true);
    expect(isMergeBlocked([])).toBe(false);
  });
});

describe('the relations a merge moves', () => {
  const schema = readFileSync(resolve(__dirname, '../prisma/schema.prisma'), 'utf8');

  /** Every model with its own `patientId` column, read from the schema rather than a list. */
  function patientScopedModels(): string[] {
    const models: string[] = [];
    for (const match of schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)) {
      const [, name, body] = match;
      if (/^\s+patientId\s/m.test(body)) models.push(name);
    }
    return models;
  }

  /** `patientConsent` -> `PatientConsent`, matching Prisma's delegate naming. */
  function modelNameFor(key: string): string {
    return key.charAt(0).toUpperCase() + key.slice(1);
  }

  it('finds the patient-scoped models to check', () => {
    const models = patientScopedModels();
    expect(models.length).toBeGreaterThan(10);
    expect(models).toContain('ClinicalNote');
    expect(models).toContain('PatientPharmacyPreference');
  });

  /*
    The regression this file exists for.

    A model that gains a `patientId` and is not moved leaves clinical records on a chart that
    normal browsing excludes, which is how `ClinicalNote`, `MedicalHistoryRecord` and four others
    came to be stranded by the original merge. Failing here is cheaper than finding out from a
    patient whose notes went missing.
  */
  it('moves or explicitly exempts every model carrying a patientId', () => {
    const moved = new Set(MERGE_RELATIONS.map((relation) => modelNameFor(relation.key)));
    const unaccounted = patientScopedModels().filter(
      (model) => !moved.has(model) && !(model in MERGE_SPECIAL_CASE_MODELS),
    );
    expect(unaccounted).toEqual([]);
  });

  it('documents why each exempt model is exempt', () => {
    for (const [model, reason] of Object.entries(MERGE_SPECIAL_CASE_MODELS)) {
      expect(schema).toContain(`model ${model} {`);
      expect(reason.length).toBeGreaterThan(30);
    }
  });

  it('gives every relation a distinct key and an operator-facing label', () => {
    const keys = MERGE_RELATIONS.map((relation) => relation.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const relation of MERGE_RELATIONS) {
      expect(relation.label).not.toMatch(/^[a-z]/);
      expect(relation.label).not.toContain('patient');
    }
  });
});

describe('the preview fingerprint', () => {
  it('does not depend on the order the counts were collected in', () => {
    const forwards = mergePreviewFingerprint(
      fingerprintInput({ counts: { encounter: 3, appointment: 1 } }),
    );
    const backwards = mergePreviewFingerprint(
      fingerprintInput({ counts: { appointment: 1, encounter: 3 } }),
    );
    expect(forwards).toBe(backwards);
  });

  it('reads a date and its ISO string as the same instant', () => {
    expect(
      mergePreviewFingerprint(fingerprintInput({ canonicalUpdatedAt: '2026-09-04T10:00:00.000Z' })),
    ).toBe(mergePreviewFingerprint(fingerprintInput()));
  });

  it.each([
    ['a chart was edited', { sourceUpdatedAt: new Date('2026-09-04T11:00:01.000Z') }],
    ['a record was added', { counts: { encounter: 4, appointment: 1 } }],
    ['a record was removed', { counts: { encounter: 3 } }],
    ['a chart code changed', { sourcePatientCode: 'NKP-2026-000100' }],
    ['the direction was reversed', { canonicalPatientId: 'a0000000-0000-4000-8000-000000000002' }],
  ])('changes when %s', (_case, overrides: Partial<MergeFingerprintInput>) => {
    expect(mergePreviewFingerprint(fingerprintInput(overrides))).not.toBe(
      mergePreviewFingerprint(fingerprintInput()),
    );
  });

  it('is short enough to travel in a request body', () => {
    expect(mergePreviewFingerprint(fingerprintInput())).toMatch(/^[0-9a-f]{16}$/);
  });
});
