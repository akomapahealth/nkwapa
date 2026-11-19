/** Referral reports (#344): what the sheet offers and says. The API decides what may go in. */

export type ReferralReportSection =
  | 'SUMMARY'
  | 'HISTORY'
  | 'READINGS'
  | 'MEDICATIONS'
  | 'ASSESSMENTS'
  | 'PLAN'
  | 'NOTES';

export type ReferralUrgency = 'ROUTINE' | 'SOON' | 'URGENT';
export type ReferralDelivery = 'DOWNLOAD' | 'EMAIL';

export const REFERRAL_REASON_MAX = 500;

export const REFERRAL_SECTION_COPY: Record<
  ReferralReportSection,
  { label: string; description: string }
> = {
  SUMMARY: {
    label: 'At a glance',
    description: 'Conditions, latest readings, medications and follow-up, as on the Overview.',
  },
  HISTORY: {
    label: 'Conditions and history',
    description: 'Conditions, allergies, surgery, family and social history.',
  },
  READINGS: {
    label: 'Readings',
    description: 'The last 6 blood pressure, glucose and HbA1c values, in this clinic’s units.',
  },
  MEDICATIONS: {
    label: 'Medications',
    description: 'Current medications with dose and adherence.',
  },
  ASSESSMENTS: {
    label: 'Latest assessments',
    description: 'Hypertension and diabetes assessments in sentences, and eye findings.',
  },
  PLAN: { label: 'Plan', description: 'Care plan and the next follow-up date.' },
  NOTES: {
    label: 'Signed clinical notes',
    description: 'Up to 5 signed notes. Off unless you need them.',
  },
};

/** Ticked when the sheet opens: everything allowed except signed notes. */
export function defaultReferralSections(allowed: readonly ReferralReportSection[]) {
  return allowed.filter((section) => section !== 'NOTES');
}

function list(items: string[]) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

/** One plain sentence of what is about to leave the clinic. */
export function referralShareSummary(input: {
  patientName: string;
  sections: readonly ReferralReportSection[];
  delivery: ReferralDelivery;
  recipientEmail: string;
  facility: string;
}): string {
  const parts = [
    'name, patient code, date of birth, phone and residence',
    ...input.sections.map((section) => REFERRAL_SECTION_COPY[section].label.toLowerCase()),
  ];
  const to =
    input.delivery === 'EMAIL'
      ? `emailed to ${input.recipientEmail.trim() || 'the address you enter'}`
      : 'downloaded to this device';
  const facility = input.facility.trim() ? ` for ${input.facility.trim()}` : '';
  return `${input.patientName}’s ${list(parts)}, ${to}${facility}, locked with a passcode.`;
}

/** "K7QMXR4P" as "K7QM XR4P": read aloud in two halves. Copied without the space. */
/** Groups of four for reading aloud. Spaced by layout, so a copied passcode carries no spaces. */
export function groupPasscode(passcode: string): string[] {
  return passcode.match(/.{1,4}/g) ?? [];
}

export function pdfBlobFromBase64(base64: string): Blob {
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  return new Blob([bytes], { type: 'application/pdf' });
}
