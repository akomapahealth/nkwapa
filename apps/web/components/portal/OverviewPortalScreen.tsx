'use client';

import { formatGlucose, formatWeight } from '@nkwapa/db/measurement-units';

import { statusLabel } from '@/lib/status-presentation';
import Link from 'next/link';
import {
  BellRing,
  CalendarDays,
  ChevronRight,
  HeartPulse,
  LineChart,
  Scale,
  Syringe,
} from 'lucide-react';
import { useBootstrap, useClinicUnits } from '@/lib/bootstrap-context';
import {
  fetchAppointmentRequests,
  fetchMeasurements,
  fetchPortalMe,
  formatPortalDate,
  formatPortalDateTime,
  getPortalClinicId,
  getPortalClinicName,
  type AppointmentRequestRecord,
  type MeasurementRecord,
  type PortalMeResponse,
} from '@/lib/patient-portal';
import { getNextConfirmedAppointment } from '@/lib/appointment-status';
import { readTrendNumber } from '@/lib/patient-trends';
import { AppMetricCard, AppMetricGroup } from '@/components/app-shell/AppMetricCard';
import { AppointmentStatusBadge } from '@/components/appointments/AppointmentStatusBadge';
import { EmptyState, SectionSkeleton } from '@/components/feedback/AppState';
import { ResourceState } from '@/components/feedback/ResourceState';
import {
  PORTAL_HERO_GRID,
  PortalFact,
  PortalHero,
  PortalPanel,
} from '@/components/portal/PortalPanels';
import { PortalLinkRequiredState } from '@/components/portal/PortalLinkRequiredState';
import { PORTAL_NO_SAVED_COPY, PORTAL_OFFLINE_DETAIL } from '@/components/portal/PortalWriteGate';
import { usePortalResource } from '@/components/portal/use-portal-resource';
import { minimiseAppointmentRequests, minimisePortalMe } from '@/lib/portal-cache';
import { RouteGuard } from '@/components/RouteGuard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface OverviewData {
  me: PortalMeResponse;
  measurements: MeasurementRecord[];
  requests: AppointmentRequestRecord[];
}

function getLatestMeasurement(measurements: MeasurementRecord[], type: MeasurementRecord['type']) {
  return measurements.find((measurement) => measurement.type === type) ?? null;
}

/** Visits the clinic confirmed from one of this patient's requests. */
function getConfirmedVisits(requests: AppointmentRequestRecord[]) {
  return requests.flatMap((request) => (request.appointment ? [request.appointment] : []));
}

function getPendingRequestCount(requests: AppointmentRequestRecord[]) {
  return requests.filter(
    (request) => request.status === 'REQUESTED' || request.status === 'TRIAGED',
  ).length;
}

const QUICK_ACTIONS = [
  {
    href: '/portal/self-reports/new?type=bp',
    title: 'Log a reading',
    hint: 'Blood pressure, glucose or weight from home.',
    icon: HeartPulse,
  },
  {
    href: '/portal/appointments/request',
    title: 'Request an appointment',
    hint: 'Pick the days that suit you; the clinic confirms a time.',
    icon: CalendarDays,
  },
  {
    href: '/portal/health',
    title: 'Review my trends',
    hint: 'See how your readings have changed.',
    icon: LineChart,
  },
] as const;

/** The waiting-request count, said in words at the end of the description. */
function describeAppointments(hasNext: boolean, pending: number) {
  const lead = hasNext
    ? 'Your next confirmed visit with the clinic.'
    : 'Request an appointment and your clinic will confirm the exact time.';
  if (pending === 0) return lead;
  return `${lead} ${pending} ${pending === 1 ? 'request is' : 'requests are'} waiting for the clinic.`;
}

