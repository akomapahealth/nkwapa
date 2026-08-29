'use client';

import Link from 'next/link';
import {
  BellRing,
  CalendarDays,
  ChevronRight,
  ClipboardList,
  HeartPulse,
  Scale,
  Syringe,
} from 'lucide-react';
import { useBootstrap } from '@/lib/bootstrap-context';
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
import { AppMetricCard } from '@/components/app-shell/AppMetricCard';
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
import { usePortalResource } from '@/components/portal/use-portal-resource';
import { RouteGuard } from '@/components/RouteGuard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface OverviewData {
  me: PortalMeResponse;
  measurements: MeasurementRecord[];
  requests: AppointmentRequestRecord[];
}

function readNumber(value: unknown) {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function getLatestMeasurement(measurements: MeasurementRecord[], type: MeasurementRecord['type']) {
  return measurements.find((measurement) => measurement.type === type) ?? null;
}

function getNextConfirmedAppointment(requests: AppointmentRequestRecord[]) {
  const now = Date.now();
  return (
    requests
      .filter((request) => request.appointment?.status === 'CONFIRMED')
      .map((request) => request.appointment)
      .filter((appointment): appointment is NonNullable<AppointmentRequestRecord['appointment']> =>
        Boolean(appointment),
      )
      .filter((appointment) => new Date(appointment.startsAt).getTime() >= now)
      .sort(
        (left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime(),
      )[0] ?? null
  );
}

function getPendingRequestCount(requests: AppointmentRequestRecord[]) {
  return requests.filter(
    (request) => request.status === 'REQUESTED' || request.status === 'TRIAGED',
  ).length;
}

export function OverviewPortalScreen() {
  const bootstrap = useBootstrap()?.bootstrap ?? null;
  const clinicId = getPortalClinicId(bootstrap);
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
            eyebrow="Personal overview"
            clinicName={clinicName}
            title="Your care snapshot"
            description="See the latest guidance from your care team, recent measurements, and appointment progress without leaving your dashboard."
          />

          <PortalPanel
            title="Quick actions"
            description="Move quickly between the most common portal tasks."
            contentClassName="space-y-3"
          >
            <Button asChild className="w-full justify-between">
              <Link href="/portal/self-reports/new?type=bp">
                Log a reading
                <ChevronRight aria-hidden="true" className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" className="w-full justify-between">
              <Link href="/portal/appointments/request">
                Request an appointment
                <ChevronRight aria-hidden="true" className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" className="w-full justify-between">
              <Link href="/portal/health">
                Review my trends
                <ChevronRight aria-hidden="true" className="h-4 w-4" />
              </Link>
            </Button>
          </PortalPanel>
        </section>

        <ResourceState
          state={overview}
          skeleton={<SectionSkeleton lines={3} className="p-6" />}
          errorTitle="Your overview could not be loaded"
        >
          {({ me, measurements, requests }) => {
            const latestBp = getLatestMeasurement(measurements, 'BP');
            const latestGlucose = getLatestMeasurement(measurements, 'GLUCOSE');
            const latestWeight = getLatestMeasurement(measurements, 'WEIGHT');
            const nextAppointment = getNextConfirmedAppointment(requests);
            const pendingRequests = getPendingRequestCount(requests);

            return (
              <div className="space-y-6">
                <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <PortalFact
                    label="Your record"
                    value={`${me.patient.firstName} ${me.patient.lastName}`}
                  />
                  <PortalFact
                    label="Patient code"
                    value={me.patient.patientCode}
                    valueClassName="font-mono"
                  />
                  <PortalFact
                    label="Next follow-up"
                    value={formatPortalDate(me.recommendations?.followUpDate)}
                  />
                  <PortalFact
                    label="Pending requests"
                    value={`${pendingRequests} ${pendingRequests === 1 ? 'request' : 'requests'}`}
                  />
                </section>

                <section className="grid gap-4 md:grid-cols-3">
                  <AppMetricCard
                    icon={HeartPulse}
                    title="Latest blood pressure"
                    value={
                      latestBp
                        ? `${readNumber(latestBp.payload.systolic) ?? '—'}/${readNumber(latestBp.payload.diastolic) ?? '—'} mmHg`
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
                    title="Latest glucose"
                    value={
                      latestGlucose
                        ? `${readNumber(latestGlucose.payload.value) ?? '—'} mg/dL`
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
                    title="Latest weight"
                    value={
                      latestWeight
                        ? `${readNumber(latestWeight.payload.kg) ?? '—'} kg`
                        : 'No reading yet'
                    }
                    detail={
                      latestWeight
                        ? `Recorded ${formatPortalDate(latestWeight.recordedAt)}`
                        : 'Add a weight reading.'
                    }
                  />
                </section>

                <section className={PORTAL_HERO_GRID}>
                  <PortalPanel
                    title="Appointment status"
                    description={
                      nextAppointment
                        ? `Your next confirmed appointment is ${formatPortalDateTime(nextAppointment.startsAt)}.`
                        : 'Request a visit and your clinic will confirm the exact time.'
                    }
                    action={<CalendarDays aria-hidden="true" className="h-5 w-5 text-primary" />}
                    contentClassName="space-y-4"
                  >
                    {nextAppointment ? (
                      <div className="rounded-lg border border-border bg-background p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="font-medium tabular-nums text-foreground">
                              {formatPortalDateTime(nextAppointment.startsAt)}
                            </p>
                            <p className="text-sm tabular-nums text-muted-foreground">
                              Ends {formatPortalDateTime(nextAppointment.endsAt)}
                            </p>
                          </div>
                          <AppointmentStatusBadge
                            status={nextAppointment.status}
                            className="rounded-full"
                          />
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

                    <div className="flex flex-wrap gap-3">
                      <Button asChild>
                        <Link href="/portal/appointments/request">Request a visit</Link>
                      </Button>
                      <Button asChild variant="outline">
                        <Link href="/portal/appointments">View all requests</Link>
                      </Button>
                    </div>
                  </PortalPanel>

                  <PortalPanel
                    title="Upcoming reminders"
                    description="Scheduled notices from your clinic or care plan."
                    action={<BellRing aria-hidden="true" className="h-5 w-5 text-primary" />}
                  >
                    {me.reminders?.length ? (
                      <div className="space-y-3">
                        {me.reminders.slice(0, 4).map((reminder) => (
                          <div
                            key={reminder.id}
                            className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background p-4"
                          >
                            <div>
                              <p className="text-sm font-medium tabular-nums text-foreground">
                                {formatPortalDateTime(reminder.scheduledAt)}
                              </p>
                              <p className="text-xs text-muted-foreground">{reminder.status}</p>
                            </div>
                            <Badge variant="outline" className="rounded-full border-border">
                              {reminder.channel}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <EmptyState
                        density="compact"
                        icon={BellRing}
                        title="No reminders scheduled"
                        description="Your clinic will send reminders here when your care plan schedules one."
                      />
                    )}
                  </PortalPanel>
                </section>

                <PortalPanel
                  title="Recent recommendations"
                  description="Notes and actions captured during your latest finalized visit."
                  action={<ClipboardList aria-hidden="true" className="h-5 w-5 text-primary" />}
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
                            <Badge variant="secondary" className="rounded-full">
                              Counseling completed
                            </Badge>
                          )}
                          {me.recommendations?.medicationPrescribed && (
                            <Badge variant="secondary" className="rounded-full">
                              Medication prescribed
                            </Badge>
                          )}
                        </span>
                      ) : (
                        'No care actions were listed.'
                      )
                    }
                    valueClassName="font-normal text-muted-foreground"
                  />
                </PortalPanel>
              </div>
            );
          }}
        </ResourceState>
      </div>
    </RouteGuard>
  );
}
