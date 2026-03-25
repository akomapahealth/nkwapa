"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Activity, ArrowRight, HeartPulse, Scale, Syringe } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useBootstrap } from "@/lib/bootstrap-context";
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
} from "@/lib/patient-portal";
import {
  TREND_RANGE_OPTIONS,
  buildBloodPressureTrendData,
  buildGlucoseTrendData,
  formatTrendRangeFrom,
  getLatestBloodPressureTrend,
  getLatestGlucoseTrend,
  readTrendNumber,
} from "@/lib/patient-trends";
import { RouteGuard } from "@/components/RouteGuard";
import { MeasurementTrendChart } from "@/components/portal/MeasurementTrendChart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function getLatestMeasurement(measurements: MeasurementRecord[], type: MeasurementRecord["type"]) {
  return measurements.find((measurement) => measurement.type === type) ?? null;
}

function buildWeightTrendData(measurements: MeasurementRecord[]) {
  return measurements
    .filter((measurement) => measurement.type === "WEIGHT")
    .slice()
    .reverse()
    .map((measurement) => ({
      label: new Date(measurement.recordedAt).toLocaleDateString(undefined, {
        month: "numeric",
        day: "numeric",
      }),
      weight: readTrendNumber(measurement.payload.kg),
    }));
}

function latestWeightLabel(measurement: MeasurementRecord | null) {
  if (!measurement) return "No readings yet";
  return `${formatMeasurementValue(measurement)} • ${formatPortalDate(measurement.recordedAt)}`;
}

function latestBpLabel(point: BloodPressureTrendPoint | null) {
  if (!point) return "No readings yet";
  return `${point.sys}/${point.dia} mmHg • ${formatPortalDate(point.t)} • ${point.source === "ENCOUNTER" ? "clinic visit" : "home reading"}`;
}

function latestGlucoseLabel(point: GlucoseTrendPoint | null) {
  if (!point) return "No readings yet";
  return `${point.value} mg/dL • ${formatPortalDate(point.t)} • ${point.source === "ENCOUNTER" ? "clinic visit" : "home reading"}`;
}

const FOLLOW_UP_LABELS: Array<{
  key: keyof PatientTrendsResponse["followUp"];
  label: string;
}> = [
  { key: "requested", label: "Requested" },
  { key: "confirmed", label: "Confirmed" },
  { key: "completed", label: "Completed" },
  { key: "noShow", label: "No-show" },
  { key: "closed", label: "Closed" },
];

