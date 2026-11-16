import { DIABETES_GLUCOSE_CONTEXT_LABELS } from '@nkwapa/db/diabetes-thresholds';
import { DIABETES_TYPE_LABELS } from '@nkwapa/db/diabetes-interview';
import {
  formatGlucose,
  formatHba1c,
  type GlucoseUnit,
  type Hba1cUnit,
} from '@nkwapa/db/measurement-units';
import { formatOpsDay } from './ops';
import type {
  ChartGlance,
  ChartGlanceScreeningKind,
  ChartTrendDirection,
  PatientChartSectionId,
} from './patient-chart';

/*
  The "At a glance" block's lines (#341): short labelled sentences built from the API's codes by
  fixed rules. A line whose part the role cannot read is left out; a line with nothing recorded
  says so (`empty`), it never disappears.
*/

export interface GlanceLine {
  id: 'conditions' | 'bp' | 'glucose' | 'medications' | 'risks' | 'screened' | 'care';
  label: string;
  text: string;
  /** Nothing recorded: the text says so, in a muted tone. */
  empty: boolean;
  section: PatientChartSectionId;
}

const day = (at: string) => formatOpsDay(at);
/** A clinic-local YYYY-MM-DD, at midday so no timezone moves it to another day. */
const calendarDay = (date: string) => formatOpsDay(`${date}T12:00:00.000Z`);

const TREND: Record<ChartTrendDirection, string | null> = {
  RISING: 'rising',
  FALLING: 'falling',
  STEADY: 'steady',
  NOT_ENOUGH_DATA: null,
};

const ADHERENCE: Record<string, string> = {
  ALWAYS: 'taking every dose',
  SOMETIMES: 'missing some doses',
  NOT_TAKING: 'not taking them',
  UNSURE: 'unsure about doses',
};

const SCREENED: Record<ChartGlanceScreeningKind, string> = {
  VITALS: 'vitals',
  HYPERTENSION: 'BP assessment',
  DIABETES: 'diabetes',
  EYE: 'eyes',
  COUNSELLING: 'counselling',
  TOBACCO: 'tobacco',
};

