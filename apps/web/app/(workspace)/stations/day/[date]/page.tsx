'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Check, Copy, Download } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useBootstrap } from '@/lib/bootstrap-context';
import { getActiveBootstrapClinic, getBootstrapActiveClinicId } from '@/lib/bootstrap-clinics';
import { isWebFeatureEnabled } from '@/lib/feature-flags';
import { formatOpsDate } from '@/lib/ops';
import { downloadCsv } from '@/lib/csv';
import { useCopyToClipboard } from '@/lib/use-copy-to-clipboard';
import { fetchClinicDaySummary, formatMinutes, type ClinicDaySummary } from '@/lib/stations';
import {
  busiestHour,
  daySummaryCsvRows,
  daySummaryRows,
  daySummaryText,
  type DaySummarySection,
} from '@/lib/day-summary';
import { RouteGuard } from '@/components/RouteGuard';
import { AppPageHeader } from '@/components/app-shell/AppPageHeader';
import { AppMetricCard, AppMetricGroup } from '@/components/app-shell/AppMetricCard';
import { InlineNotice } from '@/components/ops/OpsShared';
import { InlineErrorState, SectionSkeleton } from '@/components/feedback/AppState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  RecordSection,
  RecordSectionContent,
  RecordSectionHeader,
  RecordSectionTitle,
} from '@/components/patients/RecordSection';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A section's figures as a two-column list; the same rows the copy and CSV use. */
function Figures({
  rows,
  links = {},
}: {
  rows: Array<{ label: string; value: string }>;
  links?: Record<string, string>;
}) {
  return (
    <dl className="divide-y divide-border">
      {rows.map((row) => (
        <div key={row.label} className="flex items-baseline justify-between gap-4 py-2.5">
          <dt className="min-w-0 text-sm text-muted-foreground">
            {links[row.label] && row.value !== '0' ? (
              <Link
                href={links[row.label]}
                className="text-primary underline underline-offset-[3px] hover:text-foreground"
              >
                {row.label}
              </Link>
            ) : (
              row.label
            )}
          </dt>
          <dd className="shrink-0 font-medium tabular-nums text-foreground">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function DaySummary({ date }: { date: string }) {
  const router = useRouter();
  const closed = Number(useSearchParams().get('closed') ?? NaN);
  const getToken = useAuth();
  const bootstrap = useBootstrap()?.bootstrap ?? null;
  const clinicId = getBootstrapActiveClinicId(bootstrap);
  const clinicName = getActiveBootstrapClinic(bootstrap)?.clinicName ?? 'Clinic';
  const [summary, setSummary] = useState<ClinicDaySummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const { state: copyState, copy } = useCopyToClipboard();

  useEffect(() => {
    if (!clinicId || !getToken) return;
    const controller = new AbortController();
    setError(null);
    setSummary(null);
    fetchClinicDaySummary(clinicId, date, getToken, controller.signal)
      .then(setSummary)
      .catch((failure: unknown) => {
        if (!controller.signal.aborted) {
          setError(failure instanceof Error ? failure.message : String(failure));
        }
      });
    return () => controller.abort();
  }, [clinicId, date, getToken, attempt]);

  const rows = summary ? daySummaryRows(summary) : [];
  const section = (name: DaySummarySection) => rows.filter((row) => row.section === name);
  const queue = (tab: string) => `/queues?tab=${tab}&createdFrom=${date}&createdTo=${date}`;

  return (
    <div className="space-y-6">
      <AppPageHeader
        title="Clinic day summary"
        description={`${formatOpsDate(date, summary?.metrics.timezone)}. Counts only; practice (demo) patients are left out.`}
        actions={
          <div className="flex w-full flex-wrap items-end gap-2 compact:w-auto compact:gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={!summary}
              onClick={() => summary && void copy(daySummaryText(summary, clinicName))}
            >
              {copyState === 'copied' ? (
                <Check className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Copy className="h-4 w-4" aria-hidden="true" />
              )}
              {copyState === 'copied' ? 'Copied' : 'Copy summary'}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!summary}
              onClick={() =>
                summary && downloadCsv(`clinic-day-${date}.csv`, daySummaryCsvRows(summary))
              }
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              Download CSV
            </Button>
            <Input
              type="date"
              aria-label="Clinic day"
              value={date}
              onChange={(event) =>
                ISO_DATE.test(event.target.value) &&
                router.replace(`/stations/day/${event.target.value}`)
              }
              className="w-[180px]"
            />
          </div>
        }
      />
      {Number.isInteger(closed) && closed >= 0 ? (
        <InlineNotice tone="success">
          Clinic day closed. {closed} {closed === 1 ? 'patient was' : 'patients were'} closed out;
          their records stay open for review.
        </InlineNotice>
      ) : null}
      <span role="status" aria-live="polite" className="sr-only">
        {copyState === 'copied'
          ? 'Summary copied.'
          : copyState === 'failed'
            ? 'Could not copy.'
            : ''}
      </span>

      {error ? (
        <InlineErrorState
          title="The day summary could not be loaded"
          description={error}
          onRetry={() => setAttempt((value) => value + 1)}
        />
      ) : !summary ? (
        <SectionSkeleton lines={6} />
      ) : (
        <>
          <AppMetricGroup>
            <AppMetricCard title="Checked in" value={summary.metrics.checkIns.total} />
            <AppMetricCard title="Finished review" value={summary.metrics.checkIns.completed} />
            <AppMetricCard
              title="Referrals"
              value={
                summary.clinical.referrals.urgent +
                summary.clinical.referrals.soon +
                summary.clinical.referrals.routine +
                summary.clinical.referrals.unspecified
              }
            />
            <AppMetricCard
              title="Median time in clinic"
              value={formatMinutes(summary.metrics.timeInClinic.medianMinutes)}
              detail={busiestHour(summary) ? `Busiest hour ${busiestHour(summary)}` : undefined}
            />
          </AppMetricGroup>

          <div className="grid gap-6 lg:grid-cols-2">
            <RecordSection aria-labelledby="day-patients">
              <RecordSectionHeader>
                <RecordSectionTitle id="day-patients">Patients</RecordSectionTitle>
              </RecordSectionHeader>
              <RecordSectionContent>
                <Figures rows={section('Patients')} />
              </RecordSectionContent>
            </RecordSection>

            <RecordSection aria-labelledby="day-clinical">
              <RecordSectionHeader>
                <RecordSectionTitle id="day-clinical">Clinical</RecordSectionTitle>
              </RecordSectionHeader>
              <RecordSectionContent>
                <Figures rows={section('Clinical')} />
              </RecordSectionContent>
            </RecordSection>

            <RecordSection aria-labelledby="day-open-work">
              <RecordSectionHeader>
                <RecordSectionTitle id="day-open-work">Open work</RecordSectionTitle>
              </RecordSectionHeader>
              <RecordSectionContent>
                <Figures
                  rows={section('Open work')}
                  links={{
                    'Draft encounters': queue('drafts'),
                    'Encounters in review': queue('review'),
                    'Notes waiting for cosign': queue('cosign'),
                  }}
                />
              </RecordSectionContent>
            </RecordSection>

            <RecordSection aria-labelledby="day-staff">
              <RecordSectionHeader>
                <RecordSectionTitle id="day-staff">Staff</RecordSectionTitle>
              </RecordSectionHeader>
              <RecordSectionContent>
                <Figures rows={section('Staff')} />
              </RecordSectionContent>
            </RecordSection>
          </div>

          <RecordSection aria-labelledby="day-line">
            <RecordSectionHeader>
              <RecordSectionTitle id="day-line">Line</RecordSectionTitle>
            </RecordSectionHeader>
            <RecordSectionContent>
              <Figures rows={section('Line').filter((row) => !row.label.includes(': '))} />
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <caption className="sr-only">Each station on the day</caption>
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th scope="col" className="py-2 pr-4 font-medium">
                        Station
                      </th>
                      <th scope="col" className="py-2 pr-4 text-right font-medium">
                        Wait, median / 90th
                      </th>
                      <th scope="col" className="py-2 pr-4 text-right font-medium">
                        Taken
                      </th>
                      <th scope="col" className="py-2 pr-4 text-right font-medium">
                        Handed on empty
                      </th>
                      <th scope="col" className="py-2 text-right font-medium">
                        Longest with one patient
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border tabular-nums">
                    {summary.metrics.stations.map((station) => (
                      <tr key={station.stationId}>
                        <th
                          scope="row"
                          className="py-2.5 pr-4 text-left font-normal text-foreground"
                        >
                          {station.name}
                        </th>
                        <td className="py-2.5 pr-4 text-right">
                          {formatMinutes(station.wait.medianMinutes)} /{' '}
                          {formatMinutes(station.wait.p90Minutes)}
                        </td>
                        <td className="py-2.5 pr-4 text-right">{station.seen}</td>
                        <td className="py-2.5 pr-4 text-right">{station.heldEmpty}</td>
                        <td className="py-2.5 text-right">
                          {formatMinutes(station.longestHeldMinutes)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </RecordSectionContent>
          </RecordSection>

          {summary.demoCheckIns > 0 ? (
            <p className="text-sm text-muted-foreground">
              Not counted above: {summary.demoCheckIns} practice (demo){' '}
              {summary.demoCheckIns === 1 ? 'check-in' : 'check-ins'}.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

export default function ClinicDaySummaryPage() {
  const params = useParams<{ date: string }>();
  const date = typeof params?.date === 'string' && ISO_DATE.test(params.date) ? params.date : null;

  if (!isWebFeatureEnabled('stationWorkflow')) {
    return (
      <div className="space-y-6">
        <AppPageHeader title="Clinic day summary" />
        <InlineNotice tone="info" live={false}>
          The station line is not turned on for this deployment.
        </InlineNotice>
      </div>
    );
  }

  return (
    <RouteGuard
      requiredPermission="OPS.STATION.MANAGE"
      requiresClinic
      clinicSurface="Clinic day summary"
    >
      {date ? (
        <DaySummary date={date} />
      ) : (
        <div className="space-y-6">
          <AppPageHeader title="Clinic day summary" />
          <InlineNotice tone="info" live={false}>
            That is not a clinic day. Open the summary from the Today board.
          </InlineNotice>
        </div>
      )}
    </RouteGuard>
  );
}
