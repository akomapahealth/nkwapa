'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Activity, ArrowRight, HeartPulse, Scale, Syringe } from 'lucide-react';
import { useBootstrap } from '@/lib/bootstrap-context';
import {
  fetchLegacySelfReports,
  fetchMeasurements,
  fetchPatientTrends,
  fetchPortalMe,
  formatMeasurementLabel,
  formatMeasurementValue,
  formatPortalDate,
  getPortalClinicId,
  getPortalClinicName,
  type BloodPressureTrendPoint,
  type GlucoseTrendPoint,
  type LegacySelfReport,
  type MeasurementRecord,
  type PatientTrendsResponse,
  type PortalMeResponse,
} from '@/lib/patient-portal';
import {
  TREND_RANGE_OPTIONS,
  buildBloodPressureTrendData,
  buildGlucoseTrendData,
  formatTrendRangeFrom,
  getLatestBloodPressureTrend,
  getLatestGlucoseTrend,
  readTrendNumber,
  type TrendRangeDays,
} from '@/lib/patient-trends';
import { AppMetricCard } from '@/components/app-shell/AppMetricCard';
import { SegmentedControl } from '@/components/app-shell/SegmentedControl';
import { EmptyState, SectionSkeleton } from '@/components/feedback/AppState';
import { ResourceState } from '@/components/feedback/ResourceState';
import { MeasurementTrendChart } from '@/components/portal/MeasurementTrendChart';
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

interface HealthData {
  me: PortalMeResponse;
  measurements: MeasurementRecord[];
  history: LegacySelfReport[];
  trends: PatientTrendsResponse;
}

function getLatestMeasurement(measurements: MeasurementRecord[], type: MeasurementRecord['type']) {
  return measurements.find((measurement) => measurement.type === type) ?? null;
}

function buildWeightTrendData(measurements: MeasurementRecord[]) {
  return measurements
    .filter((measurement) => measurement.type === 'WEIGHT')
    .slice()
    .reverse()
    .map((measurement) => ({
      label: new Date(measurement.recordedAt).toLocaleDateString(undefined, {
        month: 'numeric',
        day: 'numeric',
      }),
      weight: readTrendNumber(measurement.payload.kg),
    }));
}

function latestWeightLabel(measurement: MeasurementRecord | null) {
  if (!measurement) return 'No readings yet';
  return `Recorded ${formatPortalDate(measurement.recordedAt)}`;
}

function readingSource(source: string) {
  return source === 'ENCOUNTER' ? 'clinic visit' : 'home reading';
}

function latestBpLabel(point: BloodPressureTrendPoint | null) {
  if (!point) return 'No readings yet';
  return `Recorded ${formatPortalDate(point.t)} • ${readingSource(point.source)}`;
}

function latestGlucoseLabel(point: GlucoseTrendPoint | null) {
  if (!point) return 'No readings yet';
  return `Recorded ${formatPortalDate(point.t)} • ${readingSource(point.source)}`;
}

const FOLLOW_UP_LABELS: Array<{
  key: keyof PatientTrendsResponse['followUp'];
  label: string;
}> = [
  { key: 'requested', label: 'Requested' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'completed', label: 'Completed' },
  { key: 'noShow', label: 'No-show' },
  { key: 'closed', label: 'Closed' },
];