export function OverviewPortalScreen() {
  const bootstrap = useBootstrap()?.bootstrap ?? null;
  const clinicId = getPortalClinicId(bootstrap);
  const units = useClinicUnits(clinicId);
  const clinicName = getPortalClinicName(bootstrap, clinicId);

  const overview = usePortalResource<OverviewData>({
    resourceKey: clinicId ?? 'no-clinic',
    enabled: Boolean(clinicId),
    errorMessage: 'Your overview could not be loaded.',
    fetcher: async (getToken) => {
      const from = new Date();
      from.setDate(from.getDate() - 90);
      const [me, measurements, requests] = await Promise.all([
        fetchPortalMe(clinicId!, getToken),
        fetchMeasurements(clinicId!, getToken, { from: from.toISOString() }),
        fetchAppointmentRequests(clinicId!, getToken),
      ]);
      return { me, measurements, requests };
    },
    cache: {
      view: 'overview',
      patientIdOf: (data) => data.me.patient.id,
      minimise: (data) => ({
        ...data,
        me: minimisePortalMe(data.me),
        requests: minimiseAppointmentRequests(data.requests),
      }),
    },
  });

  if (overview.isLinkMissing && !overview.isInitialLoading) {
    return (
      <RouteGuard requiredPermission="PATIENT.PORTAL.READ_SELF">
        <div className="space-y-6">
          <PortalLinkRequiredState clinicName={clinicName} />
        </div>
      </RouteGuard>
    );
  }

  return (
    <RouteGuard requiredPermission="PATIENT.PORTAL.READ_SELF">
      <div className="space-y-6">
        <section className={PORTAL_HERO_GRID}>
          <PortalHero
            clinicName={clinicName}
            title="Your care snapshot"
            description="See your recent readings, advice from your care team, and appointments."
          />

          <PortalPanel title="What would you like to do?">
            <ul className="divide-y divide-rule border-y border-rule">
              {QUICK_ACTIONS.map(({ href, title, hint, icon: Icon }) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="group flex min-h-16 items-center gap-3 py-3 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [@media(hover:hover)]:hover:bg-muted/50"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-primary/10 text-primary">
                      <Icon aria-hidden="true" className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-foreground">{title}</span>
                      <span className="block text-sm leading-5 text-muted-foreground">{hint}</span>
                    </span>
                    <ChevronRight
                      aria-hidden="true"
                      className="h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-150 ease-out motion-reduce:transition-none [@media(hover:hover)]:group-hover:translate-x-0.5"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </PortalPanel>
        </section>

        <ResourceState
          state={overview}
          skeleton={<SectionSkeleton lines={3} className="p-6" />}
          offlineDescription={PORTAL_NO_SAVED_COPY}
          offlineDetail={PORTAL_OFFLINE_DETAIL}
          errorTitle="Your overview could not be loaded"
        >
          {({ me, measurements, requests }) => {
            const latestBp = getLatestMeasurement(measurements, 'BP');
            const latestGlucose = getLatestMeasurement(measurements, 'GLUCOSE');
            const latestWeight = getLatestMeasurement(measurements, 'WEIGHT');
            const nextAppointment = getNextConfirmedAppointment(getConfirmedVisits(requests));
            const pendingRequests = getPendingRequestCount(requests);

            return (
              <div className="space-y-6">
                <p className="text-sm text-muted-foreground">
                  {me.patient.firstName} {me.patient.lastName}
                  <span aria-hidden="true"> · </span>
                  <span className="sr-only">, </span>
                  Patient code{' '}
                  <span className="font-mono tabular-nums text-foreground">
                    {me.patient.patientCode}
                  </span>
                </p>

                <PortalPanel
                  title="Next appointment"
                  description={describeAppointments(Boolean(nextAppointment), pendingRequests)}
                  contentClassName="space-y-4"
                >
                  {nextAppointment ? (
                    <div className="border-l-2 border-primary py-1 pl-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-lg font-semibold tabular-nums text-foreground">
                            {formatPortalDateTime(nextAppointment.startsAt)}
                          </p>
                          <p className="text-sm tabular-nums text-muted-foreground">
                            Ends {formatPortalDateTime(nextAppointment.endsAt)}
                          </p>
                        </div>
                        <AppointmentStatusBadge status={nextAppointment.status} />
                      </div>
                      {nextAppointment.notes && (
                        <p className="mt-3 text-sm leading-6 text-muted-foreground">
                          {nextAppointment.notes}
                        </p>
                      )}
                    </div>
                  ) : (
                    <EmptyState
                      density="compact"
                      icon={CalendarDays}
                      title="No confirmed appointment yet"
                      description="Send a request and your clinic will confirm a time for you."
                    />
                  )}
                  <Button asChild variant="outline" className="w-full sm:w-auto">
                    <Link href="/portal/appointments">See all appointments</Link>
                  </Button>
                </PortalPanel>

                <h2 className="type-section-title text-foreground">Latest readings</h2>
                <AppMetricGroup className="md:grid-cols-3">
                  <AppMetricCard
                    icon={HeartPulse}
                    title="Blood pressure"
                    value={
                      latestBp
                        ? `${readTrendNumber(latestBp.payload.systolic) ?? '—'}/${readTrendNumber(latestBp.payload.diastolic) ?? '—'} mmHg`
                        : 'No reading yet'
                    }
                    detail={
                      latestBp
                        ? `Recorded ${formatPortalDate(latestBp.recordedAt)}`
                        : 'Add your first blood pressure reading.'
                    }
                  />
                  <AppMetricCard
                    icon={Syringe}
                    title="Glucose"
                    value={
                      latestGlucose
                        ? (formatGlucose(
                            readTrendNumber(latestGlucose.payload.value),
                            units.glucoseUnit,
                          ) ?? '—')
                        : 'No reading yet'
                    }
                    detail={
                      latestGlucose
                        ? `Recorded ${formatPortalDate(latestGlucose.recordedAt)}`
                        : 'Add a glucose reading.'
                    }
                  />
                  <AppMetricCard
                    icon={Scale}
                    title="Weight"
                    value={
                      latestWeight
                        ? (formatWeight(readTrendNumber(latestWeight.payload.kg), units.bodyUnit) ??
                          '—')
                        : 'No reading yet'
                    }
                    detail={
                      latestWeight
                        ? `Recorded ${formatPortalDate(latestWeight.recordedAt)}`
                        : 'Add a weight reading.'
                    }
                  />
                </AppMetricGroup>

                <PortalPanel
                  title="From your care team"
                  description={
                    me.recommendations?.followUpDate
                      ? `Advice from your most recent visit. Your next follow-up is ${formatPortalDate(me.recommendations.followUpDate)}.`
                      : 'Advice from your most recent visit.'
                  }
                  contentClassName="grid gap-4 md:grid-cols-2"
                >
                  <PortalFact
                    label="Care plan notes"
                    value={
                      me.recommendations?.carePlanNotes ||
                      'No care plan notes have been published for your latest visit yet.'
                    }
                    valueClassName="font-normal leading-6 text-muted-foreground"
                  />
                  <PortalFact
                    label="Follow-up actions"
                    value={
                      me.recommendations?.counselingGiven ||
                      me.recommendations?.medicationPrescribed ? (
                        <span className="flex flex-wrap gap-2">
                          {me.recommendations?.counselingGiven && (
                            <Badge variant="secondary">Counseling completed</Badge>
                          )}
                          {me.recommendations?.medicationPrescribed && (
                            <Badge variant="secondary">Medication prescribed</Badge>
                          )}
                        </span>
                      ) : (
                        'No care actions were listed.'
                      )
                    }
                    valueClassName="font-normal text-muted-foreground"
                  />
                </PortalPanel>

                <PortalPanel
                  title="Upcoming reminders"
                  description="Scheduled notices from your clinic or care plan."
                >
                  {me.reminders?.length ? (
                    <ul className="divide-y divide-rule">
                      {me.reminders.slice(0, 4).map((reminder) => (
                        <li
                          key={reminder.id}
                          className="flex items-center justify-between gap-3 py-3"
                        >
                          <div>
                            <p className="text-sm font-medium tabular-nums text-foreground">
                              {formatPortalDateTime(reminder.scheduledAt)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {statusLabel(reminder.status)}
                            </p>
                          </div>
                          <Badge variant="outline">{reminder.channel}</Badge>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <EmptyState
                      density="compact"
                      icon={BellRing}
                      title="No reminders scheduled"
                      description="Your clinic will send reminders here when your care plan schedules one."
                    />
                  )}
                </PortalPanel>
              </div>
            );
          }}
        </ResourceState>
      </div>
    </RouteGuard>
  );
}
