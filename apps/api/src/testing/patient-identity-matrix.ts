/**
 * The patient identity workflow, described once as a table.
 *
 * Duplicate detection, merge refusals and portal claim are the three places where a mistake
 * either exposes a record or consolidates the wrong chart, and a merge cannot be undone from the
 * product. So the rules are worth stating somewhere a person can read them, and worth stating
 * only once: the suites assert against this table, and `docs/security/patient-identity-matrix.md`
 * is generated from it. A document that cannot describe a rule the code does not implement is a
 * document that stays true, because a divergence fails the suite rather than sitting unread.
 *
 * Every value here is synthetic.
 */

import {
  DUPLICATE_MATCH_REASONS,
  MERGE_BLOCKER_CODES,
  MERGE_WARNING_CODES,
  type DuplicateCandidateInput,
  type DuplicateConfidence,
  type DuplicateMatchReason,
  type MergeFindingCode,
} from '@nkwapa/db';

/**
 * One duplicate rule, with a chart pair that triggers it and nothing else.
 *
 * Isolating each rule is the point. The heuristics sum their weights, so a pair that happens to
 * match on two rules tells you nothing about either one's threshold -- and the confidence band a
 * rule reaches *on its own* is what decides whether an operator ever sees the pair.
 */
export interface DuplicateRuleCase {
  reason: DuplicateMatchReason;
  /**
   * `exact` compares normalized values; `fuzzy` allows an edit distance.
   *
   * Only one rule is fuzzy, and it is deliberately the weakest: everything else must already
   * agree before a near-miss name is allowed to contribute anything at all.
   */
  kind: 'exact' | 'fuzzy';
  /** What the two charts have in common, in the words a clinic manager would use. */
  staging: string;
  left: DuplicateCandidateInput;
  right: DuplicateCandidateInput;
  /** Every rule the pair is expected to fire, in the order the scorer reports them. */
  expectedReasons: DuplicateMatchReason[];
  expectedScore: number;
  expectedConfidence: DuplicateConfidence;
}

/** A chart with no identifying detail, so a case opts in only to what its rule needs. */
function blankChart(
  id: string,
  overrides: Partial<DuplicateCandidateInput> = {},
): DuplicateCandidateInput {
  return {
    id,
    firstName: 'Ama',
    lastName: 'Mensah',
    dob: null,
    phoneE164: null,
    email: null,
    nationalIdHash: null,
    nationalIdType: null,
    nationalIdLast4: null,
    ...overrides,
  };
}

export const DUPLICATE_RULE_CASES: readonly DuplicateRuleCase[] = [
  {
    reason: 'NATIONAL_ID_HASH',
    kind: 'exact',
    staging: 'Two charts registered with the same national ID, under different names.',
    left: blankChart('dup-hash-a', {
      firstName: 'Ama',
      lastName: 'Mensah',
      dob: '1990-01-01',
      nationalIdHash: 'shared-hash',
    }),
    right: blankChart('dup-hash-b', {
      firstName: 'Kofi',
      lastName: 'Owusu',
      dob: '1985-05-05',
      nationalIdHash: 'shared-hash',
    }),
    expectedReasons: ['NATIONAL_ID_HASH'],
    expectedScore: 100,
    expectedConfidence: 'HIGH',
  },
  {
    reason: 'NAME_AND_DOB',
    kind: 'exact',
    staging: 'The same person registered twice on different days, with no ID either time.',
    left: blankChart('dup-name-a', {
      firstName: 'Akua',
      lastName: 'Boateng',
      dob: '1988-07-04',
    }),
    right: blankChart('dup-name-b', {
      firstName: 'Akua',
      lastName: 'Boateng',
      dob: '1988-07-04',
    }),
    expectedReasons: ['NAME_AND_DOB'],
    expectedScore: 50,
    expectedConfidence: 'MEDIUM',
  },
  {
    reason: 'NATIONAL_ID_LAST4',
    kind: 'exact',
    staging:
      'Two charts sharing an ID type, its last four digits and a date of birth, but recorded ' +
      'under different names -- typically one chart holding a married name.',
    left: blankChart('dup-last4-a', {
      firstName: 'Ama',
      lastName: 'Mensah',
      dob: '1990-01-01',
      nationalIdHash: 'hash-a',
      nationalIdType: 'NATIONAL_ID',
      nationalIdLast4: '4471',
    }),
    right: blankChart('dup-last4-b', {
      firstName: 'Abena',
      lastName: 'Asante',
      dob: '1990-01-01',
      nationalIdHash: 'hash-b',
      nationalIdType: 'NATIONAL_ID',
      nationalIdLast4: '4471',
    }),
    expectedReasons: ['NATIONAL_ID_LAST4'],
    expectedScore: 45,
    expectedConfidence: 'MEDIUM',
  },
  {
    reason: 'PHONE',
    kind: 'exact',
    staging: 'Two unrelated charts reachable on one phone number, which is usually a household.',
    left: blankChart('dup-phone-a', {
      firstName: 'Ama',
      lastName: 'Mensah',
      dob: '1990-01-01',
      phoneE164: '+233240000000',
    }),
    right: blankChart('dup-phone-b', {
      firstName: 'Kofi',
      lastName: 'Owusu',
      dob: '1985-05-05',
      phoneE164: '+233240000000',
    }),
    expectedReasons: ['PHONE'],
    expectedScore: 35,
    expectedConfidence: 'LOW',
  },
  {
    reason: 'EMAIL',
    kind: 'exact',
    staging: 'One email address on two charts, compared without regard to case.',
    left: blankChart('dup-email-a', {
      firstName: 'Ama',
      lastName: 'Mensah',
      dob: '1990-01-01',
      email: 'k.owusu@nkwapa.local',
    }),
    right: blankChart('dup-email-b', {
      firstName: 'Kofi',
      lastName: 'Owusu',
      dob: '1985-05-05',
      email: 'K.Owusu@nkwapa.local',
    }),
    expectedReasons: ['EMAIL'],
    expectedScore: 35,
    expectedConfidence: 'LOW',
  },
  {
    reason: 'NAME_SIMILAR_AND_DOB',
    kind: 'fuzzy',
    staging:
      'One surname and one date of birth, with a first name spelt two ways by two volunteers ' +
      '("Kwabena" and "Kwabina"). The only rule that tolerates a difference.',
    left: blankChart('dup-fuzzy-a', {
      firstName: 'Kwabena',
      lastName: 'Owusu',
      dob: '1972-11-19',
    }),
    right: blankChart('dup-fuzzy-b', {
      firstName: 'Kwabina',
      lastName: 'Owusu',
      dob: '1972-11-19',
    }),
    expectedReasons: ['NAME_SIMILAR_AND_DOB'],
    expectedScore: 30,
    expectedConfidence: 'LOW',
  },
] as const;