export function HealthPortalScreen() {
  const bootstrap = useBootstrap()?.bootstrap ?? null;
  const clinicId = getPortalClinicId(bootstrap);
  const clinicName = getPortalClinicName(bootstrap, clinicId);

  const [rangeDays, setRangeDays] = useState<TrendRangeDays>(90);

  const health = usePortalResource<HealthData>({
    resourceKey: `${clinicId ?? 'no-clinic'}:${rangeDays}`,
    enabled: Boolean(clinicId),
    errorMessage: 'Your health history could not be loaded.',
    fetcher: async (getToken) => {
      const from = formatTrendRangeFrom(rangeDays);
      const [me, measurements, history, trends] = await Promise.all([
        fetchPortalMe(clinicId!, getToken),
        fetchMeasurements(clinicId!, getToken, { from }),
        fetchLegacySelfReports(clinicId!, getToken),
        fetchPatientTrends(clinicId!, getToken, { from }),
      ]);
      return { me, measurements, history, trends };
    },
  });

  if (health.isLinkMissing && !health.isInitialLoading) {
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
            eyebrow="My Health"
            clinicName={clinicName}
            title="Build a clearer picture of your progress."
            description="Review recent readings, spot patterns over time, and keep your care team updated before your next visit."
            contentClassName="flex flex-wrap gap-3"
          >
            <Button asChild>
              <Link href="/portal/self-reports/new?type=bp">
                Log blood pressure
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/portal/self-reports/new?type=glucose">Log glucose</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/portal/self-reports/new?type=weight">Log weight</Link>
            </Button>
          </PortalHero>

          <PortalPanel
            title="Time window"
            description="Focus your charts on the range that matters most right now."
            contentClassName="space-y-4"
          >
            <SegmentedControl
              label="Time window"
              value={String(rangeDays)}
              onChange={(value) => setRangeDays(Number(value) as TrendRangeDays)}
              options={TREND_RANGE_OPTIONS.map((days) => ({
                value: String(days),
                label: `${days} days`,
              }))}
            />
            <p className="text-sm leading-6 text-muted-foreground">
              We’re showing readings from the last {rangeDays} days so you can compare recent
              changes at a glance.
            </p>
          </PortalPanel>
        </section>

        <ResourceState
          state={health}
          skeleton={<SectionSkeleton lines={3} className="p-6" />}
          errorTitle="Your health history could not be loaded"
        >
          {({ me, measurements, history, trends }) => {
            const latestBp = getLatestBloodPressureTrend(trends.bp ?? []);
            const latestGlucose = getLatestGlucoseTrend(trends.glucose ?? []);
            const latestWeight = getLatestMeasurement(measurements, 'WEIGHT');
            const bpTrend = buildBloodPressureTrendData(trends.bp ?? []);
            const glucoseTrend = buildGlucoseTrendData(trends.glucose ?? []);
            const weightTrend = buildWeightTrendData(measurements);
            const followUp = trends.followUp;

            return (
              <div className="space-y-6">
                <section className="grid gap-4 md:grid-cols-3">
                  <AppMetricCard
                    icon={HeartPulse}
                    title="Blood pressure"
                    value={latestBp ? `${latestBp.sys}/${latestBp.dia} mmHg` : 'No reading yet'}
                    detail={latestBpLabel(latestBp)}
                  />
                  <AppMetricCard
                    icon={Syringe}
                    title="Glucose"
                    value={latestGlucose ? `${latestGlucose.value} mg/dL` : 'No reading yet'}
                    detail={latestGlucoseLabel(latestGlucose)}
                  />
                  <AppMetricCard
                    icon={Scale}
                    title="Weight"
                    value={
                      latestWeight
                        ? `${readTrendNumber(latestWeight.payload.kg) ?? '—'} kg`
                        : 'No reading yet'
                    }
                    detail={latestWeightLabel(latestWeight)}
                  />
                </section>

                {me.recommendations && (
                  <PortalPanel
                    title="Care team guidance"
                    description="Guidance from your most recent finalized care plan."
                    contentClassName="grid gap-4 md:grid-cols-3"
                  >
                    <PortalFact
                      label="Follow-up"
                      value={formatPortalDate(me.recommendations.followUpDate)}
                    />
                    <PortalFact
                      label="Support provided"
                      value={
                        me.recommendations.counselingGiven ||
                        me.recommendations.medicationPrescribed ? (
                          <span className="flex flex-wrap gap-2">
                            {me.recommendations.counselingGiven && (
                              <Badge variant="secondary" className="rounded-full">
                                Counseling
                              </Badge>
                            )}
                            {me.recommendations.medicationPrescribed && (
                              <Badge variant="secondary" className="rounded-full">
                                Medication
                              </Badge>
                            )}
                          </span>
                        ) : (
                          'No care actions listed'
                        )
                      }
                      valueClassName="font-normal text-muted-foreground"
                    />
                    <PortalFact
                      label="Notes"
                      value={
                        me.recommendations.carePlanNotes || 'No care plan notes were shared yet.'
                      }
                      valueClassName="font-normal leading-6 text-muted-foreground"
                    />
                  </PortalPanel>
                )}

                <PortalPanel
                  title="Follow-up activity"
                  description={`Appointment requests and visit outcomes across the last ${rangeDays} days.`}
                  contentClassName="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"
                >
                  {FOLLOW_UP_LABELS.map((item) => (
                    <PortalFact
                      key={item.key}
                      label={item.label}
                      value={followUp[item.key]}
                      valueClassName="text-2xl font-semibold"
                    />
                  ))}
                </PortalPanel>

                <section className="grid gap-4 lg:grid-cols-2">
                  <div className="lg:col-span-2">
                    <MeasurementTrendChart
                      headingLevel="h2"
                      title="Blood pressure trend"
                      description="Finalized clinic readings combined with the blood pressure logs you entered at home."
                      emptyMessage="Add a blood pressure reading to start building your trend line."
                      valueSuffix=" mmHg"
                      lines={[
                        { key: 'systolic', label: 'Systolic', color: 'hsl(var(--chart-1))' },
                        { key: 'diastolic', label: 'Diastolic', color: 'hsl(var(--chart-2))' },
                      ]}
                      data={bpTrend}
                    />
                  </div>
                  <MeasurementTrendChart
                    headingLevel="h2"
                    title="Glucose trend"
                    description="Finalized clinic readings combined with the glucose logs you entered at home."
                    emptyMessage="Log a glucose reading to see your trend."
                    valueSuffix=" mg/dL"
                    lines={[{ key: 'glucose', label: 'Glucose', color: 'hsl(var(--chart-2))' }]}
                    data={glucoseTrend}
                  />
                  <MeasurementTrendChart
                    headingLevel="h2"
                    title="Weight trend"
                    description="Track steady changes in weight over time."
                    emptyMessage="Log your weight to start a trend."
                    valueSuffix=" kg"
                    lines={[{ key: 'weight', label: 'Weight', color: 'hsl(var(--chart-3))' }]}
                    data={weightTrend}
                  />
                </section>

                <PortalPanel
                  title="Submission history"
                  description="Your recent readings and older portal updates appear together here."
                  action={
                    <Button asChild variant="outline" size="sm">
                      <Link href="/portal/self-reports/new">Log another update</Link>
                    </Button>
                  }
                >
                  {history.length === 0 ? (
                    <EmptyState
                      icon={Activity}
                      title="No submissions yet"
                      description="Start by logging a blood pressure, glucose, or weight reading."
                      action={
                        <Button asChild>
                          <Link href="/portal/self-reports/new">Log a reading</Link>
                        </Button>
                      }
                    />
                  ) : (
                    <div className="space-y-3">
                      {history.slice(0, 12).map((entry) => (
                        <div
                          key={entry.id}
                          className="flex flex-col gap-3 rounded-lg border border-border bg-background p-4 md:flex-row md:items-center md:justify-between"
                        >
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="outline" className="rounded-full border-border">
                                {formatMeasurementLabel(entry.type)}
                              </Badge>
                              <span className="text-sm font-medium tabular-nums text-foreground">
                                {formatMeasurementValue(entry)}
                              </span>
                            </div>
                            <p className="text-sm leading-6 text-muted-foreground">
                              {entry.notes?.trim() || 'No notes added for this submission.'}
                            </p>
                          </div>
                          <div className="text-sm tabular-nums text-muted-foreground">
                            {formatPortalDate(entry.recordedAt)}
                          </div>
                        </div>
                      ))}
                    </div>
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
