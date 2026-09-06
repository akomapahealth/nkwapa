import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  DUPLICATE_MATCH_REASONS,
  DUPLICATE_MATCH_REASON_LABELS,
  DUPLICATE_MATCH_WEIGHTS,
  MERGE_BLOCKER_CODES,
  MERGE_FINDING_LABELS,
  MERGE_FINDING_RECOVERY,
  MERGE_WARNING_CODES,
  evaluateDuplicatePair,
} from '@nkwapa/db';
import {
  DUPLICATE_COMBINED_CASE,
  DUPLICATE_RULE_CASES,
  MERGE_FINDING_CASES,
} from '../testing/patient-identity-matrix';
import { renderPatientIdentityMatrix } from '../testing/patient-identity-matrix-doc';

const DOC_PATH = resolve(__dirname, '../../../../docs/security/patient-identity-matrix.md');

/**
 * The identity table against the rules it claims to describe.
 *
 * The suites elsewhere prove the services behave the way the table says. This one proves the
 * table is still about the code: a duplicate rule reweighted, a merge refusal added, or a
 * confidence threshold moved all show up here rather than as a document that quietly stops being
 * true. It is also the exhaustiveness check -- a rule the domain gains but the table never
 * mentions is a rule nothing tests.
 */
describe('patient identity matrix', () => {
  it('matches the published document', () => {
    // Regenerate with: npm run docs:identity-matrix --workspace=@nkwapa/api
    expect(readFileSync(DOC_PATH, 'utf8')).toBe(renderPatientIdentityMatrix());
  });

  describe('duplicate rules', () => {
    it('accounts for every rule the heuristics can fire', () => {
      expect(DUPLICATE_RULE_CASES.map((rule) => rule.reason).sort()).toEqual(
        [...DUPLICATE_MATCH_REASONS].sort(),
      );
    });

    it.each(DUPLICATE_RULE_CASES.map((rule) => [rule.reason, rule] as const))(
      '%s fires on its own, and scores what the table says',
      (_reason, rule) => {
        expect(evaluateDuplicatePair(rule.left, rule.right)).toEqual({
          reasons: rule.expectedReasons,
          score: rule.expectedScore,
          confidence: rule.expectedConfidence,
        });
      },
    );

    it('scores each rule at its published weight when it is the only one matching', () => {
      for (const rule of DUPLICATE_RULE_CASES) {
        expect(rule.expectedReasons).toEqual([rule.reason]);
        expect(rule.expectedScore).toBe(DUPLICATE_MATCH_WEIGHTS[rule.reason]);
      }
    });

    // The stated design intent of the weights: a shared phone number is a household, a shared
    // phone number plus a birthday and a near-identical name is a duplicate chart.
    it('lifts two weak signals together into MEDIUM', () => {
      const combined = DUPLICATE_COMBINED_CASE;

      expect(evaluateDuplicatePair(combined.left, combined.right)).toEqual({
        reasons: combined.expectedReasons,
        score: combined.expectedScore,
        confidence: combined.expectedConfidence,
      });
      // Neither half reaches MEDIUM by itself, which is the whole point of summing them.
      for (const reason of combined.expectedReasons) {
        expect(DUPLICATE_MATCH_WEIGHTS[reason]).toBeLessThan(combined.expectedScore);
      }
    });

    it('marks exactly one rule as fuzzy, and it is the weakest', () => {
      const fuzzy = DUPLICATE_RULE_CASES.filter((rule) => rule.kind === 'fuzzy');

      expect(fuzzy).toHaveLength(1);
      const weakest = Math.min(
        ...DUPLICATE_RULE_CASES.map((r) => DUPLICATE_MATCH_WEIGHTS[r.reason]),
      );
      expect(DUPLICATE_MATCH_WEIGHTS[fuzzy[0].reason]).toBe(weakest);
    });

    it('gives every rule wording that never shows an operator an enum value', () => {
      for (const rule of DUPLICATE_RULE_CASES) {
        const label = DUPLICATE_MATCH_REASON_LABELS[rule.reason];
        expect(label).toBeTruthy();
        expect(label).not.toContain('_');
        expect(rule.staging.length).toBeGreaterThan(20);
      }
    });
  });

  describe('merge findings', () => {
    it('accounts for every refusal and every warning the domain defines', () => {
      expect(MERGE_FINDING_CASES.map((entry) => entry.code).sort()).toEqual(
        [...MERGE_BLOCKER_CODES, ...MERGE_WARNING_CODES].sort(),
      );
    });

    it('names each one exactly once', () => {
      const codes = MERGE_FINDING_CASES.map((entry) => entry.code);
      expect(new Set(codes).size).toBe(codes.length);
    });

    // A refusal an operator cannot act on sends them to support, which is the thing the preview
    // exists to avoid.
    it('says what each one means and what to do about it, without enum vocabulary', () => {
      for (const finding of MERGE_FINDING_CASES) {
        expect(MERGE_FINDING_LABELS[finding.code]).toBeTruthy();
        expect(MERGE_FINDING_LABELS[finding.code]).not.toContain('_');
        expect(MERGE_FINDING_RECOVERY[finding.code]).toBeTruthy();
        expect(finding.staging.length).toBeGreaterThan(20);
      }
    });
  });
});
