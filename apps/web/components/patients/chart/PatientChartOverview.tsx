'use client';

import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  CircleCheck,
  HeartPulse,
  Pill,
  ShieldCheck,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { InlineErrorState, SectionSkeleton } from '@/components/feedback/AppState';
import { EmptyStateCard } from '@/components/ops/OpsShared';
import { formatOpsDateTime } from '@/lib/ops';
import {
  buildChartHref,
  buildEncounterHref,
  type ChartPendingAction,
  type PatientChartSectionId,
  type PatientChartSummary,
} from '@/lib/patient-chart';
import { ChartLockedBadge, ChartStatusBadge } from './ChartStatusBadge';

function SummaryCard({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon: typeof HeartPulse;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Card className="rounded-[24px] border-border/80 bg-card/90">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
            <h3 className="text-sm font-semibold">{title}</h3>
          </div>
          {action}
        </div>
      </CardHeader>
      <CardContent className="pt-0 text-sm">{children}</CardContent>
    </Card>
  );
}

function NotRecorded({ children }: { children: ReactNode }) {
  return <p className="text-muted-foreground">{children}</p>;
}

function SectionLink({
  clinicId,
  patientId,
  section,
  children,
  onNavigate,
}: {
  clinicId: string;
  patientId: string;
  section: PatientChartSectionId;
  children: ReactNode;
  onNavigate?: (section: PatientChartSectionId) => void;
}) {
  return (
    <Link
      href={buildChartHref(clinicId, patientId, section)}
      onClick={(event) => {
        // Keep a real href so the link is shareable and can be opened in a new tab, but
        // switch in place when we can: a full navigation would fail on an offline device.
        if (onNavigate && !event.metaKey && !event.ctrlKey && !event.shiftKey) {
          event.preventDefault();
          onNavigate(section);
        }
      }}
      className="inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 transition-colors duration-150 hover:underline"
    >
      {children}
      <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
    </Link>
  );
}

function PendingActionRow({
  action,
  clinicId,
  patientId,
  onNavigate,
}: {
  action: ChartPendingAction;
  clinicId: string;
  patientId: string;
  onNavigate?: (section: PatientChartSectionId) => void;
}) {
  return (
    <li className="flex flex-col gap-2 rounded-2xl border border-border/70 bg-background/70 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-medium">
          {action.label}
          {action.count > 1 ? ` (${action.count})` : ''}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">{action.description}</p>
      </div>
      {action.encounterId ? (
        <Link
          href={buildEncounterHref(clinicId, action.encounterId)}
          className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-primary underline-offset-4 transition-colors duration-150 hover:underline"
        >
          Open visit
          <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      ) : (
        <SectionLink
          clinicId={clinicId}
          patientId={patientId}
          section={action.section}
          onNavigate={onNavigate}
        >
          Resolve
        </SectionLink>
      )}
    </li>
  );
}

