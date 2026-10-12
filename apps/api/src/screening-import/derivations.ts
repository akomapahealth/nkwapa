import {
  classifyBloodPressure,
  computeBmi,
  evaluateGlucoseSuspicion,
  isHypoglycemic,
} from '@nkwapa/db';
import type { GlucoseType } from '@prisma/client';
import { GLUCOSE_TYPE, label } from './labels';
import type { SheetPatient } from './read-sheet';

export interface DerivationMismatch {
  visitId: string;
  field: 'BP category' | 'Glucose result' | 'BMI';
  sheet: string;
  nkwapa: string;
}

/** The sheet's BP categories in Nkwapa's terms. Nkwapa has no "Low" band: low readings are NORMAL. */
const SHEET_BP: Record<string, string> = {
  CRISIS: 'CRISIS',
  'Stage 2': 'STAGE2',
  'Stage 1': 'STAGE1',
  Elevated: 'ELEVATED',
  Normal: 'NORMAL',
  Low: 'NORMAL',
  Incomplete: 'UNKNOWN',
};

const numberOrNull = (raw: string) => (raw.trim() === '' ? null : Number(raw));

/**
 * Recompute what the sheet's grey columns computed, with Nkwapa's own functions, and list every
 * row where they disagree. The sheet averaged both readings, so the comparison classifies the same
 * average; what Nkwapa stores is classified from reading 1.
 */
export function compareDerivations(p: SheetPatient): DerivationMismatch[] {
  const out: DerivationMismatch[] = [];
  const { bp, glucose, body } = p.tabs;

  if (bp.Category) {
    const avgSys = numberOrNull(bp['Avg systolic']);
    const avgDia = numberOrNull(bp['Avg diastolic']);
    const nkwapa = classifyBloodPressure(avgSys, avgDia);
    if (SHEET_BP[bp.Category] !== nkwapa) {
      out.push({ visitId: p.visitId, field: 'BP category', sheet: bp.Category, nkwapa });
    }
  }

  if (glucose.Result) {
    const value = numberOrNull(glucose['Glucose (mg/dL)']);
    let type: GlucoseType | undefined;
    try {
      type = label(GLUCOSE_TYPE, 'Test type', glucose['Test type']);
    } catch {
      type = undefined; // the row is rejected for the label; nothing to compare
    }
    const nkwapa = isHypoglycemic(value)
      ? 'LOW'
      : evaluateGlucoseSuspicion(value, type ?? 'UNKNOWN');
    const sheet =
      glucose.Result === 'LOW - act now'
        ? 'LOW'
        : glucose.Result === 'Suspected diabetes'
          ? 'SUSPECTED'
          : 'NOT_SUSPECTED';
    if (sheet !== nkwapa)
      out.push({ visitId: p.visitId, field: 'Glucose result', sheet: glucose.Result, nkwapa });
  }

  if (body.BMI) {
    const nkwapa = computeBmi(numberOrNull(body['Weight (kg)']), numberOrNull(body['Height (cm)']));
    if (nkwapa === null || Math.abs(nkwapa - Number(body.BMI)) > 0.05) {
      out.push({ visitId: p.visitId, field: 'BMI', sheet: body.BMI, nkwapa: String(nkwapa) });
    }
  }
  return out;
}
