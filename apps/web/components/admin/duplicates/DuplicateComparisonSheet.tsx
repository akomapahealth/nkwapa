'use client';

import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import {
  candidateStatus,
  confidenceBadgeVariant,
  DUPLICATE_CONFIDENCE_LABELS,
  DUPLICATE_REVIEW_STATUS_LABELS,
  formatReasons,
  patientChartHref,
  reviewStatusBadgeVariant,
  type DuplicateCandidate,
  type DuplicateReviewStatus,
} from '@/lib/patient-duplicates';
import { PatientComparisonTable } from '@/components/patients/PatientComparisonTable';
import { InlineNotice } from '@/components/ops/OpsShared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { MergeUnavailableBadge, MergeUnavailableNotice } from './MergeAvailability';

/**
 * Two charts side by side.
 *
 * With `onDecide` this is the review queue's panel, where an operator records a decision. Without
 * it, it is the investigation's panel: the same comparison with no control that writes anything,
 * which is the difference between the two screens made visible rather than merely described.
 */
export function DuplicateComparisonSheet({
  candidate,
  onClose,
  onDecide,
}: {
  candidate: DuplicateCandidate | null;
  onClose: () => void;
  onDecide?: (status: DuplicateReviewStatus) => void;
}) {
  // Nothing selected renders nothing. Keeping a closed Sheet mounted would leave an empty
  // dialog in the accessibility tree for every page view that never opens one.
  if (!candidate) return null;

  const [left, right] = candidate.patients;
  const status = candidateStatus(candidate);
  const investigation = !onDecide;

  return (
    <Sheet open onOpenChange={(open) => (open ? undefined : onClose())}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>Compare two charts</SheetTitle>
          <SheetDescription>
            {formatReasons(candidate.reasons)}. Nothing on this panel changes either record.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-5 space-y-5">
          <div className="flex flex-wrap gap-2">
            <Badge variant={confidenceBadgeVariant(candidate.confidence)}>
              {DUPLICATE_CONFIDENCE_LABELS[candidate.confidence]}
            </Badge>
            <Badge variant={reviewStatusBadgeVariant(status)}>
              {DUPLICATE_REVIEW_STATUS_LABELS[status]}
            </Badge>
            {candidate.crossClinic ? <Badge variant="warning">Across clinics</Badge> : null}
            <MergeUnavailableBadge candidate={candidate} />
          </div>

          {candidate.review?.note ? (
            <InlineNotice tone="info" live={false}>
              &ldquo;{candidate.review.note}&rdquo;
              {candidate.review.reviewedBy ? ` — ${candidate.review.reviewedBy.displayName}` : null}
            </InlineNotice>
          ) : null}

          <MergeUnavailableNotice candidate={candidate} investigation={investigation} />

          <PatientComparisonTable
            left={left}
            right={right}
            caption="Field by field comparison of the two patient charts"
          />

          <div className="grid gap-2 sm:grid-cols-2">
            {[left, right].map((patient) => (
              <Button key={patient.id} asChild variant="outline">
                <Link href={patientChartHref(patient)}>
                  <ExternalLink aria-hidden="true" className="mr-2 h-4 w-4" />
                  Open {patient.patientCode}
                </Link>
              </Button>
            ))}
          </div>

          {onDecide ? (
            <div className="space-y-3 rounded-lg border border-border/70 bg-background/70 p-4">
              <h3 className="text-base font-semibold text-foreground">Record your decision</h3>
              <p className="text-sm leading-5 text-muted-foreground">
                Neither option changes a patient record. Merging is a separate, irreversible step on
                the chart itself.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <Button variant="outline" onClick={() => onDecide('DISMISSED')}>
                  Not a duplicate
                </Button>
                <Button onClick={() => onDecide('CONFIRMED')}>Confirm duplicate</Button>
              </div>
              {/*
                A decision has to be reversible. Without this, one mis-click hides a genuine
                duplicate from the queue permanently and the only way back is the database.
              */}
              {status !== 'OPEN' ? (
                <Button variant="ghost" className="w-full" onClick={() => onDecide('OPEN')}>
                  Move back to review
                </Button>
              ) : null}
              {/*
                Deliberately not the destructive treatment. This link navigates to the patient
                chart; it does not merge anything. Dressing it in the same red as the control that
                irreversibly consolidates two records would teach an operator to expect a
                confirmation step this button does not have.
              */}
              {candidate.mergeEligible ? (
                <Button asChild variant="outline" className="w-full">
                  {/*
                    Carries the pair, so the chart opens straight into the merge preview rather
                    than asking an operator to search again for the chart they were just reading.
                    The preview is read-only; the merge still has its own confirmation there.
                  */}
                  <Link href={`${patientChartHref(left)}?merge=${encodeURIComponent(right.id)}`}>
                    Preview merging {right.patientCode} into {left.patientCode}
                  </Link>
                </Button>
              ) : null}
            </div>
          ) : (
            <div className="space-y-2 rounded-lg border border-dashed border-border/80 bg-muted/30 p-4">
              <h3 className="text-base font-semibold text-foreground">Investigation only</h3>
              <p className="text-sm leading-5 text-muted-foreground">
                This view counts and compares; it does not record decisions or merge charts. To note
                what you found about this pair, open it in the duplicate review queue under All
                clinics.
              </p>
              <Button asChild variant="ghost" className="w-full">
                <Link href="/admin/duplicates">Go to duplicate review</Link>
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
