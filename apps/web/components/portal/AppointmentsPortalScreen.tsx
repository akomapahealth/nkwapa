'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  CircleSlash,
  Clock3,
  FileClock,
  Plus,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useBootstrap } from '@/lib/bootstrap-context';
import {
  fetchAppointmentRequests,
  getPortalErrorMessage,
  formatPortalDate,
  formatPortalDateTime,
  getPortalClinicId,
  getPortalClinicName,
  isPortalLinkMissingError,
  type AppointmentRequestRecord,
} from '@/lib/patient-portal';
import { PortalLinkRequiredState } from '@/components/portal/PortalLinkRequiredState';
import { RouteGuard } from '@/components/RouteGuard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

type RequestTab = 'all' | 'pending' | 'confirmed' | 'closed';

function isPending(request: AppointmentRequestRecord) {
  return request.status === 'REQUESTED' || request.status === 'TRIAGED';
}

function isClosed(request: AppointmentRequestRecord) {
  return request.status === 'REJECTED' || request.status === 'CANCELLED';
}

function getStatusBadgeVariant(
  status: AppointmentRequestRecord['status'],
): 'secondary' | 'warning' | 'finalized' | 'destructive' | 'outline' {
  switch (status) {
    case 'REQUESTED':
      return 'secondary';
    case 'TRIAGED':
      return 'warning';
    case 'CONFIRMED':
      return 'finalized';
    case 'REJECTED':
      return 'destructive';
    case 'CANCELLED':
      return 'outline';
  }
}

function getStatusLabel(status: AppointmentRequestRecord['status']) {
  switch (status) {
    case 'REQUESTED':
      return 'Requested';
    case 'TRIAGED':
      return 'Under review';
    case 'CONFIRMED':
      return 'Confirmed';
    case 'REJECTED':
      return 'Not approved';
    case 'CANCELLED':
      return 'Cancelled';
  }
}

function getRequestsForTab(requests: AppointmentRequestRecord[], tab: RequestTab) {
  switch (tab) {
    case 'pending':
      return requests.filter(isPending);
    case 'confirmed':
      return requests.filter((request) => request.status === 'CONFIRMED');
    case 'closed':
      return requests.filter(isClosed);
    case 'all':
    default:
      return requests;
  }
}