/**
 * A pair matching on a weak signal and a fuzzy name at once.
 *
 * Kept beside the isolated cases because it is the design intent stated in the weights comment:
 * no single weak signal reaches MEDIUM alone, but any two of them together do. A shared phone
 * number is a household; a shared phone number plus a birthday and a near-identical name is a
 * duplicate chart.
 */
export const DUPLICATE_COMBINED_CASE: DuplicateRuleCase = {
  reason: 'NAME_SIMILAR_AND_DOB',
  kind: 'fuzzy',
  staging: 'A near-identical name on the same birthday, reachable on one phone number.',
  left: blankChart('dup-combined-a', {
    firstName: 'Kwabena',
    lastName: 'Owusu',
    dob: '1972-11-19',
    phoneE164: '+233209876543',
  }),
  right: blankChart('dup-combined-b', {
    firstName: 'Kwabina',
    lastName: 'Owusu',
    dob: '1972-11-19',
    phoneE164: '+233209876543',
  }),
  expectedReasons: ['PHONE', 'NAME_SIMILAR_AND_DOB'],
  expectedScore: 65,
  expectedConfidence: 'MEDIUM',
};

/**
 * One merge finding, and the state of the two charts that produces it.
 *
 * The wording an operator reads is not repeated here: it lives in `MERGE_FINDING_LABELS` and
 * `MERGE_FINDING_RECOVERY`, and both the document and the assertions read it from there. What
 * this table adds is how to get a pair of charts into the state, which is the part manual QA
 * cannot derive from the code.
 */
export interface MergeFindingCase {
  code: MergeFindingCode;
  staging: string;
}

export const MERGE_FINDING_CASES: readonly MergeFindingCase[] = [
  {
    code: 'SAME_PATIENT',
    staging: 'Name the same chart on both sides of the merge.',
  },
  {
    code: 'PATIENT_NOT_FOUND',
    staging: 'Preview against a chart id that no longer exists, or was deleted mid-review.',
  },
  {
    code: 'CANONICAL_ALREADY_MERGED',
    staging: 'Choose a chart that has already been retired by an earlier merge as the survivor.',
  },
  {
    code: 'SOURCE_ALREADY_MERGED',
    staging: 'Choose an already-retired chart as the duplicate.',
  },
  {
    code: 'CROSS_CLINIC',
    staging:
      'Pick two charts whose `primaryClinicId` differs. The duplicate queue marks these ineligible.',
  },
  {
    code: 'CLINIC_INACTIVE',
    staging: 'Deactivate the clinic that owns both charts, then preview.',
  },
  {
    code: 'ALIAS_CODE_COLLISION',
    staging: "Give a third chart a code alias equal to the duplicate chart's own code.",
  },
  {
    code: 'OPEN_PHARMACY_PREFERENCE_CONFLICT',
    staging:
      'Leave both charts holding a preferred pharmacy period with no end date. The database ' +
      'permits only one open period per chart, so the merge would violate it.',
  },
  {
    code: 'PORTAL_LINK_CONFLICT',
    staging:
      'Link each chart to a different app account and preview without naming a portal ' +
      'strategy, so the operator has not yet said which sign-in survives.',
  },
  {
    code: 'PORTAL_ACCOUNT_RETIRED',
    staging: 'Link each chart to a different app account and name a portal strategy.',
  },
  {
    code: 'PENDING_INVITES_CANCELLED',
    staging: 'Leave an unclaimed portal invitation on whichever chart the invite strategy drops.',
  },
  {
    code: 'WEAK_DUPLICATE_SIGNAL',
    staging: 'Preview two charts that share nothing but a phone number, scoring LOW.',
  },
  {
    code: 'SOURCE_HAS_MORE_HISTORY',
    staging: 'Choose the chart holding fewer visits and measurements as the survivor.',
  },
  {
    code: 'DUPLICATE_PAIR_PREVIOUSLY_DISMISSED',
    staging: 'Dismiss the pair in the duplicate review queue, then preview a merge of it anyway.',
  },
] as const;

/** Rules and findings the table must account for, so a new one cannot be added unnoticed. */
export const IDENTITY_MATRIX_COVERAGE = {
  duplicateReasons: DUPLICATE_MATCH_REASONS,
  mergeBlockers: MERGE_BLOCKER_CODES,
  mergeWarnings: MERGE_WARNING_CODES,
} as const;
