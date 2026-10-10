import {
  EYES,
  EYE_STRUCTURES,
  bestAcuity,
  isReducedVision,
  type Eye,
  type EyeFindingResult,
  type EyeStructure,
  type VisionLossCause,
  type VisualAcuity,
} from '@nkwapa/db/eye-screening';

/**
 * The Eye station's examination, as the web reads and writes it. Online only, like counselling:
 * see EyeScreeningService.
 */

export const ACUITY_FIELDS = [
  'vaOdUnaided',
  'vaOsUnaided',
  'vaOuUnaided',
  'vaOdAided',
  'vaOsAided',
  'vaOuAided',
  'vaOdPinhole',
  'vaOsPinhole',
] as const;
export type AcuityField = (typeof ACUITY_FIELDS)[number];

export interface EyeFinding {
  eye: Eye;
  structure: EyeStructure;
  result: EyeFindingResult;
  note: string | null;
}

export interface EyeScreeningRecord extends Record<AcuityField, VisualAcuity | null> {
  id: string;
  encounterId: string;
  hasEyeComplaint: boolean;
  complaintHistory: string | null;
  wearsCorrection: boolean;
  cupDiscRatioOd: number | null;
  cupDiscRatioOs: number | null;
  findings: EyeFinding[];
  visionLossCause: VisionLossCause | null;
  diabeticSignsSeen: boolean;
  hypertensiveSignsSeen: boolean;
  referralRecommended: boolean;
  referralNote: string | null;
  notes: string | null;
  author: { id: string; displayName: string };
  version: number;
  updatedAt: string;
}

export const eyeScreeningPath = (clinicId: string, encounterId: string) =>
  `/clinics/${encodeURIComponent(clinicId)}/encounters/${encodeURIComponent(encounterId)}/eye-screening`;

/** Form state: blank strings for untouched inputs, one cell per (eye, structure). */
export interface EyeFormState extends Record<AcuityField, VisualAcuity | ''> {
  hasEyeComplaint: boolean;
  complaintHistory: string;
  wearsCorrection: boolean;
  cupDiscRatioOd: string;
  cupDiscRatioOs: string;
  findings: Partial<Record<`${Eye}:${EyeStructure}`, { result: EyeFindingResult; note: string }>>;
  visionLossCause: VisionLossCause | '';
  diabeticSignsSeen: boolean;
  hypertensiveSignsSeen: boolean;
  referralRecommended: boolean;
  referralNote: string;
  notes: string;
}

export const findingKey = (eye: Eye, structure: EyeStructure) => `${eye}:${structure}` as const;

export function emptyEyeForm(): EyeFormState {
  return {
    hasEyeComplaint: false,
    complaintHistory: '',
    wearsCorrection: false,
    vaOdUnaided: '',
    vaOsUnaided: '',
    vaOuUnaided: '',
    vaOdAided: '',
    vaOsAided: '',
    vaOuAided: '',
    vaOdPinhole: '',
    vaOsPinhole: '',
    cupDiscRatioOd: '',
    cupDiscRatioOs: '',
    findings: {},
    visionLossCause: '',
    diabeticSignsSeen: false,
    hypertensiveSignsSeen: false,
    referralRecommended: false,
    referralNote: '',
    notes: '',
  };
}

export function eyeFormFromRecord(record: EyeScreeningRecord | null): EyeFormState {
  const form = emptyEyeForm();
  if (!record) return form;
  for (const field of ACUITY_FIELDS) form[field] = record[field] ?? '';
  for (const finding of record.findings) {
    form.findings[findingKey(finding.eye, finding.structure)] = {
      result: finding.result,
      note: finding.note ?? '',
    };
  }
  return {
    ...form,
    hasEyeComplaint: record.hasEyeComplaint,
    complaintHistory: record.complaintHistory ?? '',
    wearsCorrection: record.wearsCorrection,
    cupDiscRatioOd: record.cupDiscRatioOd?.toString() ?? '',
    cupDiscRatioOs: record.cupDiscRatioOs?.toString() ?? '',
    visionLossCause: record.visionLossCause ?? '',
    diabeticSignsSeen: record.diabeticSignsSeen,
    hypertensiveSignsSeen: record.hypertensiveSignsSeen,
    referralRecommended: record.referralRecommended,
    referralNote: record.referralNote ?? '',
    notes: record.notes ?? '',
  };
}

const ratio = (value: string) => (value.trim() === '' ? null : Number(value));

/**
 * The PUT body. Detail that belongs to an unticked choice is dropped rather than sent, since the
 * server refuses it; a note on a finding is kept only while the finding is abnormal.
 */
export function eyePayloadFromForm(form: EyeFormState, expectedVersion?: number) {
  const findings: EyeFinding[] = [];
  for (const eye of EYES) {
    for (const structure of EYE_STRUCTURES) {
      const cell = form.findings[findingKey(eye, structure)];
      if (!cell) continue;
      findings.push({
        eye,
        structure,
        result: cell.result,
        note: cell.result === 'ABNORMAL' && cell.note.trim() ? cell.note.trim() : null,
      });
    }
  }
  const acuity = Object.fromEntries(ACUITY_FIELDS.map((field) => [field, form[field] || null]));
  return {
    ...(expectedVersion ? { expectedVersion } : {}),
    hasEyeComplaint: form.hasEyeComplaint,
    complaintHistory: form.hasEyeComplaint ? form.complaintHistory.trim() || null : null,
    wearsCorrection: form.wearsCorrection,
    ...acuity,
    cupDiscRatioOd: ratio(form.cupDiscRatioOd),
    cupDiscRatioOs: ratio(form.cupDiscRatioOs),
    findings,
    visionLossCause: form.visionLossCause || null,
    diabeticSignsSeen: form.diabeticSignsSeen,
    hypertensiveSignsSeen: form.hypertensiveSignsSeen,
    referralRecommended: form.referralRecommended,
    referralNote: form.referralRecommended ? form.referralNote.trim() || null : null,
    notes: form.notes.trim() || null,
  };
}

/** What the review station needs at a glance: best acuity per eye and anything worth a look. */
export function summarizeEyeScreening(record: EyeScreeningRecord | null) {
  if (!record) return null;
  const right = bestAcuity(record.vaOdUnaided, record.vaOdAided, record.vaOdPinhole);
  const left = bestAcuity(record.vaOsUnaided, record.vaOsAided, record.vaOsPinhole);
  const abnormal = record.findings.filter((finding) => finding.result === 'ABNORMAL').length;
  const reducedVision = isReducedVision(right) || isReducedVision(left);
  const notes = [
    reducedVision ? 'reduced vision' : null,
    abnormal ? `${abnormal} abnormal finding${abnormal === 1 ? '' : 's'}` : null,
    record.diabeticSignsSeen ? 'diabetic signs' : null,
    record.hypertensiveSignsSeen ? 'hypertensive signs' : null,
    record.referralRecommended ? 'referral recommended' : null,
  ].filter((note): note is string => note !== null);
  return {
    right,
    left,
    flag:
      reducedVision ||
      abnormal > 0 ||
      record.diabeticSignsSeen ||
      record.hypertensiveSignsSeen ||
      record.referralRecommended,
    detail: notes.join(' · '),
  };
}