export function PatientChartOverview({
  clinicId,
  patientId,
  summary,
  loading,
  error,
  onRetry,
  onNavigate,
  children,
}: {
  clinicId: string;
  patientId: string;
  summary: PatientChartSummary | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onNavigate?: (section: PatientChartSectionId) => void;
  /** Chart-level detail cards (patient details, portal, admin actions). */
  children?: ReactNode;
}) {
  if (error && !summary) {
    return (
      <InlineErrorState
        title="Chart summary could not be loaded"
        description={error}
        onRetry={onRetry}
      />
    );
  }

  if (loading && !summary) {
    return (
      <div role="status" aria-live="polite" aria-busy="true">
        <span className="sr-only">Loading chart summary</span>
        <SectionSkeleton lines={5} />
      </div>
    );
  }

  const latestVitals = summary?.vitals?.latest ?? null;
  const latestDiabetes = summary?.diabetes?.latest ?? null;
  const allergies = summary?.allergies ?? null;
  const medications = summary?.medications ?? null;
  const pendingActions = summary?.pendingActions ?? [];

  return (
    <div className="space-y-4">
      {error ? (
        <InlineErrorState
          title="Chart summary may be out of date"
          description={error}
          onRetry={onRetry}
        />
      ) : null}

      <Card className="rounded-[28px] border-border/80 bg-card/90 shadow-lg shadow-black/5">
        <CardHeader>
          <h2 className="text-lg font-semibold">Pending clinical actions</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            What still needs attention on this chart.
          </p>
        </CardHeader>
        <CardContent>
          {pendingActions.length === 0 ? (
            <div className="flex items-center gap-3 rounded-2xl border border-border/70 bg-background/70 p-4">
              <CircleCheck className="h-5 w-5 text-primary" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">
                Nothing is outstanding for your role on this chart.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {pendingActions.map((action) => (
                <PendingActionRow
                  key={`${action.kind}-${action.encounterId ?? 'none'}`}
                  action={action}
                  clinicId={clinicId}
                  patientId={patientId}
                  onNavigate={onNavigate}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <section aria-label="Current clinical summary" className="grid gap-3 md:grid-cols-2">
        {summary?.vitals ? (
          <SummaryCard
            icon={HeartPulse}
            title="Latest vitals"
            action={
              <SectionLink
                clinicId={clinicId}
                patientId={patientId}
                section="vitals"
                onNavigate={onNavigate}
              >
                View
              </SectionLink>
            }
          >
            {latestVitals ? (
              <div className="space-y-1">
                <p className="text-2xl font-semibold">
                  {latestVitals.systolicBp !== null && latestVitals.diastolicBp !== null
                    ? `${latestVitals.systolicBp}/${latestVitals.diastolicBp}`
                    : '—'}
                  <span className="ml-1 text-sm font-normal text-muted-foreground">mmHg</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatOpsDateTime(latestVitals.recordedAt)}
                  {latestVitals.recordedBy ? ` · ${latestVitals.recordedBy.displayName}` : ''}
                </p>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <ChartStatusBadge state={latestVitals.encounterStatus} />
                  {latestVitals.locked ? <ChartLockedBadge /> : null}
                </div>
              </div>
            ) : (
              <NotRecorded>No vitals recorded yet.</NotRecorded>
            )}
          </SummaryCard>
        ) : null}

        {summary?.diabetes ? (
          <SummaryCard
            icon={Activity}
            title="Latest diabetes screening"
            action={
              <SectionLink
                clinicId={clinicId}
                patientId={patientId}
                section="diabetes"
                onNavigate={onNavigate}
              >
                View
              </SectionLink>
            }
          >
            {latestDiabetes ? (
              <div className="space-y-1">
                <p className="text-sm">
                  {latestDiabetes.glucoseMgDl !== null
                    ? `Glucose ${latestDiabetes.glucoseMgDl} mg/dL`
                    : 'Glucose not recorded'}
                  {latestDiabetes.hba1cPercent !== null
                    ? ` · HbA1c ${latestDiabetes.hba1cPercent}%`
                    : ''}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatOpsDateTime(latestDiabetes.collectedAt)}
                  {latestDiabetes.recordedBy ? ` · ${latestDiabetes.recordedBy.displayName}` : ''}
                </p>
              </div>
            ) : (
              <NotRecorded>No screening recorded yet.</NotRecorded>
            )}
          </SummaryCard>
        ) : null}

        {allergies ? (
          <SummaryCard
            icon={AlertTriangle}
            title="Allergies"
            action={
              <SectionLink
                clinicId={clinicId}
                patientId={patientId}
                section="medical-history"
                onNavigate={onNavigate}
              >
                View
              </SectionLink>
            }
          >
            {allergies.state === 'ACTIVE_ALLERGIES' ? (
              <ul className="space-y-1">
                {allergies.activeAllergies.map((allergy) => (
                  <li key={allergy.recordId} className="text-sm">
                    <span className="font-medium">{allergy.substance ?? 'Unnamed substance'}</span>
                    {allergy.severity ? (
                      <span className="text-muted-foreground"> · {allergy.severity}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : allergies.state === 'NO_KNOWN_ALLERGIES' ? (
              <p>No known allergies recorded.</p>
            ) : allergies.state === 'HISTORICAL_ONLY' ? (
              <NotRecorded>Historical allergies only.</NotRecorded>
            ) : (
              <NotRecorded>Allergy status not recorded.</NotRecorded>
            )}
          </SummaryCard>
        ) : null}

        {medications ? (
          <SummaryCard
            icon={Pill}
            title="Current medications"
            action={
              <SectionLink
                clinicId={clinicId}
                patientId={patientId}
                section="medications"
                onNavigate={onNavigate}
              >
                View
              </SectionLink>
            }
          >
            {medications.currentCount > 0 ? (
              <p>
                <span className="text-2xl font-semibold">{medications.currentCount}</span>{' '}
                <span className="text-muted-foreground">
                  {medications.currentCount === 1 ? 'active medication' : 'active medications'}
                </span>
              </p>
            ) : medications.noKnownCurrentMedications ? (
              <p>No known current medications.</p>
            ) : (
              <NotRecorded>Medications not reconciled yet.</NotRecorded>
            )}
            {medications.lastReconciledAt ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Last reconciled {formatOpsDateTime(medications.lastReconciledAt)}
              </p>
            ) : null}
          </SummaryCard>
        ) : null}

        {summary?.visits ? (
          <SummaryCard
            icon={ShieldCheck}
            title="Visits"
            action={
              <SectionLink
                clinicId={clinicId}
                patientId={patientId}
                section="visits"
                onNavigate={onNavigate}
              >
                View
              </SectionLink>
            }
          >
            <p>
              <span className="text-2xl font-semibold">{summary.visits.total}</span>{' '}
              <span className="text-muted-foreground">
                {summary.visits.total === 1 ? 'recorded visit' : 'recorded visits'}
              </span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {summary.visits.lastVisitAt
                ? `Most recent ${formatOpsDateTime(summary.visits.lastVisitAt)}`
                : 'No visits recorded yet.'}
              {summary.visits.open > 0 ? ` · ${summary.visits.open} still open` : ''}
            </p>
          </SummaryCard>
        ) : null}
      </section>

      {summary && summary.sections.length === 0 ? (
        <EmptyStateCard
          title="No chart sections available"
          description="Your role does not include access to any clinical section of this chart."
        />
      ) : null}

      {children}
    </div>
  );
}

export function ChartRetryButton({ onRetry }: { onRetry: () => void }) {
  return (
    <Button type="button" variant="outline" onClick={onRetry} className="cursor-pointer">
      Try again
    </Button>
  );
}
