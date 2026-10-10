/**
 * The Eye station's vocabulary, as the UCC eye team runs it.
 *
 * Visual acuity is read off a Snellen chart at 6 metres, right eye (OD) first, then left (OS),
 * then both (OU). Only the metric value is stored; 20/x is a display conversion.
 *
 * Below the chart's last line the reading is a coarser test, in order of worsening vision:
 * counting fingers, hand motion, light perception, no light perception.
 */

export const VISUAL_ACUITY_VALUES = [
  '6/5',
  '6/6',
  '6/7.5',
  '6/9',
  '6/12',
  '6/18',
  '6/24',
  '6/36',
  '6/60',
  'CF',
  'HM',
  'PL',
  'NPL',
] as const;
export type VisualAcuity = (typeof VISUAL_ACUITY_VALUES)[number];

export const VISUAL_ACUITY_LABELS: Record<VisualAcuity, string> = {
  '6/5': '6/5 (20/16)',
  '6/6': '6/6 (20/20)',
  '6/7.5': '6/7.5 (20/25)',
  '6/9': '6/9 (20/30)',
  '6/12': '6/12 (20/40)',
  '6/18': '6/18 (20/60)',
  '6/24': '6/24 (20/80)',
  '6/36': '6/36 (20/120)',
  '6/60': '6/60 (20/200)',
  CF: 'Counting fingers',
  HM: 'Hand motion',
  PL: 'Light perception',
  NPL: 'No light perception',
};

export function isVisualAcuity(value: unknown): value is VisualAcuity {
  return typeof value === 'string' && (VISUAL_ACUITY_VALUES as readonly string[]).includes(value);
}

/**
 * Worse than this in either eye is flagged at review as reduced vision. 6/12 is the WHO line for
 * mild visual impairment; the UCC eye team has not yet confirmed it as their referral threshold.
 */
export const REDUCED_VISION_THRESHOLD: VisualAcuity = '6/12';

/** Higher is worse. Values come from a fixed list, so their order is their severity. */
function acuityRank(value: VisualAcuity): number {
  return VISUAL_ACUITY_VALUES.indexOf(value);
}

export function isReducedVision(value: VisualAcuity | null | undefined): boolean {
  return value != null && acuityRank(value) > acuityRank(REDUCED_VISION_THRESHOLD);
}

/** The best of the readings taken for one eye: unaided, with correction, through a pinhole. */
export function bestAcuity(
  ...readings: Array<VisualAcuity | null | undefined>
): VisualAcuity | null {
  const taken = readings.filter((value): value is VisualAcuity => value != null);
  if (!taken.length) return null;
  return taken.reduce((best, value) => (acuityRank(value) < acuityRank(best) ? value : best));
}

export const EYES = ['OD', 'OS'] as const;
export type Eye = (typeof EYES)[number];
export const EYE_LABELS: Record<Eye, string> = { OD: 'Right eye (OD)', OS: 'Left eye (OS)' };

/** Penlight (externals) first, then ophthalmoscopy (internals), each in examination order. */
export const EXTERNAL_EYE_STRUCTURES = [
  'LIDS_LASHES',
  'CONJUNCTIVA_PALPEBRAL',
  'CONJUNCTIVA_BULBAR',
  'SCLERA',
  'CORNEA',
  'ANTERIOR_CHAMBER',
  'IRIS',
  'PUPIL',
] as const;
export const INTERNAL_EYE_STRUCTURES = [
  'LENS',
  'VITREOUS',
  'OPTIC_DISC',
  'MACULA',
  'PERIPHERY',
] as const;
export const EYE_STRUCTURES = [...EXTERNAL_EYE_STRUCTURES, ...INTERNAL_EYE_STRUCTURES] as const;
export type EyeStructure = (typeof EYE_STRUCTURES)[number];

export const EYE_STRUCTURE_LABELS: Record<EyeStructure, string> = {
  LIDS_LASHES: 'Eyelids and lashes',
  CONJUNCTIVA_PALPEBRAL: 'Conjunctiva (palpebral)',
  CONJUNCTIVA_BULBAR: 'Conjunctiva (bulbar)',
  SCLERA: 'Sclera',
  CORNEA: 'Cornea',
  ANTERIOR_CHAMBER: 'Anterior chamber',
  IRIS: 'Iris',
  PUPIL: 'Pupil (shape and response to light)',
  LENS: 'Lens',
  VITREOUS: 'Vitreous',
  OPTIC_DISC: 'Optic nerve head (shape, pallor, disc and cup margins)',
  MACULA: 'Macula',
  PERIPHERY: 'Periphery',
};

export const EYE_FINDING_RESULTS = ['NORMAL', 'ABNORMAL', 'NOT_ASSESSED'] as const;
export type EyeFindingResult = (typeof EYE_FINDING_RESULTS)[number];

export const VISION_LOSS_CAUSES = ['REFRACTIVE', 'PATHOLOGICAL', 'UNDETERMINED'] as const;
export type VisionLossCause = (typeof VISION_LOSS_CAUSES)[number];
export const VISION_LOSS_CAUSE_LABELS: Record<VisionLossCause, string> = {
  REFRACTIVE: 'Refractive',
  PATHOLOGICAL: 'Pathological',
  UNDETERMINED: 'Not determined',
};

export const CUP_DISC_RATIO_MIN = 0;
export const CUP_DISC_RATIO_MAX = 1;