function getNextAppointment(requests: AppointmentRequestRecord[]) {
  const now = Date.now();
  return (
    requests
      .map((request) => request.appointment)
      .filter((appointment): appointment is NonNullable<AppointmentRequestRecord['appointment']> =>
        Boolean(appointment),
      )
      .filter(
        (appointment) =>
          appointment.status === 'CONFIRMED' && new Date(appointment.startsAt).getTime() >= now,
      )
      .sort(
        (left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime(),
      )[0] ?? null
  );
}

function getRequestWindow(request: AppointmentRequestRecord) {
  if (request.preferredStartDate === request.preferredEndDate) {
    return formatPortalDate(request.preferredStartDate);
  }
  return `${formatPortalDate(request.preferredStartDate)} to ${formatPortalDate(
    request.preferredEndDate,
  )}`;
}

export function AppointmentsPortalScreen() {
  const getToken = useAuth();
  const bootstrap = useBootstrap()?.bootstrap ?? null;
  const clinicId = getPortalClinicId(bootstrap);
  const clinicName = getPortalClinicName(bootstrap, clinicId);

  const [requests, setRequests] = useState<AppointmentRequestRecord[]>([]);
  const [activeTab, setActiveTab] = useState<RequestTab>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!clinicId || !getToken) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const response = await fetchAppointmentRequests(clinicId, getToken);
        if (!cancelled) {
          setRequests(response);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err);
        }
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

  const pendingCount = useMemo(() => requests.filter(isPending).length, [requests]);
  const confirmedCount = useMemo(
    () => requests.filter((request) => request.status === 'CONFIRMED').length,
    [requests],
  );
  const closedCount = useMemo(() => requests.filter(isClosed).length, [requests]);
  const nextAppointment = useMemo(() => getNextAppointment(requests), [requests]);
  const visibleRequests = useMemo(
    () => getRequestsForTab(requests, activeTab),
    [activeTab, requests],
  );
  const isLinkMissing = isPortalLinkMissingError(error);
  const errorMessage = error ? getPortalErrorMessage(error) : null;

  if (isLinkMissing && !loading) {
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
        <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <Card className="overflow-hidden border-border/70 bg-gradient-to-br from-card via-card to-primary/10">
            <CardHeader className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="rounded-full px-3 py-1">
                  Appointment center
                </Badge>
                {clinicName && (
                  <Badge variant="outline" className="rounded-full bg-background/80 px-3 py-1">
                    {clinicName}
                  </Badge>
                )}
              </div>
              <div className="space-y-2">
                <CardTitle className="text-2xl md:text-3xl">
                  Keep visit requests and confirmed appointments in one place.
                </CardTitle>
                <CardDescription className="max-w-2xl text-sm md:text-base">
                  Review the status of every request, see your confirmed visit details, and submit a
                  new scheduling request whenever you need support.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <Button asChild>
                <Link href="/portal/appointments/request">
                  <Plus className="h-4 w-4" />
                  Request a visit
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/portal/health">Review my health trends</Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/95">
            <CardHeader>
              <CardTitle className="text-lg">Next confirmed visit</CardTitle>
              <CardDescription>
                Your clinic confirms the exact date and time once a request is approved.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {nextAppointment ? (
                <div className="space-y-4 rounded-2xl border border-border/70 bg-background/70 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">
                        {formatPortalDateTime(nextAppointment.startsAt)}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Ends {formatPortalDateTime(nextAppointment.endsAt)}
                      </p>
                    </div>
                    <Badge variant="finalized" className="rounded-full">
                      Confirmed
                    </Badge>
                  </div>
                  {nextAppointment.notes && (
                    <p className="text-sm text-muted-foreground">{nextAppointment.notes}</p>
                  )}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 p-5 text-sm text-muted-foreground">
                  No confirmed visit is scheduled yet.
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <Card className="border-border/70 bg-card/95">
            <CardHeader className="space-y-3">
              <div className="flex items-center justify-between">
                <Clock3 className="h-5 w-5 text-primary" />
                <Badge variant="secondary" className="rounded-full">
                  Pending
                </Badge>
              </div>
              <div>
                <CardTitle className="text-2xl">{pendingCount}</CardTitle>
                <CardDescription>Requests waiting for clinic review or scheduling.</CardDescription>
              </div>
            </CardHeader>
          </Card>

          <Card className="border-border/70 bg-card/95">
            <CardHeader className="space-y-3">
              <div className="flex items-center justify-between">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                <Badge variant="finalized" className="rounded-full">
                  Confirmed
                </Badge>
              </div>
              <div>
                <CardTitle className="text-2xl">{confirmedCount}</CardTitle>
                <CardDescription>Requests that have turned into scheduled visits.</CardDescription>
              </div>
            </CardHeader>
          </Card>

          <Card className="border-border/70 bg-card/95">
            <CardHeader className="space-y-3">
              <div className="flex items-center justify-between">
                <CircleSlash className="h-5 w-5 text-destructive" />
                <Badge variant="outline" className="rounded-full">
                  Closed
                </Badge>
              </div>
              <div>
                <CardTitle className="text-2xl">{closedCount}</CardTitle>
                <CardDescription>
                  Requests that were closed, declined, or cancelled.
                </CardDescription>
              </div>
            </CardHeader>
          </Card>
        </section>

        {loading && (
          <div className="grid gap-4 md:grid-cols-2">
            {Array.from({ length: 2 }).map((_, index) => (
              <Card key={index} className="h-40 animate-pulse border-border/70 bg-muted/30" />
            ))}
          </div>
        )}

        {error ? (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {errorMessage}
          </div>
        ) : null}

        {!loading && !error && (
          <section className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
            <Card className="border-border/70 bg-card/95">
              <CardHeader>
                <CardTitle className="text-lg">Request history</CardTitle>
                <CardDescription>
                  Track your preferred dates, clinic decisions, and confirmed appointments.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs
                  value={activeTab}
                  onValueChange={(value) => setActiveTab(value as RequestTab)}
                >
                  <TabsList className="grid h-auto w-full grid-cols-2 gap-2 rounded-2xl border border-border/70 bg-background p-2 md:grid-cols-4">
                    <TabsTrigger value="all" className="rounded-xl">
                      All
                    </TabsTrigger>
                    <TabsTrigger value="pending" className="rounded-xl">
                      Pending
                    </TabsTrigger>
                    <TabsTrigger value="confirmed" className="rounded-xl">
                      Confirmed
                    </TabsTrigger>
                    <TabsTrigger value="closed" className="rounded-xl">
                      Closed
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value={activeTab} className="mt-4">
                    {visibleRequests.length === 0 ? (
                      <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border/70 bg-muted/20 px-6 text-center">
                        <FileClock className="h-6 w-6 text-muted-foreground" />
                        <div className="space-y-1">
                          <p className="font-medium">No requests in this view</p>
                          <p className="text-sm text-muted-foreground">
                            Submit a new appointment request when you need a follow-up or check-in.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {visibleRequests.map((request) => (
                          <div
                            key={request.id}
                            className="rounded-2xl border border-border/70 bg-background/70 p-4"
                          >
                            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                              <div className="space-y-2">
                                <div className="flex flex-wrap items-center gap-2">
                                  <Badge
                                    variant={getStatusBadgeVariant(request.status)}
                                    className="rounded-full"
                                  >
                                    {getStatusLabel(request.status)}
                                  </Badge>
                                  <span className="text-sm font-medium">
                                    Preferred window: {getRequestWindow(request)}
                                  </span>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                  Submitted {formatPortalDate(request.createdAt)}
                                </p>
                              </div>
                              <div className="text-sm text-muted-foreground">
                                {request.triagedAt
                                  ? `Updated ${formatPortalDate(request.triagedAt)}`
                                  : 'Awaiting review'}
                              </div>
                            </div>

                            <div className="mt-4 grid gap-4 md:grid-cols-[1fr_1fr]">
                              <div className="space-y-3">
                                <div>
                                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                    Visit reason
                                  </p>
                                  <p className="mt-2 text-sm">
                                    {request.reason || 'No reason provided'}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                    Notes
                                  </p>
                                  <p className="mt-2 text-sm text-muted-foreground">
                                    {request.notes || 'No notes were added to this request.'}
                                  </p>
                                </div>
                              </div>

                              <div className="space-y-3">
                                {request.appointment ? (
                                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
                                    <div className="flex items-center gap-2">
                                      <CalendarDays className="h-4 w-4 text-emerald-700" />
                                      <p className="font-medium text-emerald-900">
                                        Confirmed visit
                                      </p>
                                    </div>
                                    <p className="mt-2 text-sm text-emerald-900">
                                      {formatPortalDateTime(request.appointment.startsAt)}
                                    </p>
                                    <p className="text-sm text-emerald-800/80">
                                      Ends {formatPortalDateTime(request.appointment.endsAt)}
                                    </p>
                                    {request.appointment.notes && (
                                      <p className="mt-2 text-sm text-emerald-800/80">
                                        {request.appointment.notes}
                                      </p>
                                    )}
                                  </div>
                                ) : (
                                  <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 p-4 text-sm text-muted-foreground">
                                    The clinic has not attached a confirmed visit to this request
                                    yet.
                                  </div>
                                )}

                                {request.rejectionReason && (
                                  <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-4">
                                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-destructive">
                                      Clinic note
                                    </p>
                                    <p className="mt-2 text-sm text-destructive">
                                      {request.rejectionReason}
                                    </p>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card className="border-border/70 bg-card/95">
                <CardHeader>
                  <CardTitle className="text-lg">How scheduling works</CardTitle>
                  <CardDescription>
                    A quick guide to what happens after you submit a request.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                    <p className="font-medium">1. Share your preferred dates</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Pick the days that work best and tell your clinic why you need a visit.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                    <p className="font-medium">2. Clinic review</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Staff review your request and may add scheduling notes or confirm a specific
                      slot.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                    <p className="font-medium">3. Confirmation and reminder</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Once confirmed, your appointment details appear here and reminder messages are
                      scheduled automatically.
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/70 bg-gradient-to-br from-secondary/10 via-card to-card">
                <CardHeader>
                  <CardTitle className="text-lg">Need a new visit?</CardTitle>
                  <CardDescription>
                    Start a new request with your preferred timing and a short description of what
                    you need.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button asChild className="w-full justify-between">
                    <Link href="/portal/appointments/request">
                      Request an appointment
                      <CalendarClock className="h-4 w-4" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            </div>
          </section>
        )}
      </div>
    </RouteGuard>
  );
}