export function HealthPortalScreen() {
  const getToken = useAuth();
  const bootstrap = useBootstrap()?.bootstrap ?? null;
  const clinicId = getPortalClinicId(bootstrap);
  const clinicName = getPortalClinicName(bootstrap, clinicId);

  const [rangeDays, setRangeDays] = useState<90 | 30 | 180>(90);
  const [measurements, setMeasurements] = useState<MeasurementRecord[]>([]);
  const [history, setHistory] = useState<LegacySelfReport[]>([]);
  const [me, setMe] = useState<PortalMeResponse | null>(null);
  const [trends, setTrends] = useState<PatientTrendsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!clinicId || !getToken) return;
      setLoading(true);
      setError(null);
      try {
        const from = formatTrendRangeFrom(rangeDays);
        const [meResponse, measurementResponse, historyResponse, trendsResponse] = await Promise.all([
          fetchPortalMe(clinicId, getToken),
          fetchMeasurements(clinicId, getToken, { from }),
          fetchLegacySelfReports(clinicId, getToken),
          fetchPatientTrends(clinicId, getToken, { from }),
        ]);

        if (cancelled) return;
        setMe(meResponse);
        setMeasurements(measurementResponse);
        setHistory(historyResponse);
        setTrends(trendsResponse);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [clinicId, getToken, rangeDays]);

  const latestBp = getLatestBloodPressureTrend(trends?.bp ?? []);
  const latestGlucose = getLatestGlucoseTrend(trends?.glucose ?? []);
  const latestWeight = getLatestMeasurement(measurements, "WEIGHT");
  const bpTrend = buildBloodPressureTrendData(trends?.bp ?? []);
  const glucoseTrend = buildGlucoseTrendData(trends?.glucose ?? []);
  const weightTrend = buildWeightTrendData(measurements);
  const followUp = trends?.followUp ?? {
    requested: 0,
    confirmed: 0,
    completed: 0,
    noShow: 0,
    closed: 0,
  };

  return (
    <RouteGuard requiredPermission="PATIENT.PORTAL.READ_SELF">
      <div className="space-y-6">
        <section className="grid gap-4 lg:grid-cols-[1.35fr_0.95fr]">
          <Card className="overflow-hidden border-border/70 bg-gradient-to-br from-card via-card to-primary/5">
            <CardHeader className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="rounded-full px-3 py-1">
                  My Health
                </Badge>
                {clinicName && (
                  <Badge variant="outline" className="rounded-full bg-background/70 px-3 py-1">
                    {clinicName}
                  </Badge>
                )}
              </div>
              <div className="space-y-2">
                <CardTitle className="text-2xl md:text-3xl">
                  Build a clearer picture of your progress.
                </CardTitle>
                <CardDescription className="max-w-2xl text-sm md:text-base">
                  Review recent readings, spot patterns over time, and keep your care team updated before your next visit.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <Button asChild>
                <Link href="/portal/self-reports/new?type=bp">
                  Log blood pressure
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/portal/self-reports/new?type=glucose">
                  Log glucose
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/portal/self-reports/new?type=weight">
                  Log weight
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/95">
            <CardHeader>
              <CardTitle className="text-base">Time window</CardTitle>
              <CardDescription>
                Focus your charts on the range that matters most right now.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {TREND_RANGE_OPTIONS.map((days) => (
                  <Button
                    key={days}
                    type="button"
                    variant={days === rangeDays ? "default" : "outline"}
                    size="sm"
                    onClick={() => setRangeDays(days)}
                    className="rounded-full"
                  >
                    {days} days
                  </Button>
                ))}
              </div>
              <p className="text-sm text-muted-foreground">
                We’re showing readings from the last {rangeDays} days so you can compare recent changes at a glance.
              </p>
            </CardContent>
          </Card>
        </section>

        {loading && (
          <div className="grid gap-4 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <Card key={index} className="h-36 animate-pulse border-border/70 bg-muted/30" />
            ))}
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {error}
          </div>
        )}

        {!loading && !error && (
          <>
            <section className="grid gap-4 md:grid-cols-3">
              <Card className="border-border/70 bg-card/95">
                <CardHeader className="space-y-3">
                  <div className="flex items-center justify-between">
                    <HeartPulse className="h-5 w-5 text-primary" />
                    <Badge variant="outline" className="rounded-full">
                      Blood pressure
                    </Badge>
                  </div>
                  <div>
                    <CardTitle className="text-xl">
                      {latestBp
                        ? `${latestBp.sys}/${latestBp.dia}`
                        : "No reading"}
                    </CardTitle>
                    <CardDescription>{latestBpLabel(latestBp)}</CardDescription>
                  </div>
                </CardHeader>
              </Card>

              <Card className="border-border/70 bg-card/95">
                <CardHeader className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Syringe className="h-5 w-5 text-secondary" />
                    <Badge variant="outline" className="rounded-full">
                      Glucose
                    </Badge>
                  </div>
                  <div>
                    <CardTitle className="text-xl">
                      {latestGlucose
                        ? `${latestGlucose.value} mg/dL`
                        : "No reading"}
                    </CardTitle>
                    <CardDescription>{latestGlucoseLabel(latestGlucose)}</CardDescription>
                  </div>
                </CardHeader>
              </Card>

              <Card className="border-border/70 bg-card/95">
                <CardHeader className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Scale className="h-5 w-5 text-chart-3" />
                    <Badge variant="outline" className="rounded-full">
                      Weight
                    </Badge>
                  </div>
                  <div>
                    <CardTitle className="text-xl">
                      {latestWeight
                        ? `${readTrendNumber(latestWeight.payload.kg) ?? "—"} kg`
                        : "No reading"}
                    </CardTitle>
                    <CardDescription>{latestWeightLabel(latestWeight)}</CardDescription>
                  </div>
                </CardHeader>
              </Card>
            </section>

            {me?.recommendations && (
              <Card className="border-border/70 bg-gradient-to-r from-secondary/10 via-card to-primary/10">
                <CardHeader>
                  <CardTitle className="text-lg">Care team guidance</CardTitle>
                  <CardDescription>
                    Guidance from your most recent finalized care plan.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Follow-up
                    </p>
                    <p className="mt-2 text-sm font-medium">
                      {formatPortalDate(me.recommendations.followUpDate)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Support provided
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
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
                      {!me.recommendations.counselingGiven &&
                        !me.recommendations.medicationPrescribed && (
                          <span className="text-sm text-muted-foreground">No care actions listed</span>
                        )}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Notes
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {me.recommendations.carePlanNotes || "No care plan notes were shared yet."}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card className="border-border/70 bg-card/95">
              <CardHeader>
                <CardTitle className="text-lg">Follow-up activity</CardTitle>
                <CardDescription>
                  Appointment requests and visit outcomes across the last {rangeDays} days.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                {FOLLOW_UP_LABELS.map((item) => (
                  <div
                    key={item.key}
                    className="rounded-2xl border border-border/70 bg-background/70 p-4"
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      {item.label}
                    </p>
                    <p className="mt-2 text-2xl font-semibold">{followUp[item.key]}</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <section className="grid gap-4 lg:grid-cols-2">
              <div className="lg:col-span-2">
                <MeasurementTrendChart
                  title="Blood pressure trend"
                  description="Finalized clinic readings combined with the blood pressure logs you entered at home."
                  emptyMessage="Add a blood pressure reading to start building your trend line."
                  valueSuffix=" mmHg"
                  lines={[
                    { key: "systolic", label: "Systolic", color: "hsl(var(--chart-1))" },
                    { key: "diastolic", label: "Diastolic", color: "hsl(var(--chart-2))" },
                  ]}
                  data={bpTrend}
                />
              </div>
              <MeasurementTrendChart
                title="Glucose trend"
                description="Finalized clinic readings combined with the glucose logs you entered at home."
                emptyMessage="Log a glucose reading to see your trend."
                valueSuffix=" mg/dL"
                lines={[{ key: "glucose", label: "Glucose", color: "hsl(var(--chart-2))" }]}
                data={glucoseTrend}
              />
              <MeasurementTrendChart
                title="Weight trend"
                description="Track steady changes in weight over time."
                emptyMessage="Log your weight to start a trend."
                valueSuffix=" kg"
                lines={[{ key: "weight", label: "Weight", color: "hsl(var(--chart-3))" }]}
                data={weightTrend}
              />
            </section>

            <Card className="border-border/70 bg-card/95">
              <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <CardTitle className="text-lg">Submission history</CardTitle>
                  <CardDescription>
                    Your recent readings and older portal updates appear together here.
                  </CardDescription>
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link href="/portal/self-reports/new">Log another update</Link>
                </Button>
              </CardHeader>
              <CardContent>
                {history.length === 0 ? (
                  <div className="flex min-h-[180px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border/70 bg-muted/20 px-6 text-center">
                    <Activity className="h-6 w-6 text-muted-foreground" />
                    <div className="space-y-1">
                      <p className="font-medium">No submissions yet</p>
                      <p className="text-sm text-muted-foreground">
                        Start by logging a blood pressure, glucose, or weight reading.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {history.slice(0, 12).map((entry) => (
                      <div
                        key={entry.id}
                        className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-background/70 p-4 md:flex-row md:items-center md:justify-between"
                      >
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline" className="rounded-full bg-background">
                              {formatMeasurementLabel(entry.type)}
                            </Badge>
                            <span className="text-sm font-medium">
                              {formatMeasurementValue(entry)}
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {entry.notes?.trim() || "No notes added for this submission."}
                          </p>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {formatPortalDate(entry.recordedAt)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </RouteGuard>
  );
}
