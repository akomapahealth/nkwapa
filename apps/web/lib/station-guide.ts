import {
  BP_ESCALATION_DIASTOLIC,
  BP_ESCALATION_SYSTOLIC,
  BP_MAX_READINGS,
  BP_REPEAT_PROMPT_DIASTOLIC,
  BP_REPEAT_PROMPT_SYSTOLIC,
} from '@nkwapa/db/bp-classification';
import { type StationKindValue } from '@nkwapa/db/clinic-stations';
import {
  DM_HYPOGLYCEMIA_MG_DL,
  suspicionThresholdFor,
  type DiabetesGlucoseContext,
} from '@nkwapa/db/diabetes-thresholds';
import { DEFAULT_FOLLOW_UP_CONFIG } from '@nkwapa/db/follow-up-stratification';
import { HYPERTENSION_SYMPTOM_LABELS } from '@nkwapa/db/hypertension-interview';
import { formatGlucose, MG_DL_PER_MMOL_L, type GlucoseUnit } from '@nkwapa/db/measurement-units';
import { suggestedNextStation, type ClinicStation } from './stations';

/**
 * The how-to card for each station (#412), read by first-time volunteers.
 *
 * Every number is read from the shared code the forms enforce, so changing a threshold changes the
 * guide with no copy edit. Five lines at most per station: it is a reminder, not training.
 */

export type GuidedStationKind = Exclude<StationKindValue, 'CUSTOM'>;

/** CUSTOM stations do whatever the clinic set them up for, so there is nothing general to say. */
export const GUIDED_STATION_KINDS: readonly GuidedStationKind[] = [
  'INTAKE',
  'BLOOD_PRESSURE',
  'GLUCOSE',
  'ANTHROPOMETRY',
  'EYE',
  'REVIEW',
];

export function isGuidedStationKind(kind: StationKindValue): kind is GuidedStationKind {
  return kind !== 'CUSTOM';
}

const { dangerBp, dangerBpSymptoms, dangerGlucoseMmol } = DEFAULT_FOLLOW_UP_CONFIG;

/** Either number alone is enough, as in `shouldPromptRepeat` and `isSeverelyElevated`. */
function bp(systolic: number, diastolic: number) {
  return `Top number ${systolic} or more, or bottom ${diastolic} or more`;
}

