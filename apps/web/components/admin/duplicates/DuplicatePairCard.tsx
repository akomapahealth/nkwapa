'use client';

import {
  confidenceBadgeVariant,
  DUPLICATE_CONFIDENCE_LABELS,
  describeMatchPrecision,
  formatReasons,
  patientDisplayName,
  type DuplicateCandidate,
} from '@/lib/patient-duplicates';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MergeUnavailableBadge } from './MergeAvailability';

/**
 * One candidate pair as a card, for the widths where a pair does not fit a grid row.
 *
 * `showClinics` names each chart's clinic under its code. The review queue leaves it off, since a
 * same-clinic pair's clinic is the one in the header; on the investigation screen the two clinics
 * are the point.
 */
export function DuplicatePairCard({
  candidate,
  onCompare,
  showClinics = false,
}: {
  candidate: DuplicateCandidate;
  onCompare: (candidate: DuplicateCandidate) => void;
  showClinics?: boolean;
}) {
  const precision = describeMatchPrecision(candidate.reasons);

  return (
    <article
      data-testid="duplicate-pair-card"
      className="rounded-lg border border-border/80 bg-background/80 p-4 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <Badge variant={confidenceBadgeVariant(candidate.confidence)}>
          {DUPLICATE_CONFIDENCE_LABELS[candidate.confidence]}
        </Badge>
        <div className="flex flex-wrap gap-2">
          {candidate.crossClinic && !showClinics ? (
            <Badge variant="warning">Across clinics</Badge>
          ) : null}
          <MergeUnavailableBadge candidate={candidate} />
        </div>
      </div>
      <dl className="mt-3 space-y-2">
        {candidate.patients.map((patient) => (
          <div key={patient.id}>
            <dt className="text-base font-semibold text-foreground">
              {patientDisplayName(patient)}
            </dt>
            <dd className="text-sm text-muted-foreground">
              {patient.patientCode}
              {showClinics ? <> · {patient.clinic.name}</> : null}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-sm leading-5 text-muted-foreground">
        {formatReasons(candidate.reasons)}
      </p>
      {/* An approximate name match reads like any other reason in that list. */}
      {precision ? <p className="mt-1 text-sm leading-5 text-warning-ink">{precision}</p> : null}
      <p className="mt-2 text-sm tabular-nums text-muted-foreground">
        Last updated {candidate.lastUpdatedAt.slice(0, 10)}
      </p>
      <Button variant="outline" className="mt-4 w-full" onClick={() => onCompare(candidate)}>
        Compare charts
      </Button>
    </article>
  );
}
