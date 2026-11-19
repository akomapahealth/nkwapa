'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  CalendarX,
  ClipboardList,
  Download,
  HeartPulse,
  Pill,
  PhoneCall,
  ShieldCheck,
  Siren,
  UserMinus,
  Users,
} from 'lucide-react';
import { FOLLOW_UP_TIER_LABELS } from '@nkwapa/db/follow-up-stratification';
import { AppMetricCard, AppMetricGroup } from '@/components/app-shell/AppMetricCard';
import { TOOLBAR_SELECT, useWideSheet } from '@/components/app-shell/ListToolbar';
import { ResourceState } from '@/components/feedback/ResourceState';
import { SectionSkeleton } from '@/components/feedback/AppState';
import { DistributionChart, type DistributionTone } from '@/components/dashboard/DistributionChart';
import { TrendChart } from '@/components/dashboard/TrendChart';
import { PatientIdentity } from '@/components/patients/PatientRegistryCard';
import { Button } from '@/components/ui/button';
import { InfoHint } from '@/components/ui/info-hint';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { apiFetch, readApiError } from '@/lib/api';
import { useBootstrap } from '@/lib/bootstrap-context';
import { downloadCsv } from '@/lib/csv';
import { CONTACT_OUTCOME_LABELS } from '@/lib/follow-up-contacts';
import { FOLLOW_UP_READ } from '@/lib/follow-up';
import {
  HEARTS360_DEFINITIONS as DEFINITIONS,
  followUpMetricsCsvRows,
  formatBpLimit,
  formatDuration,
  formatMonth,
  formatShare,
  recentMonths,
  type FollowUpMetricFigure,
  type FollowUpMetricsReport,
  type FollowUpMetricsTier,
  type Share,
} from '@/lib/metrics';
import { hasPermission } from '@/lib/ops';
import { useAsyncResource } from '@/lib/use-async-resource';
import { cn } from '@/lib/utils';

const TIER_ORDER: readonly FollowUpMetricsTier[] = [
  'URGENT',
  'HIGH',
  'MODERATE',
  'LOW_MODERATE',
  'STABLE',
  'LOW',
  'NOT_TIERED',
];
const TIER_TONES: Record<string, DistributionTone> = {
  [FOLLOW_UP_TIER_LABELS.URGENT]: 'destructive',
  [FOLLOW_UP_TIER_LABELS.HIGH]: 'severe',
  [FOLLOW_UP_TIER_LABELS.MODERATE]: 'warning',
};

interface OpenFigure {
  figure: FollowUpMetricFigure;
  title: string;
  count: number;
}

/** One clinic, or every clinic in an organization (system admins, #339). */
export type FollowUpMetricsScope =
  | { kind: 'clinic'; clinicId: string }
  | { kind: 'organization'; organizationId: string };

function endpointFor(scope: FollowUpMetricsScope): string {
  return scope.kind === 'clinic'
    ? `/clinics/${encodeURIComponent(scope.clinicId)}/follow-up-metrics`
    : `/organizations/${encodeURIComponent(scope.organizationId)}/follow-up-metrics`;
}

/**
 * The monthly follow-up indicators (#339), HEARTS360 definitions. Counts and shares for anyone
 * who reads metrics; a figure opens its patients only for a role with PATIENT.READ.
 */