/** "a, b or c": any one of them, not all. */
function anyOf(items: string[]) {
  return items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} or ${items.at(-1)}`;
}

/** The glucose station's timing choices, worded as the form words them. */
const GLUCOSE_TIMINGS: ReadonlyArray<[DiabetesGlucoseContext, string]> = [
  ['FASTING', 'fasting'],
  ['BEFORE_MEAL', 'before a meal'],
  ['POST_PRANDIAL_2H', '2 hours after a meal'],
  ['RANDOM', 'random'],
];

/** "High is fasting or before a meal: 126 mg/dL or more; ..." grouped by each timing's threshold. */
function glucoseHighLine(format: (mgDl: number) => string) {
  const byThreshold = new Map<number, string[]>();
  for (const [context, label] of GLUCOSE_TIMINGS) {
    const threshold = suspicionThresholdFor(context);
    if (threshold !== null)
      byThreshold.set(threshold, [...(byThreshold.get(threshold) ?? []), label]);
  }
  const parts = [...byThreshold].map(
    ([threshold, labels]) => `${anyOf(labels)}, ${format(threshold)} or more`,
  );
  return `High is: ${parts.join('; ')}. Flag it in your note for review.`;
}

/** "How the Blood pressure station works", without "Eye station station". */
export function stationGuideTitle(stationName: string) {
  const name = stationName.trim();
  return /\bstation$/i.test(name) ? `How the ${name} works` : `How the ${name} station works`;
}

/** The numbered lines for one station, in the clinic's glucose unit. */
export function stationGuideSteps(
  kind: GuidedStationKind,
  { glucoseUnit, nextName }: { glucoseUnit: GlucoseUnit; nextName?: string | null },
): string[] {
  const glucose = (mgDl: number) => formatGlucose(mgDl, glucoseUnit) ?? '';
  switch (kind) {
    case 'INTAKE':
      return [
        'Search Patients by name or phone first. If they have a chart, press Check in and start.',
        'No chart? Press New patient. Fill in first name, last name, date of birth and phone.',
        'No ID with them? Tick “No ID with them today”. Never make up a number.',
        'Press Register and start. Write the patient number on their card.',
        `Ask the history questions, then press Send to ${nextName ?? 'the next station'}.`,
      ];
    case 'BLOOD_PRESSURE':
      return [
        'Seat the patient for 5 minutes, feet flat, arm resting at heart level. Use the right cuff size.',
        `Take 2 to ${BP_MAX_READINGS} readings a minute apart, with pulse. Nkwapa works out the average.`,
        `${bp(BP_REPEAT_PROMPT_SYSTOLIC, BP_REPEAT_PROMPT_DIASTOLIC)}: rest them 5 minutes, then measure again.`,
        `${bp(BP_ESCALATION_SYSTOLIC, BP_ESCALATION_DIASTOLIC)}: press Ask a doctor straight away.`,
        `${bp(dangerBp.systolic, dangerBp.diastolic)}, with any one of ${anyOf(
          dangerBpSymptoms.map((symptom) => HYPERTENSION_SYMPTOM_LABELS[symptom].toLowerCase()),
        )}: refer today. Do not send them home.`,
      ];
    case 'GLUCOSE':
      return [
        `Ask when they last ate, then choose the timing that matches: ${anyOf(
          GLUCOSE_TIMINGS.map(([, label]) => label),
        )}. Never guess.`,
        glucoseHighLine(glucose),
        `Above ${glucose(dangerGlucoseMmol * MG_DL_PER_MMOL_L)}, or ${glucose(DM_HYPOGLYCEMIA_MG_DL)} or lower with symptoms: refer today. Do not send them home.`,
        'Used strips and lancets go in the sharps box, never the bin.',
      ];
    case 'ANTHROPOMETRY':
      return [
        'Shoes and heavy clothes off. Empty pockets.',
        'Put the scale on a flat, hard floor. Check it reads zero before they step on.',
        'For height: heels, back and head against the wall, looking straight ahead.',
        'Read the height at your eye level, not from below.',
      ];
    case 'EYE':
      return [
        'Stand the patient 6 metres from the chart.',
        'Cover one eye. Test the right eye, then the left, then both.',
        'Wears glasses? Tick it, test with them on, and record under With correction.',
      ];
    case 'REVIEW':
      return [
        'Read the results and any red flags from the line first.',
        'Talk through what applies: blood pressure, blood sugar, food, activity, tobacco, alcohol, medicines.',
        'Any danger sign: refer today. Otherwise set follow-up, or a referral, in the form.',
        'A volunteer’s or manager’s note needs a doctor’s cosign: press Submit for cosign.',
        'Press Complete session.',
      ];
  }
}

/** Where the patient goes next and what to say to them, or the goodbye after review. */
export function nextStepLine(kind: GuidedStationKind, nextName: string | null): string | null {
  if (kind === 'REVIEW')
    return 'Last station. Tell them: “You are done for today. Keep your card.”';
  if (!nextName) return null;
  return `Next: ${nextName}. Tell them: “Go to ${nextName} and show them your card.”`;
}

/** #425: volunteers could not tell End shift from Sign out. */
export const END_OF_DAY_LINE = 'End of the day: press End shift, then sign out.';

/**
 * The next station after the clinic's first open station of this kind, by the same rule the
 * hand-off uses. Null when the clinic has no open station of the kind.
 */
export function guideNextStation(
  stations: readonly ClinicStation[],
  kind: GuidedStationKind,
): ClinicStation | null {
  const active = stations.filter((station) => station.active);
  const at = [...active]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .find((station) => station.kind === kind);
  return at ? suggestedNextStation(active, at.id) : null;
}
