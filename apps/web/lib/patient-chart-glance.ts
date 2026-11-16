import {
  glanceLines as sharedGlanceLines,
  type GlanceLine,
} from '@nkwapa/db/patient-chart-glance-lines';
import type { GlucoseUnit, Hba1cUnit } from '@nkwapa/db/measurement-units';
import { formatOpsDay } from './ops';
import type { ChartGlance, PatientChartSectionId } from './patient-chart';

export type { GlanceLine };

/** The shared "At a glance" rules (#341), with days in the clinic's time zone. */
export function glanceLines(
  glance: ChartGlance,
  units: { glucoseUnit: GlucoseUnit; hba1cUnit: Hba1cUnit },
  canOpen: (section: PatientChartSectionId) => boolean,
): GlanceLine[] {
  return sharedGlanceLines(glance, units, canOpen, (at) => formatOpsDay(at));
}