function sentence(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function list(items: string[]) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

export function glanceLines(
  glance: ChartGlance,
  units: { glucoseUnit: GlucoseUnit; hba1cUnit: Hba1cUnit },
  canOpen: (section: PatientChartSectionId) => boolean,
): GlanceLine[] {
  const lines: GlanceLine[] = [];
  const link = (...preferred: PatientChartSectionId[]) =>
    preferred.find(canOpen) ?? preferred[preferred.length - 1];

  const { conditions } = glance;
  if (conditions) {
    const items: string[] = [];
    const screening = conditions.screening;
    if (screening?.hypertension === 'KNOWN_HYPERTENSION') items.push('Hypertension');
    if (screening?.hypertension === 'NEWLY_ELEVATED_BP') items.push('Newly raised blood pressure');
    if (screening?.diabetes === 'KNOWN_DIABETES') {
      const type = screening.diabetesType;
      items.push(
        type === 'TYPE_1' || type === 'TYPE_2' || type === 'GESTATIONAL'
          ? `${DIABETES_TYPE_LABELS[type]} diabetes`
          : 'Diabetes',
      );
    }
    if (screening?.diabetes === 'NEWLY_ELEVATED_GLUCOSE') items.push('Newly raised glucose');
    items.push(...(conditions.history ?? []));
    lines.push({
      id: 'conditions',
      label: 'Conditions',
      text: items.length ? items.join(', ') : 'No conditions recorded',
      empty: items.length === 0,
      section: link('medical-history', 'hypertension'),
    });
  }

  const bp = glance.bloodPressure;
  if (bp) {
    const latest = bp.latest;
    const trend = TREND[bp.direction];
    lines.push({
      id: 'bp',
      label: 'Blood pressure',
      text: latest
        ? `${latest.systolic}/${latest.diastolic} mmHg on ${day(latest.recordedAt)}` +
          (latest.repeat ? ' (repeat reading)' : '') +
          (trend ? `, ${trend} over the last 3 readings` : '')
        : 'No blood pressure recorded',
      empty: !latest,
      section: 'hypertension',
    });
  }

  const glucose = glance.glucose;
  if (glucose) {
    const latest = glucose.latest;
    const trend = TREND[glucose.direction];
    const hba1c = glucose.hba1c
      ? `HbA1c ${formatHba1c(glucose.hba1c.percent, units.hba1cUnit)} on ${day(glucose.hba1c.recordedAt)}`
      : 'HbA1c not recorded';
    const context =
      latest && latest.type !== 'UNKNOWN'
        ? ` ${(DIABETES_GLUCOSE_CONTEXT_LABELS[latest.type as keyof typeof DIABETES_GLUCOSE_CONTEXT_LABELS] ?? '').toLowerCase()}`
        : '';
    lines.push({
      id: 'glucose',
      label: 'Glucose',
      text: latest
        ? `${formatGlucose(latest.mgDl, units.glucoseUnit)}${context} on ${day(latest.recordedAt)}` +
          (trend ? `, ${trend} over the last 3${context} readings` : '') +
          `. ${hba1c}`
        : glucose.hba1c
          ? `No glucose recorded. ${hba1c}`
          : 'No glucose or HbA1c recorded',
      empty: !latest && !glucose.hba1c,
      section: 'diabetes',
    });
  }

  const meds = glance.medications;
  if (meds) {
    const parts = [
      meds.currentCount > 0
        ? `${meds.currentCount} current`
        : meds.noKnownCurrentMedications
          ? 'No known current medications'
          : 'Not reconciled yet',
    ];
    if (meds.adherence && ADHERENCE[meds.adherence.level])
      parts.push(ADHERENCE[meds.adherence.level]);
    if (meds.lastReconciledAt) parts.push(`reconciled ${day(meds.lastReconciledAt)}`);
    lines.push({
      id: 'medications',
      label: 'Medications',
      text: parts.join(', '),
      empty: meds.currentCount === 0 && !meds.noKnownCurrentMedications && !meds.lastReconciledAt,
      section: 'medications',
    });
  }

  const risks = glance.risks;
  if (risks) {
    const items: string[] = [];
    const allergies = risks.allergies;
    if (allergies?.state === 'ACTIVE_ALLERGIES') {
      for (const allergy of allergies.activeAllergies) {
        items.push(`${allergy.substance ?? 'Unnamed'} allergy`);
      }
    }
    const tobacco = risks.screening?.tobacco;
    if (tobacco?.smoking.startsWith('CURRENT')) items.push('smokes');
    else if (tobacco?.smoking === 'FORMER') items.push('former smoker');
    if (tobacco?.smokeless.startsWith('CURRENT')) items.push('uses smokeless tobacco');
    if (risks.screening?.pregnantRecordedAt) {
      items.push(`pregnant (recorded ${day(risks.screening.pregnantRecordedAt)})`);
    }
    for (const entry of risks.familyHistory ?? []) {
      items.push(`${entry.relationship.toLowerCase()} had ${entry.condition.toLowerCase()}`);
    }
    // Not knowing is itself worth watching for: the allergy question is a safety check.
    if (allergies?.state === 'NOT_RECORDED') items.push('allergy status not recorded');
    lines.push({
      id: 'risks',
      label: 'Watch for',
      text: items.length ? sentence(items.join(', ')) : 'Nothing recorded to watch for',
      empty: items.length === 0,
      section: link('medical-history', 'hypertension'),
    });
  }

  if (glance.screenings.length) {
    const done = glance.screenings.filter((entry) => entry.lastAt);
    const notYet = glance.screenings.filter((entry) => !entry.lastAt);
    const latest = done
      .map((entry) => entry.lastAt as string)
      .sort()
      .at(-1);
    const doneText = done.length
      ? `${sentence(list(done.map((entry) => SCREENED[entry.kind])))} (latest ${day(latest!)})`
      : 'Nothing screened yet';
    lines.push({
      id: 'screened',
      label: 'Screened',
      text:
        done.length && notYet.length
          ? `${doneText}. Not yet: ${list(notYet.map((entry) => SCREENED[entry.kind]))}`
          : doneText,
      empty: done.length === 0,
      section: 'visits',
    });
  }

  const care = glance.care;
  if (care) {
    const parts = [
      care.visits === 0
        ? 'No visits yet'
        : `${care.visits} ${care.visits === 1 ? 'visit' : 'visits'}` +
          (care.lastVisitAt ? `, last ${day(care.lastVisitAt)}` : ''),
    ];
    const followUp = care.followUp;
    if (followUp) {
      const due = calendarDay(followUp.dueOn);
      parts.push(
        followUp.state === 'OVERDUE'
          ? `follow-up overdue since ${due}`
          : followUp.state === 'DUE_TODAY'
            ? 'follow-up due today'
            : followUp.state === 'MET'
              ? `follow-up for ${due} kept`
              : `follow-up due ${due}`,
      );
    } else if (care.visits > 0) {
      parts.push('no follow-up date set');
    }
    lines.push({
      id: 'care',
      label: 'Care',
      text: parts.join(', '),
      empty: care.visits === 0,
      section: 'visits',
    });
  }

  return lines;
}
