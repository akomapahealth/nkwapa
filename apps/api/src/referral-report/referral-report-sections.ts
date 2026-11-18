import { randomInt } from 'node:crypto';
import type { PatientChartFeatureFlag } from '@nkwapa/db';
import { PERMISSIONS } from '../auth/constants/permissions';

/**
 * The parts of a referral report a sender can tick (#344), in print order.
 *
 * The header, the patient block and the reason are always printed: a report without them is not a
 * referral. Everything else is a section with the permission that reads the same data in the app,
 * so a report never holds anything the sender could not open on the chart.
 */
export const REFERRAL_REPORT_SECTIONS = [
  'SUMMARY',
  'HISTORY',
  'READINGS',
  'MEDICATIONS',
  'ASSESSMENTS',
  'PLAN',
  'NOTES',
] as const;

export type ReferralReportSection = (typeof REFERRAL_REPORT_SECTIONS)[number];

const SECTION_RULES: Record<
  ReferralReportSection,
  { permission: string; featureFlag?: PatientChartFeatureFlag }
> = {
  SUMMARY: { permission: PERMISSIONS.PATIENT_READ },
  HISTORY: { permission: PERMISSIONS.MEDICAL_HISTORY_READ, featureFlag: 'medicalHistory' },
  READINGS: { permission: PERMISSIONS.SCREENING_READ },
  MEDICATIONS: {
    permission: PERMISSIONS.MEDICATION_RECONCILIATION_READ,
    featureFlag: 'medicationReconciliation',
  },
  ASSESSMENTS: { permission: PERMISSIONS.SCREENING_READ },
  PLAN: { permission: PERMISSIONS.ENCOUNTER_READ },
  NOTES: { permission: PERMISSIONS.CLINICAL_NOTE_READ, featureFlag: 'clinicalNotes' },
};

/** Signed notes go in only when ticked: they are long and carry more than a referral needs. */
const OPT_IN: readonly ReferralReportSection[] = ['NOTES'];

export const has = (permissions: readonly string[], permission: string) =>
  permissions.includes('*') || permissions.includes(permission);

/** Every section this sender may include, in print order. */
export function allowedReferralSections(
  permissions: readonly string[],
  enabledFlags: readonly PatientChartFeatureFlag[],
): ReferralReportSection[] {
  return REFERRAL_REPORT_SECTIONS.filter((section) => {
    const rule = SECTION_RULES[section];
    if (rule.featureFlag && !enabledFlags.includes(rule.featureFlag)) return false;
    return has(permissions, rule.permission);
  });
}

/**
 * What goes in: the request's list, or every allowed section but the opt-in ones. A requested
 * section the sender may not read comes back in `refused` so the caller can say no rather than
 * quietly print a shorter report than the one that was asked for.
 */
export function resolveReferralSections(
  requested: readonly ReferralReportSection[] | undefined,
  allowed: readonly ReferralReportSection[],
): { sections: ReferralReportSection[]; refused: ReferralReportSection[] } {
  if (!requested) {
    return { sections: allowed.filter((section) => !OPT_IN.includes(section)), refused: [] };
  }
  const wanted = new Set(requested);
  return {
    sections: REFERRAL_REPORT_SECTIONS.filter((s) => wanted.has(s) && allowed.includes(s)),
    refused: REFERRAL_REPORT_SECTIONS.filter((s) => wanted.has(s) && !allowed.includes(s)),
  };
}

/** No 0/O, 1/I/L: the code is read aloud over the phone and typed on a different device. */
export const PASSCODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
/*
  16 characters, 31^16 ≈ 7.3e23 codes. pdfkit's strongest PDF encryption (revision 5) checks a
  passcode with one SHA-256, so anyone holding the file can guess offline at GPU speed: 8
  characters fell in minutes, 16 take on the order of a million GPU-years.
*/
export const PASSCODE_LENGTH = 16;

/** From the CSPRNG. Shown once and never stored. */
export function generatePasscode(): string {
  let code = '';
  for (let i = 0; i < PASSCODE_LENGTH; i++) {
    code += PASSCODE_ALPHABET[randomInt(PASSCODE_ALPHABET.length)];
  }
  return code;
}
