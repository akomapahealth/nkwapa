'use client';

import { AlertTriangle, OctagonAlert } from 'lucide-react';
import { formatGlucose, type GlucoseUnit } from '@nkwapa/db/measurement-units';
import {
  worstLineFlag,
  type LineFlag,
  type LineFlagKind,
  type RaisedLineFlag,
} from '@nkwapa/db/station-line-flags';
import { InlineNotice } from '@/components/feedback/InlineNotice';
import { Badge } from '@/components/ui/badge';
import { useClinicUnits } from '@/lib/bootstrap-context';
import { formatOpsTime } from '@/lib/ops';
import { cn } from '@/lib/utils';

/** Red flags carried with the patient along the line (#415): words and an icon, never colour alone. */
export const LINE_FLAG_LABELS: Record<LineFlagKind, string> = {
  REFER_TODAY: 'Refer today',
  REPEAT_AT_REVIEW: 'Repeat at review',
};

/** "BP 184/112" or "Glucose 23.3 mmol/L", in the clinic's glucose unit. */
export function lineFlagReading(flag: RaisedLineFlag, glucoseUnit: GlucoseUnit): string {
  return flag.source === 'BP'
    ? `BP ${flag.systolic}/${flag.diastolic}`
    : `Glucose ${formatGlucose(flag.glucoseMgDl, glucoseUnit) ?? '–'}`;
}

/** The hand-off note a station suggests when it raised a flag: "BP 184/112, refer today". */
export function suggestedHandoffNote(flags: readonly RaisedLineFlag[], glucoseUnit: GlucoseUnit) {
  return flags
    .map(
      (flag) =>
        `${lineFlagReading(flag, glucoseUnit)}, ${LINE_FLAG_LABELS[flag.kind].toLowerCase()}`,
    )
    .join('; ');
}

/** The worst flag on a patient as one chip, or nothing. */
export function LineFlagChip({
  flags,
  className,
  ...props
}: {
  flags: readonly LineFlag[] | null | undefined;
  className?: string;
  'aria-hidden'?: 'true';
}) {
  const worst = worstLineFlag(flags);
  if (!worst) return null;
  const Icon = worst === 'REFER_TODAY' ? OctagonAlert : AlertTriangle;
  return (
    <Badge
      data-testid="line-flag-chip"
      variant={worst === 'REFER_TODAY' ? 'destructive' : 'warning'}
      className={cn('gap-1 whitespace-nowrap', className)}
      {...props}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {LINE_FLAG_LABELS[worst]}
    </Badge>
  );
}

/**
 * Every flag on the patient with the reading that raised it, where and when: "Refer today · BP
 * 184/112 at Blood pressure, 10:42". At the top of each station visit, and the review banner.
 */
export function LineFlagsNotice({
  flags,
  timezone,
  title,
}: {
  flags: readonly LineFlag[] | null | undefined;
  timezone: string;
  title: string;
}) {
  const { glucoseUnit } = useClinicUnits();
  const worst = worstLineFlag(flags);
  if (!worst || !flags) return null;
  return (
    <InlineNotice tone={worst === 'REFER_TODAY' ? 'error' : 'warning'} live={false}>
      <div data-testid="line-flags-notice" className="space-y-1.5">
        <p className="font-semibold">{title}</p>
        <ul className="space-y-1">
          {[...flags]
            .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'REFER_TODAY' ? -1 : 1))
            .map((flag) => (
              <li key={flag.source} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <LineFlagChip flags={[flag]} />
                <span>
                  {lineFlagReading(flag, glucoseUnit)} at {flag.stationName},{' '}
                  {formatOpsTime(flag.at, timezone)}
                </span>
              </li>
            ))}
        </ul>
      </div>
    </InlineNotice>
  );
}
