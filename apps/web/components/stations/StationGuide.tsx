'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Printer } from 'lucide-react';
import type { StationKindValue } from '@nkwapa/db/clinic-stations';
import type { GlucoseUnit } from '@nkwapa/db/measurement-units';
import { ProgressiveHelp } from '@/components/ui/progressive-help';
import {
  END_OF_DAY_LINE,
  isGuidedStationKind,
  nextStepLine,
  stationGuideSteps,
  stationGuideTitle,
  type GuidedStationKind,
} from '@/lib/station-guide';
import { cn } from '@/lib/utils';

/** The steps, where the patient goes next, and the end of the day: on screen and on paper. */
export function StationGuideBody({
  kind,
  nextName,
  glucoseUnit,
  className,
}: {
  kind: GuidedStationKind;
  nextName: string | null;
  glucoseUnit: GlucoseUnit;
  className?: string;
}) {
  const next = nextStepLine(kind, nextName);
  return (
    <div className={cn('space-y-3 text-foreground', className)}>
      <ol className="list-decimal space-y-1.5 pl-5 marker:font-medium marker:tabular-nums marker:text-muted-foreground">
        {stationGuideSteps(kind, { glucoseUnit, nextName }).map((step) => (
          <li key={step} className="max-w-[70ch] pl-1">
            {step}
          </li>
        ))}
      </ol>
      {next ? (
        <p
          data-testid="station-guide-next"
          className="max-w-[70ch] border-t border-rule pt-3 font-medium"
        >
          {next}
        </p>
      ) : null}
      <p className="max-w-[70ch] text-muted-foreground">{END_OF_DAY_LINE}</p>
    </div>
  );
}

/**
 * "How the <station> station works" (#412), closed by default so it is one 44px row above the
 * form. Each person's choice is remembered per station kind on this device.
 */
export function StationGuidePanel({
  kind,
  stationName,
  nextName,
  glucoseUnit,
  userId,
}: {
  kind: StationKindValue;
  stationName: string;
  nextName: string | null;
  glucoseUnit: GlucoseUnit;
  userId: string;
}) {
  const storageKey = `nkwapa:station-guide:${userId}:${kind}`;
  // Read on first render (this page only renders in the browser, after the visit loads), so a
  // guide left open does not open a frame later and push the form down under a tap.
  const [open, setOpen] = useState(() => readOpen(storageKey));
  useEffect(() => setOpen(readOpen(storageKey)), [storageKey]);

  if (!isGuidedStationKind(kind)) return null;

  return (
    <ProgressiveHelp
      title={stationGuideTitle(stationName)}
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        try {
          window.localStorage.setItem(storageKey, next ? 'open' : 'closed');
        } catch {
          // As above: a preference that cannot be saved must not break the visit.
        }
      }}
      className="mb-4"
    >
      <StationGuideBody kind={kind} nextName={nextName} glucoseUnit={glucoseUnit} />
      <Link
        href="/stations/guide"
        // A new tab: leaving the visit would drop readings typed but not yet saved.
        target="_blank"
        rel="noopener"
        className="mt-3 inline-flex min-h-11 items-center gap-2 font-medium text-primary underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Printer aria-hidden="true" className="h-4 w-4" />
        Print every station’s guide
        <span className="sr-only"> (opens in a new tab)</span>
      </Link>
    </ProgressiveHelp>
  );
}

function readOpen(storageKey: string): boolean {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem(storageKey) === 'open';
  } catch {
    // Storage refused (some privacy modes): the guide just starts closed.
    return false;
  }
}