export function FollowUpMetricsSection({
  scope,
  titleAs: Title = 'h2',
}: {
  scope: FollowUpMetricsScope;
  /** `h3` where the section sits under a tab with its own heading level. */
  titleAs?: 'h2' | 'h3';
}) {
  const bootstrap = useBootstrap()?.bootstrap ?? null;
  const permissions = bootstrap?.effectivePermissionsForActiveClinic ?? [];
  const canSeeNames = hasPermission([...permissions], 'PATIENT.READ');
  const canOpenWorklist =
    scope.kind === 'clinic' && hasPermission([...permissions], FOLLOW_UP_READ);
  const months = useMemo(() => recentMonths(new Date()), []);
  // Null until picked: the server names the current month in the clinic's own zone.
  const [picked, setPicked] = useState<string | null>(null);
  const [open, setOpen] = useState<OpenFigure | null>(null);
  const endpoint = endpointFor(scope);
  const activeClinicId = scope.kind === 'clinic' ? scope.clinicId : undefined;

  const state = useAsyncResource<FollowUpMetricsReport>({
    resourceKey: `${endpoint}:${picked ?? 'current'}`,
    enabled: true,
    requiresOnline: true,
    errorMessage: 'Follow-up figures could not be loaded.',
    fetcher: async (getToken, signal) => {
      const response = await apiFetch(picked ? `${endpoint}?month=${picked}` : endpoint, {
        getToken,
        activeClinicId,
        signal,
      });
      if (!response.ok) throw await readApiError(response);
      return (await response.json()) as FollowUpMetricsReport;
    },
  });
  const report = state.status === 'ready' ? state.data : null;
  const month = picked ?? report?.month ?? months[0]!.value;

  return (
    <section aria-labelledby="metrics-follow-up" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <Title id="metrics-follow-up" className="type-section-title">
            Follow-up
          </Title>
          <p className="max-w-prose text-sm text-muted-foreground">
            Hypertension control and contacts for the month, using the HEARTS360 definitions.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={month} onValueChange={setPicked}>
            <SelectTrigger className={cn(TOOLBAR_SELECT, 'w-44')} aria-label="Month">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {months.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            disabled={!report}
            onClick={() =>
              report && downloadCsv(`follow-up-${report.month}.csv`, followUpMetricsCsvRows(report))
            }
          >
            <Download aria-hidden="true" />
            Download CSV
          </Button>
        </div>
      </div>

      <ResourceState
        state={state}
        skeleton={<SectionSkeleton lines={6} />}
        errorTitle="Follow-up figures could not be loaded"
        offlineDescription="Follow-up figures are calculated on the server, so they need a connection."
      >
        {(data) => (
          <FollowUpFigures
            report={data}
            onOpen={canSeeNames ? setOpen : null}
            canOpenWorklist={canOpenWorklist}
            organizationWide={scope.kind === 'organization'}
          />
        )}
      </ResourceState>

      {canSeeNames ? (
        <FigurePatientsSheet
          endpoint={endpoint}
          activeClinicId={activeClinicId}
          month={month}
          open={open}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </section>
  );
}

function FollowUpFigures({
  report,
  onOpen,
  canOpenWorklist,
  organizationWide,
}: {
  report: FollowUpMetricsReport;
  onOpen: ((figure: OpenFigure) => void) | null;
  canOpenWorklist: boolean;
  organizationWide: boolean;
}) {
  const { settings } = report;
  const asOf = new Date(report.asOf);
  const current = report.inProgress;
  const where = organizationWide ? 'in this organization' : 'at this clinic';

  /** A share as a card: percent first, its numerator and denominator always beside it. */
  const shareCard = (
    figure: FollowUpMetricFigure,
    title: string,
    share: Share,
    hint: string,
    extra: Partial<Parameters<typeof AppMetricCard>[0]> = {},
  ) => {
    const { percent, fraction } = formatShare(share);
    return (
      <AppMetricCard
        key={figure}
        title={title}
        value={percent}
        unit={` (${fraction})`}
        hint={hint}
        onActivate={
          onOpen && share.count > 0
            ? () => onOpen({ figure, title, count: share.count })
            : undefined
        }
        actionLabel={`Show the ${share.count} patients: ${title.toLowerCase()}`}
        {...extra}
      />
    );
  };

  const ofRegister = `Out of the ${report.register} patients on the hypertension register.`;
  // Not-yet-tiered patients are usually most of a clinic and would flatten every real tier.
  const tiered = TIER_ORDER.filter((tier) => tier !== 'NOT_TIERED');
  const tierData = Object.fromEntries(
    tiered.map((tier) => [FOLLOW_UP_TIER_LABELS[tier], report.tiers[tier]]),
  );
  const outcomeData = Object.fromEntries(
    Object.entries(report.outcomes).map(([code, count]) => [
      CONTACT_OUTCOME_LABELS[code as keyof typeof CONTACT_OUTCOME_LABELS],
      count,
    ]),
  );

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground">
        {current
          ? `So far this month, as of ${asOf.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone: report.timeZone ?? undefined })}.`
          : `At the end of ${formatMonth(report.month)}.`}{' '}
        Target: below {formatBpLimit(settings.bpTargetUnder65)}
        {formatBpLimit(settings.bpTargetWithDisease) !== formatBpLimit(settings.bpTargetUnder65)
          ? `, or ${formatBpLimit(settings.bpTargetWithDisease)} with diabetes or heart, stroke or kidney disease`
          : ''}
        .{' '}
        {settings.selfReportedCountsTowardControl
          ? 'Readings patients report count toward control.'
          : 'Only readings staff measured count toward control.'}
      </p>

      <AppMetricGroup label="Hypertension control">
        <AppMetricCard
          title="on the hypertension register"
          value={report.register}
          icon={Users}
          hint={`Patients diagnosed with hypertension ${where}; deceased patients excluded. Every percentage in this group is out of this number.`}
          onActivate={
            onOpen && report.register > 0
              ? () =>
                  onOpen({
                    figure: 'register',
                    title: 'On the hypertension register',
                    count: report.register,
                  })
              : undefined
          }
          actionLabel="Show the patients on the hypertension register"
        />
        {shareCard(
          'underCare',
          'Under care',
          report.underCare,
          `${DEFINITIONS.underCare}. ${ofRegister}`,
          {
            icon: HeartPulse,
          },
        )}
        {shareCard(
          'controlled',
          'Controlled',
          report.controlled,
          `${DEFINITIONS.controlled}. ${ofRegister}`,
          {
            icon: ShieldCheck,
            tone: 'success',
          },
        )}
        {shareCard(
          'uncontrolled',
          'Uncontrolled',
          report.uncontrolled,
          `${DEFINITIONS.uncontrolled}. ${ofRegister}`,
          {
            tone: 'attention',
          },
        )}
        {report.notAssessed.count > 0
          ? shareCard(
              'notAssessed',
              'Recent reading, target unknown',
              report.notAssessed,
              `A reading in the past 3 months that cannot be judged: the age is not recorded and the targets differ by age. ${ofRegister}`,
            )
          : null}
        {shareCard(
          'lost3m',
          '3-month lost to follow-up',
          report.lost3m,
          `${DEFINITIONS.lost3m}. ${ofRegister}`,
          {
            icon: CalendarX,
          },
        )}
        {shareCard(
          'lost12m',
          '12-month lost to follow-up',
          report.lost12m,
          `${DEFINITIONS.lost12m}. ${ofRegister}`,
          {
            icon: UserMinus,
          },
        )}
      </AppMetricGroup>

      <AppMetricGroup label="Treatment">
        {shareCard(
          'untreated',
          'Diagnosed, not on medication',
          report.untreated,
          `Patients on the hypertension register with no hypertension medicine recorded. ${ofRegister}`,
          { icon: Pill },
        )}
        <AppMetricCard
          title="started treatment this month"
          value={report.startedTreatment}
          hint="Diagnosed and not on medication at the end of last month, on medication at the end of this one."
          onActivate={
            onOpen && report.startedTreatment > 0
              ? () =>
                  onOpen({
                    figure: 'startedTreatment',
                    title: 'Started treatment this month',
                    count: report.startedTreatment,
                  })
              : undefined
          }
          actionLabel="Show the patients who started treatment this month"
        />
      </AppMetricGroup>

      <div className="grid gap-x-6 gap-y-4 lg:grid-cols-2">
        <ContactsTable report={report} canOpenWorklist={canOpenWorklist} onOpen={onOpen} />
        <UrgentResponse report={report} />
      </div>

      <div className="grid gap-x-6 gap-y-4 lg:grid-cols-2">
        <DistributionChart
          title="Patients by tier"
          hint={`Patients with a follow-up tier ${where}, deceased patients excluded. ${report.tiers.NOT_TIERED} more are not yet tiered: the engine is missing something it needs to place them.`}
          data={tierData}
          order={tiered.map((tier) => FOLLOW_UP_TIER_LABELS[tier])}
          tones={TIER_TONES}
          onSelect={
            onOpen
              ? (label) => {
                  const tier = tiered.find((code) => FOLLOW_UP_TIER_LABELS[code] === label);
                  if (tier) {
                    onOpen({
                      figure: `tier:${tier}`,
                      title: `${label} tier`,
                      count: report.tiers[tier],
                    });
                  }
                }
              : undefined
          }
          selectLabel={(label, count) => `Show the ${count} patients in the ${label} tier`}
          emptyMessage="No patient had a tier at the end of this month."
        />
        <DistributionChart
          title="Contact outcomes"
          hint={`Every attempt recorded this month, one outcome each. "Not reached" is an attempt: ${DEFINITIONS.attempt.toLowerCase()}.`}
          data={outcomeData}
          order={Object.values(CONTACT_OUTCOME_LABELS)}
          layout="horizontal"
          emptyMessage="No contact attempts were recorded this month."
        />
      </div>

      <div className="grid gap-x-6 gap-y-4 lg:grid-cols-3">
        <TrendChart
          title="Controlled, by month"
          hint={`${DEFINITIONS.controlled}. Counted at each month's end.`}
          period="month"
          data={report.trend.map((point) => ({
            date: `${point.month}-01`,
            count: point.controlled,
          }))}
          emptyMessage="No controlled patients in these six months."
        />
        <TrendChart
          title="Under care, by month"
          hint={`${DEFINITIONS.underCare}. Counted at each month's end.`}
          period="month"
          data={report.trend.map((point) => ({
            date: `${point.month}-01`,
            count: point.underCare,
          }))}
          emptyMessage="No patients under care in these six months."
        />
        <TrendChart
          title="Missed visits, by month"
          hint={`${DEFINITIONS.missed}. The grace period is ${settings.missedContactGraceDays} days.`}
          period="month"
          color="hsl(var(--chart-3))"
          data={report.trend.map((point) => ({ date: `${point.month}-01`, count: point.missed }))}
          emptyMessage="No contacts were missed in these six months."
        />
      </div>
    </div>
  );
}

/** Contacts by mode. A table: twelve numbers that are read across and down, not estimated. */
function ContactsTable({
  report,
  canOpenWorklist,
  onOpen,
}: {
  report: FollowUpMetricsReport;
  canOpenWorklist: boolean;
  onOpen: ((figure: OpenFigure) => void) | null;
}) {
  const { contacts } = report;
  const rows = [
    {
      key: 'due',
      label: 'Due',
      title: 'Contacts due this month',
      hint: 'Contacts due this month, cancelled ones left out.',
    },
    {
      key: 'completed',
      label: 'Completed',
      title: 'Completed follow-ups this month',
      hint: DEFINITIONS.completed,
    },
    {
      key: 'missed',
      label: 'Missed',
      title: 'Missed visits this month',
      hint: `${DEFINITIONS.missed}. The grace period is ${report.settings.missedContactGraceDays} days; counted in the month it was missed.`,
    },
    {
      key: 'attempts',
      label: 'Attempts',
      title: 'Attempts this month',
      hint: `${DEFINITIONS.attempt}. Never counted as completed.`,
    },
  ] as const;
  const perCompleted = contacts.attemptsPerCompleted;
  return (
    <section
      className="min-w-0 border-t-2 border-rule-strong pt-3"
      aria-labelledby="follow-up-contacts"
    >
      <div className="flex items-start justify-between gap-3 pt-2.5">
        <h3 id="follow-up-contacts" className="type-label text-foreground">
          Contacts this month
        </h3>
        {canOpenWorklist ? (
          <Link
            href="/follow-up?tab=overdue"
            className="inline-flex min-h-9 items-center gap-1.5 rounded-md text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:min-h-11"
          >
            <ClipboardList aria-hidden="true" className="size-4" />
            Open overdue contacts
          </Link>
        ) : null}
      </div>
      <div
        role="region"
        aria-labelledby="follow-up-contacts"
        tabIndex={0}
        className="scroll-region mt-2 overflow-x-auto"
      >
        <table aria-labelledby="follow-up-contacts" className="w-full min-w-[20rem] text-sm">
          <thead>
            <tr className="border-b border-rule text-left text-xs text-muted-foreground">
              <th scope="col" className="py-2 pr-3 font-medium">
                Contacts
              </th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">
                In person
              </th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">
                Tele
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-b border-rule last:border-0">
                <th scope="row" className="py-2 pr-3 text-left font-normal">
                  <span className="inline-flex items-center gap-1">
                    {row.label}
                    <InfoHint label={row.hint} size="sm" />
                  </span>
                </th>
                <td className="py-2 pr-3 text-right tabular-nums">{contacts[row.key].inPerson}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{contacts[row.key].tele}</td>
                <td className="py-2 text-right font-semibold tabular-nums">
                  {onOpen && contacts[row.key].total > 0 ? (
                    // A contact count opens its patients, each once however many contacts they had.
                    <button
                      type="button"
                      onClick={() =>
                        onOpen({
                          figure: `contacts:${row.key}`,
                          title: row.title,
                          count: contacts[row.key].total,
                        })
                      }
                      aria-label={`Show the patients behind ${row.title.toLowerCase()}`}
                      className="-mr-1 inline-flex min-h-9 min-w-9 items-center justify-end rounded px-1 text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:min-h-11"
                    >
                      {contacts[row.key].total}
                    </button>
                  ) : (
                    contacts[row.key].total
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {perCompleted.of > 0
          ? `${(perCompleted.count / perCompleted.of).toFixed(1)} attempts per completed follow-up (${perCompleted.count} attempts, ${perCompleted.of} completed).`
          : `${perCompleted.count} attempts, and no completed follow-ups to divide by.`}
      </p>
    </section>
  );
}

function UrgentResponse({ report }: { report: FollowUpMetricsReport }) {
  const { acknowledged, confirmationCall, flags } = report.urgent;
  const timingCard = (
    title: string,
    timing: typeof acknowledged,
    icon: typeof Siren,
    what: string,
  ) => {
    const { percent, fraction } = formatShare({ count: timing.withinLimit, of: timing.judged });
    return (
      <AppMetricCard
        title={`${title} within ${formatDuration(timing.limitMinutes)}`}
        value={percent}
        unit={` (${fraction})`}
        icon={icon}
        hint={`${what} Median ${formatDuration(timing.medianMinutes)}. Flags still inside the limit are not counted yet.`}
      />
    );
  };
  return (
    <section
      className="min-w-0 border-t-2 border-rule-strong pt-3"
      aria-labelledby="follow-up-urgent"
    >
      <h3 id="follow-up-urgent" className="type-label pt-2.5 text-foreground">
        Urgent response
      </h3>
      <p className="text-xs text-muted-foreground">
        {flags === 1 ? '1 Urgent flag' : `${flags} Urgent flags`} raised this month.
      </p>
      <AppMetricGroup label="Urgent response" className="mt-2">
        {timingCard(
          'Taken',
          acknowledged,
          Siren,
          'Time from an Urgent flag to someone pressing "I\'m on it".',
        )}
        {timingCard(
          'Confirmation call',
          confirmationCall,
          PhoneCall,
          'Time from an Urgent flag to the first call that reached the patient on the 48-hour confirmation contact.',
        )}
      </AppMetricGroup>
    </section>
  );
}

/** The patients behind one figure. Only mounted for roles with PATIENT.READ. */
function FigurePatientsSheet({
  endpoint,
  activeClinicId,
  month,
  open,
  onClose,
}: {
  endpoint: string;
  activeClinicId: string | undefined;
  month: string;
  open: OpenFigure | null;
  onClose: () => void;
}) {
  const wide = useWideSheet();
  return (
    <Sheet open={open !== null} onOpenChange={(next) => (next ? undefined : onClose())}>
      <SheetContent
        side={wide ? 'right' : 'bottom'}
        className={cn(
          'flex flex-col bg-card p-0 pb-[env(safe-area-inset-bottom)]',
          wide ? 'w-full sm:max-w-md' : 'max-h-[92dvh] rounded-t-xl',
        )}
      >
        {open ? (
          <FigurePatients
            key={`${open.figure}:${month}`}
            endpoint={endpoint}
            activeClinicId={activeClinicId}
            month={month}
            open={open}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function FigurePatients({
  endpoint,
  activeClinicId,
  month,
  open,
}: {
  endpoint: string;
  activeClinicId: string | undefined;
  month: string;
  open: OpenFigure;
}) {
  const state = useAsyncResource<{
    total: number;
    patients: Array<{ id: string; clinicId: string; patientCode: string; name: string }>;
  }>({
    resourceKey: `${endpoint}:${month}:${open.figure}`,
    enabled: true,
    requiresOnline: true,
    errorMessage: 'The patients could not be loaded.',
    fetcher: async (getToken, signal) => {
      const params = new URLSearchParams({ month, figure: open.figure });
      const response = await apiFetch(`${endpoint}/patients?${params}`, {
        getToken,
        activeClinicId,
        signal,
      });
      if (!response.ok) throw await readApiError(response);
      return response.json();
    },
  });
  return (
    <>
      <SheetHeader className="shrink-0 border-b border-border px-5 pb-4 text-left">
        <SheetTitle className="pr-12 font-body">{open.title}</SheetTitle>
        <SheetDescription>
          {open.count === 1 ? '1 patient' : `${open.count} patients`}, {formatMonth(month)}.
        </SheetDescription>
      </SheetHeader>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
        <ResourceState
          state={state}
          skeleton={<SectionSkeleton lines={6} />}
          errorTitle="The patients could not be loaded"
          offlineDescription="This list is worked out on the server, so it needs a connection."
        >
          {(data) => (
            <>
              <ul className="divide-y divide-rule">
                {data.patients.map((patient) => (
                  <li key={patient.id}>
                    <Link
                      href={`/clinics/${patient.clinicId}/patients/${patient.id}`}
                      className="-mx-2 flex min-h-11 items-center rounded-md px-2 py-2 transition-colors duration-fast hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <PatientIdentity name={patient.name} code={patient.patientCode} />
                    </Link>
                  </li>
                ))}
              </ul>
              {data.total > data.patients.length ? (
                <p className="pt-3 text-xs text-muted-foreground">
                  Showing {data.patients.length} of {data.total}. Download the CSV for the counts.
                </p>
              ) : null}
            </>
          )}
        </ResourceState>
      </div>
    </>
  );
}
