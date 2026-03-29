"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  BellRing,
  CalendarDays,
  ChevronRight,
  ClipboardList,
  HeartPulse,
  Scale,
  Syringe,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useBootstrap } from "@/lib/bootstrap-context";
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
} from "@/lib/patient-portal";
import { RouteGuard } from "@/components/RouteGuard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function readNumber(value: unknown) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function getLatestMeasurement(measurements: MeasurementRecord[], type: MeasurementRecord["type"]) {
  return measurements.find((measurement) => measurement.type === type) ?? null;
}

function getNextConfirmedAppointment(requests: AppointmentRequestRecord[]) {
  const now = Date.now();
  return requests
    .filter((request) => request.appointment?.status === "CONFIRMED")
    .map((request) => request.appointment)
    .filter((appointment): appointment is NonNullable<AppointmentRequestRecord["appointment"]> =>
      Boolean(appointment)
    )
    .filter((appointment) => new Date(appointment.startsAt).getTime() >= now)
    .sort(
      (left, right) =>
        new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime()
    )[0] ?? null;
}

function getPendingRequestCount(requests: AppointmentRequestRecord[]) {
  return requests.filter((request) => request.status === "REQUESTED" || request.status === "TRIAGED")
    .length;
}

export function OverviewPortalScreen() {
  const getToken = useAuth();
  const bootstrap = useBootstrap()?.bootstrap ?? null;
  const clinicId = getPortalClinicId(bootstrap);
  const clinicName = getPortalClinicName(bootstrap, clinicId);

  const [me, setMe] = useState<PortalMeResponse | null>(null);
  const [measurements, setMeasurements] = useState<MeasurementRecord[]>([]);
  const [requests, setRequests] = useState<AppointmentRequestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!clinicId || !getToken) return;
      setLoading(true);
      setError(null);
      try {
        const from = new Date();
        from.setDate(from.getDate() - 90);
        const [meResponse, measurementResponse, requestResponse] = await Promise.all([
          fetchPortalMe(clinicId, getToken),
          fetchMeasurements(clinicId, getToken, { from: from.toISOString() }),
          fetchAppointmentRequests(clinicId, getToken),
        ]);

        if (cancelled) return;
        setMe(meResponse);
        setMeasurements(measurementResponse);
        setRequests(requestResponse);
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
  }, [clinicId, getToken]);

  const latestBp = getLatestMeasurement(measurements, "BP");
  const latestGlucose = getLatestMeasurement(measurements, "GLUCOSE");
  const latestWeight = getLatestMeasurement(measurements, "WEIGHT");
  const nextAppointment = getNextConfirmedAppointment(requests);
  const pendingRequests = getPendingRequestCount(requests);

  return (
    <RouteGuard requiredPermission="PATIENT.PORTAL.READ_SELF">
      <div className="space-y-6">
        <section className="grid gap-4 lg:grid-cols-[1.3fr_0.9fr]">
          <Card className="overflow-hidden border-border/70 bg-gradient-to-br from-primary/10 via-card to-secondary/10">
            <CardHeader className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="rounded-full px-3 py-1">
                  Personal overview
                </Badge>
                {clinicName && (
                  <Badge variant="outline" className="rounded-full bg-background/80 px-3 py-1">
                    {clinicName}
                  </Badge>
                )}
              </div>
              <div className="space-y-2">
                <CardTitle className="text-2xl md:text-3xl">
                  {me ? `${me.patient.firstName} ${me.patient.lastName}` : "Your care snapshot"}
                </CardTitle>
                <CardDescription className="max-w-2xl text-sm md:text-base">
                  See the latest guidance from your care team, recent measurements, and appointment progress without leaving your dashboard.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-border/70 bg-background/80 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Patient code
                </p>
                <p className="mt-2 font-mono text-sm">
                  {me?.patient.patientCode ?? "Loading..."}
                </p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/80 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Next follow-up
                </p>
                <p className="mt-2 text-sm font-medium">
                  {formatPortalDate(me?.recommendations?.followUpDate)}
                </p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/80 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Pending requests
                </p>
                <p className="mt-2 text-sm font-medium">
                  {pendingRequests} {pendingRequests === 1 ? "request" : "requests"}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/95">
            <CardHeader>
              <CardTitle className="text-lg">Quick actions</CardTitle>
              <CardDescription>
                Move quickly between the most common portal tasks.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button asChild className="w-full justify-between">
                <Link href="/portal/self-reports/new?type=bp">
                  Log a reading
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="w-full justify-between">
                <Link href="/portal/appointments/request">
                  Request an appointment
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="w-full justify-between">
                <Link href="/portal/health">
                  Review my trends
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </section>

        {loading && (
          <div className="grid gap-4 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <Card key={index} className="h-32 animate-pulse border-border/70 bg-muted/30" />
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
                      Latest BP
                    </Badge>
                  </div>
                  <div>
                    <CardTitle className="text-xl">
                      {latestBp
                        ? `${readNumber(latestBp.payload.systolic) ?? "—"}/${readNumber(latestBp.payload.diastolic) ?? "—"}`
                        : "No reading"}
                    </CardTitle>
                    <CardDescription>
                      {latestBp ? formatPortalDate(latestBp.recordedAt) : "Add your first blood pressure reading"}
                    </CardDescription>
                  </div>
                </CardHeader>
              </Card>

              <Card className="border-border/70 bg-card/95">
                <CardHeader className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Syringe className="h-5 w-5 text-secondary" />
                    <Badge variant="outline" className="rounded-full">
                      Latest glucose
                    </Badge>
                  </div>
                  <div>
                    <CardTitle className="text-xl">
                      {latestGlucose
                        ? `${readNumber(latestGlucose.payload.value) ?? "—"} mg/dL`
                        : "No reading"}
                    </CardTitle>
                    <CardDescription>
                      {latestGlucose ? formatPortalDate(latestGlucose.recordedAt) : "Add a glucose reading"}
                    </CardDescription>
                  </div>
                </CardHeader>
              </Card>

              <Card className="border-border/70 bg-card/95">
                <CardHeader className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Scale className="h-5 w-5 text-chart-3" />
                    <Badge variant="outline" className="rounded-full">
                      Latest weight
                    </Badge>
                  </div>
                  <div>
                    <CardTitle className="text-xl">
                      {latestWeight
                        ? `${readNumber(latestWeight.payload.kg) ?? "—"} kg`
                        : "No reading"}
                    </CardTitle>
                    <CardDescription>
                      {latestWeight ? formatPortalDate(latestWeight.recordedAt) : "Add a weight reading"}
                    </CardDescription>
                  </div>
                </CardHeader>
              </Card>
            </section>

            <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
              <Card className="border-border/70 bg-card/95">
                <CardHeader className="space-y-3">
                  <div className="flex items-center justify-between">
                    <CalendarDays className="h-5 w-5 text-primary" />
                    <Badge variant={nextAppointment ? "secondary" : "outline"} className="rounded-full">
                      {nextAppointment ? "Confirmed visit" : "No visit booked"}
                    </Badge>
                  </div>
                  <div>
                    <CardTitle className="text-lg">Appointment status</CardTitle>
                    <CardDescription>
                      {nextAppointment
                        ? `Your next confirmed appointment is ${formatPortalDateTime(nextAppointment.startsAt)}.`
                        : "Request a visit and your clinic will confirm the exact time."}
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {nextAppointment ? (
                    <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="font-medium">{formatPortalDateTime(nextAppointment.startsAt)}</p>
                          <p className="text-sm text-muted-foreground">
                            Ends {formatPortalDateTime(nextAppointment.endsAt)}
                          </p>
                        </div>
                        <Badge variant="secondary" className="rounded-full">
                          {nextAppointment.status}
                        </Badge>
                      </div>
                      {nextAppointment.notes && (
                        <p className="mt-3 text-sm text-muted-foreground">{nextAppointment.notes}</p>
                      )}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 p-5 text-sm text-muted-foreground">
                      You do not have a confirmed appointment yet.
                    </div>
                  )}

                  <div className="flex flex-wrap gap-3">
                    <Button asChild>
                      <Link href="/portal/appointments/request">Request a visit</Link>
                    </Button>
                    <Button asChild variant="outline">
                      <Link href="/portal/appointments">View all requests</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/70 bg-card/95">
                <CardHeader className="space-y-3">
                  <div className="flex items-center justify-between">
                    <BellRing className="h-5 w-5 text-secondary" />
                    <Badge variant="outline" className="rounded-full">
                      Reminders
                    </Badge>
                  </div>
                  <div>
                    <CardTitle className="text-lg">Upcoming reminders</CardTitle>
                    <CardDescription>
                      Scheduled notices from your clinic or care plan.
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent>
                  {me?.reminders?.length ? (
                    <div className="space-y-3">
                      {me.reminders.slice(0, 4).map((reminder) => (
                        <div
                          key={reminder.id}
                          className="rounded-2xl border border-border/70 bg-background/70 p-4"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-medium">
                                {formatPortalDateTime(reminder.scheduledAt)}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {reminder.channel} • {reminder.status}
                              </p>
                            </div>
                            <Badge variant="outline" className="rounded-full">
                              {reminder.channel}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 p-5 text-sm text-muted-foreground">
                      No reminders are scheduled right now.
                    </div>
                  )}
                </CardContent>
              </Card>
            </section>

            <Card className="border-border/70 bg-card/95">
              <CardHeader className="space-y-3">
                <div className="flex items-center justify-between">
                  <ClipboardList className="h-5 w-5 text-primary" />
                  <Badge variant="outline" className="rounded-full">
                    Care plan
                  </Badge>
                </div>
                <div>
                  <CardTitle className="text-lg">Recent recommendations</CardTitle>
                  <CardDescription>
                    Notes and actions captured during your latest finalized visit.
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-[1fr_1fr]">
                <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Care plan notes
                  </p>
                  <p className="mt-3 text-sm text-muted-foreground">
                    {me?.recommendations?.carePlanNotes ||
                      "No care plan notes have been published for your latest visit yet."}
                  </p>
                </div>
                <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Follow-up actions
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {me?.recommendations?.counselingGiven && (
                      <Badge variant="secondary" className="rounded-full">
                        Counseling completed
                      </Badge>
                    )}
                    {me?.recommendations?.medicationPrescribed && (
                      <Badge variant="secondary" className="rounded-full">
                        Medication prescribed
                      </Badge>
                    )}
                    {!me?.recommendations?.counselingGiven &&
                      !me?.recommendations?.medicationPrescribed && (
                        <span className="text-sm text-muted-foreground">
                          No care actions were listed.
                        </span>
                      )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </RouteGuard>
  );
}
