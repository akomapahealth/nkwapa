'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileClock,
  Plus,
  RefreshCw,
  RotateCcw,
  XCircle,
} from 'lucide-react';
import { InlineErrorState } from '@/components/feedback/AppState';
import { PortalLinkRequiredState } from '@/components/portal/PortalLinkRequiredState';
import { RouteGuard } from '@/components/RouteGuard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/lib/auth-context';
import { useBootstrap } from '@/lib/bootstrap-context';
import {
  fetchAppointmentRequests,
  fetchPatientAppointments,
  formatPortalDate,
  formatPortalDateTime,
  getPortalClinicId,
  getPortalClinicName,
  getPortalErrorMessage,
  isPortalLinkMissingError,
  requestPatientAppointmentCancellation,
  requestPatientAppointmentReschedule,
  type AppointmentRequestRecord,
  type AppointmentSummary,
} from '@/lib/patient-portal';
import {
  getAppointmentRequestStatusView,
  getAppointmentRequestTypeLabel,
  getAppointmentStatusView,
  getNextConfirmedAppointment,
  isPatientAppointmentActionable,
} from '@/lib/portal-appointment-status';
import { cn } from '@/lib/utils';

type RequestTab = 'all' | 'pending' | 'confirmed' | 'closed';
type AppointmentTab = 'all' | 'upcoming' | 'completed' | 'closed';
type ChangeAction = 'cancel' | 'reschedule';

interface ChangeDialogState {
  action: ChangeAction;
  appointment: AppointmentSummary;
}

function isPendingRequest(request: AppointmentRequestRecord) {
  return getAppointmentRequestStatusView(request.status).category === 'pending';
}

function getRequestsForTab(requests: AppointmentRequestRecord[], tab: RequestTab) {
  if (tab === 'all') return requests;
  return requests.filter(
    (request) => getAppointmentRequestStatusView(request.status).category === tab,
  );
}

function getAppointmentsForTab(appointments: AppointmentSummary[], tab: AppointmentTab, now: Date) {
  switch (tab) {
    case 'upcoming':
      return appointments
        .filter((appointment) => isPatientAppointmentActionable(appointment, now))
        .sort(
          (left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime(),
        );
    case 'completed':
      return appointments.filter((appointment) => appointment.status === 'COMPLETED');
    case 'closed':
      return appointments.filter(
        (appointment) => appointment.status === 'CANCELLED' || appointment.status === 'NO_SHOW',
      );
    case 'all':
    default:
      return appointments;
  }
}

function getRequestWindow(request: AppointmentRequestRecord) {
  if (request.preferredStartDate === request.preferredEndDate) {
    return formatPortalDate(request.preferredStartDate);
  }
  return `${formatPortalDate(request.preferredStartDate)} to ${formatPortalDate(
    request.preferredEndDate,
  )}`;
}

function toDateInput(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
}

function addDaysToDateInput(value: string, days: number) {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function EmptyPanel({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof FileClock;
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border/70 bg-muted/20 px-6 text-center">
      <Icon className="h-6 w-6 text-muted-foreground" />
      <div className="space-y-1">
        <p className="font-medium">{title}</p>
        <p className="max-w-md text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function AppointmentRow({
  appointment,
  pendingChangeRequest,
  onAction,
}: {
  appointment: AppointmentSummary;
  pendingChangeRequest?: AppointmentRequestRecord;
  onAction: (action: ChangeAction, appointment: AppointmentSummary) => void;
}) {
  const statusView = getAppointmentStatusView(appointment.status);
  const actionable = isPatientAppointmentActionable(appointment) && !pendingChangeRequest;

  return (
    <article className="rounded-2xl border border-border/70 bg-background/80 p-4 transition-colors hover:bg-muted/20">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant={statusView.badgeVariant}
              aria-label={`${statusView.label}: ${statusView.description}`}
              className="rounded-full"
            >
              {statusView.label}
            </Badge>
            {pendingChangeRequest ? (
              <Badge variant="warning" className="rounded-full">
                {getAppointmentRequestTypeLabel(pendingChangeRequest.requestType)} pending
              </Badge>
            ) : null}
          </div>
          <div>
            <p className="font-medium text-foreground">
              {formatPortalDateTime(appointment.startsAt)}
            </p>
            <p className="text-sm text-muted-foreground">
              Ends {formatPortalDateTime(appointment.endsAt)}
            </p>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span>Doctor: {appointment.assignedDoctor?.displayName ?? 'Unassigned'}</span>
            <span>Volunteer: {appointment.assignedVolunteer?.displayName ?? 'Unassigned'}</span>
          </div>
          {appointment.notes ? (
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">{appointment.notes}</p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row lg:flex-col">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="cursor-pointer justify-start"
            disabled={!actionable}
            onClick={() => onAction('reschedule', appointment)}
          >
            <RotateCcw className="h-4 w-4" />
            Request reschedule
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="cursor-pointer justify-start text-destructive hover:text-destructive"
            disabled={!actionable}
            onClick={() => onAction('cancel', appointment)}
          >
            <XCircle className="h-4 w-4" />
            Request cancellation
          </Button>
        </div>
      </div>
    </article>
  );
}

function RequestRow({ request }: { request: AppointmentRequestRecord }) {
  const statusView = getAppointmentRequestStatusView(request.status);
  const typeLabel = getAppointmentRequestTypeLabel(request.requestType);

  return (
    <article className="rounded-2xl border border-border/70 bg-background/80 p-4 transition-colors hover:bg-muted/20">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="rounded-full bg-card">
              {typeLabel}
            </Badge>
            <Badge
              variant={statusView.badgeVariant}
              aria-label={`${statusView.label}: ${statusView.description}`}
              className="rounded-full"
            >
              {statusView.label}
            </Badge>
          </div>
          <p className="font-medium text-foreground">
            Preferred window: {getRequestWindow(request)}
          </p>
          <p className="text-sm text-muted-foreground">
            Submitted {formatPortalDate(request.createdAt)}
          </p>
        </div>
        <p className="text-sm text-muted-foreground">
          {request.triagedAt ? `Updated ${formatPortalDate(request.triagedAt)}` : 'Awaiting review'}
        </p>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div className="space-y-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Reason
            </p>
            <p className="mt-2 text-sm">{request.reason || 'No reason provided'}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Notes
            </p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {request.notes || 'No notes were added to this request.'}
            </p>
          </div>
        </div>

        <div className="space-y-3">
          {request.sourceAppointment ? (
            <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Related appointment
              </p>
              <p className="mt-2 text-sm font-medium">
                {formatPortalDateTime(request.sourceAppointment.startsAt)}
              </p>
              <p className="text-sm text-muted-foreground">
                Status: {getAppointmentStatusView(request.sourceAppointment.status).label}
              </p>
            </div>
          ) : null}

          {request.appointment ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-emerald-700" />
                <p className="font-medium text-emerald-950">Confirmed visit</p>
              </div>
              <p className="mt-2 text-sm text-emerald-950">
                {formatPortalDateTime(request.appointment.startsAt)}
              </p>
              <p className="text-sm text-emerald-900/80">
                Ends {formatPortalDateTime(request.appointment.endsAt)}
              </p>
            </div>
          ) : null}

          {request.rejectionReason ? (
            <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-destructive">
                Clinic note
              </p>
              <p className="mt-2 text-sm text-destructive">{request.rejectionReason}</p>
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function AppointmentsPortalScreen() {
  const getToken = useAuth();
  const bootstrap = useBootstrap()?.bootstrap ?? null;
  const clinicId = getPortalClinicId(bootstrap);
  const clinicName = getPortalClinicName(bootstrap, clinicId);
  const { showToast } = useToast();

  const [requests, setRequests] = useState<AppointmentRequestRecord[]>([]);
  const [appointments, setAppointments] = useState<AppointmentSummary[]>([]);
  const [activeRequestTab, setActiveRequestTab] = useState<RequestTab>('all');
  const [activeAppointmentTab, setActiveAppointmentTab] = useState<AppointmentTab>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<unknown | null>(null);
  const [changeDialog, setChangeDialog] = useState<ChangeDialogState | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelNotes, setCancelNotes] = useState('');
  const [rescheduleStartDate, setRescheduleStartDate] = useState('');
  const [rescheduleEndDate, setRescheduleEndDate] = useState('');
  const [rescheduleReason, setRescheduleReason] = useState('');
  const [rescheduleNotes, setRescheduleNotes] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [submittingAction, setSubmittingAction] = useState(false);

  const loadAppointments = useCallback(
    async (options?: { background?: boolean }) => {
      if (!clinicId || !getToken) {
        setLoading(false);
        return;
      }

      if (options?.background) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      try {
        const [requestResponse, appointmentResponse] = await Promise.all([
          fetchAppointmentRequests(clinicId, getToken),
          fetchPatientAppointments(clinicId, getToken),
        ]);
        setRequests(requestResponse);
        setAppointments(appointmentResponse.items);
      } catch (err) {
        setError(err);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [clinicId, getToken],
  );

  useEffect(() => {
    void loadAppointments();
  }, [loadAppointments]);

  const now = useMemo(() => new Date(), [appointments, requests]);
  const pendingRequestCount = useMemo(() => requests.filter(isPendingRequest).length, [requests]);
  const upcomingCount = useMemo(
    () =>
      appointments.filter((appointment) => isPatientAppointmentActionable(appointment, now)).length,
    [appointments, now],
  );
  const completedCount = useMemo(
    () => appointments.filter((appointment) => appointment.status === 'COMPLETED').length,
    [appointments],
  );
  const closedCount = useMemo(
    () =>
      appointments.filter(
        (appointment) => appointment.status === 'CANCELLED' || appointment.status === 'NO_SHOW',
      ).length,
    [appointments],
  );
  const nextAppointment = useMemo(
    () => getNextConfirmedAppointment(appointments, now),
    [appointments, now],
  );
  const visibleRequests = useMemo(
    () => getRequestsForTab(requests, activeRequestTab),
    [activeRequestTab, requests],
  );
  const visibleAppointments = useMemo(
    () => getAppointmentsForTab(appointments, activeAppointmentTab, now),
    [activeAppointmentTab, appointments, now],
  );
  const pendingChangeRequestsByAppointment = useMemo(() => {
    const map = new Map<string, AppointmentRequestRecord>();
    for (const request of requests) {
      if (
        request.sourceAppointmentId &&
        request.requestType !== 'NEW_APPOINTMENT' &&
        isPendingRequest(request)
      ) {
        map.set(request.sourceAppointmentId, request);
      }
    }
    return map;
  }, [requests]);
  const isLinkMissing = isPortalLinkMissingError(error);
  const errorMessage = error ? getPortalErrorMessage(error) : null;

  function openChangeDialog(action: ChangeAction, appointment: AppointmentSummary) {
    setChangeDialog({ action, appointment });
    setActionError(null);
    setCancelReason('');
    setCancelNotes('');
    const startDate = toDateInput(appointment.startsAt);
    setRescheduleStartDate(startDate);
    setRescheduleEndDate(startDate ? addDaysToDateInput(startDate, 7) : '');
    setRescheduleReason('');
    setRescheduleNotes('');
  }

  function closeChangeDialog() {
    if (submittingAction) return;
    setChangeDialog(null);
    setActionError(null);
  }

  async function submitChangeRequest() {
    if (!clinicId || !getToken || !changeDialog) return;

    setActionError(null);
    setSubmittingAction(true);

    try {
      if (changeDialog.action === 'cancel') {
        const reason = cancelReason.trim();
        if (!reason) {
          setActionError('Add a cancellation reason before submitting.');
          return;
        }
        await requestPatientAppointmentCancellation(
          clinicId,
          changeDialog.appointment.id,
          getToken,
          {
            reason,
            notes: cancelNotes.trim() || undefined,
          },
        );
      } else {
        if (!rescheduleStartDate || !rescheduleEndDate) {
          setActionError('Choose a preferred start and end date.');
          return;
        }
        if (rescheduleEndDate < rescheduleStartDate) {
          setActionError('Preferred end date must be on or after the start date.');
          return;
        }
        await requestPatientAppointmentReschedule(clinicId, changeDialog.appointment.id, getToken, {
          preferredStartDate: rescheduleStartDate,
          preferredEndDate: rescheduleEndDate,
          reason: rescheduleReason.trim() || undefined,
          notes: rescheduleNotes.trim() || undefined,
        });
      }

      showToast({
        title: 'Request sent',
        description: 'Your clinic can now review this appointment request.',
        tone: 'success',
      });
      setChangeDialog(null);
      await loadAppointments({ background: true });
    } catch (err) {
      const message = getPortalErrorMessage(err);
      setActionError(message);
      showToast({
        title: 'Request could not be sent',
        description: message,
        tone: 'error',
      });
    } finally {
      setSubmittingAction(false);
    }
  }

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
        <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <Card className="overflow-hidden border-border/70 bg-card/95 shadow-sm">
            <CardHeader className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="rounded-full px-3 py-1">
                  Appointment center
                </Badge>
                {clinicName ? (
                  <Badge variant="outline" className="rounded-full bg-background/80 px-3 py-1">
                    {clinicName}
                  </Badge>
                ) : null}
              </div>
              <div className="space-y-2">
                <CardTitle className="text-2xl md:text-3xl">Appointments and requests</CardTitle>
                <CardDescription className="max-w-2xl text-sm leading-6 md:text-base">
                  Review scheduled visits, previous outcomes, and requests your clinic is triaging.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <Button asChild className="cursor-pointer">
                <Link href="/portal/appointments/request">
                  <Plus className="h-4 w-4" />
                  Request a visit
                </Link>
              </Button>
              <Button
                type="button"
                variant="outline"
                className="cursor-pointer"
                onClick={() => void loadAppointments({ background: true })}
                disabled={refreshing || loading}
              >
                <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
                Refresh
              </Button>
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/95 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Next confirmed visit</CardTitle>
              <CardDescription>
                {nextAppointment
                  ? 'Your next active appointment on the clinic schedule.'
                  : 'No future confirmed appointment is currently scheduled.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {nextAppointment ? (
                <div className="space-y-4 rounded-2xl border border-border/70 bg-background/80 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">
                        {formatPortalDateTime(nextAppointment.startsAt)}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Ends {formatPortalDateTime(nextAppointment.endsAt)}
                      </p>
                    </div>
                    <Badge variant="secondary" className="rounded-full">
                      Confirmed
                    </Badge>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full cursor-pointer justify-between"
                    onClick={() => openChangeDialog('reschedule', nextAppointment)}
                    disabled={Boolean(pendingChangeRequestsByAppointment.get(nextAppointment.id))}
                  >
                    Request a change
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 p-5 text-sm text-muted-foreground">
                  Request a visit when you need a follow-up or check-in.
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-4 md:grid-cols-4">
          <Card className="border-border/70 bg-card/95">
            <CardHeader className="space-y-3">
              <CalendarClock className="h-5 w-5 text-primary" />
              <div>
                <CardTitle className="text-2xl">{upcomingCount}</CardTitle>
                <CardDescription>Upcoming confirmed</CardDescription>
              </div>
            </CardHeader>
          </Card>
          <Card className="border-border/70 bg-card/95">
            <CardHeader className="space-y-3">
              <FileClock className="h-5 w-5 text-primary" />
              <div>
                <CardTitle className="text-2xl">{pendingRequestCount}</CardTitle>
                <CardDescription>Requests pending</CardDescription>
              </div>
            </CardHeader>
          </Card>
          <Card className="border-border/70 bg-card/95">
            <CardHeader className="space-y-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              <div>
                <CardTitle className="text-2xl">{completedCount}</CardTitle>
                <CardDescription>Completed visits</CardDescription>
              </div>
            </CardHeader>
          </Card>
          <Card className="border-border/70 bg-card/95">
            <CardHeader className="space-y-3">
              <Clock3 className="h-5 w-5 text-muted-foreground" />
              <div>
                <CardTitle className="text-2xl">{closedCount}</CardTitle>
                <CardDescription>Cancelled or no-show</CardDescription>
              </div>
            </CardHeader>
          </Card>
        </section>

        {loading ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <Card key={index} className="h-40 animate-pulse border-border/70 bg-muted/30" />
            ))}
          </div>
        ) : null}

        {error ? (
          <InlineErrorState
            title="Appointments could not load"
            description={errorMessage ?? 'Check your connection and try again.'}
            onRetry={() => void loadAppointments()}
            retryLabel="Reload appointments"
          />
        ) : null}

        {!loading && !error ? (
          <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <Card className="border-border/70 bg-card/95 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg">Confirmed appointment history</CardTitle>
                <CardDescription>
                  Scheduled visits across upcoming, completed, cancelled, and missed outcomes.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Tabs
                  value={activeAppointmentTab}
                  onValueChange={(value) => setActiveAppointmentTab(value as AppointmentTab)}
                >
                  <TabsList className="grid h-auto w-full grid-cols-2 gap-2 rounded-2xl border border-border/70 bg-background p-2 md:grid-cols-4">
                    <TabsTrigger value="all" className="rounded-xl">
                      All
                    </TabsTrigger>
                    <TabsTrigger value="upcoming" className="rounded-xl">
                      Upcoming
                    </TabsTrigger>
                    <TabsTrigger value="completed" className="rounded-xl">
                      Completed
                    </TabsTrigger>
                    <TabsTrigger value="closed" className="rounded-xl">
                      Closed
                    </TabsTrigger>
                  </TabsList>
                </Tabs>

                {visibleAppointments.length === 0 ? (
                  <EmptyPanel
                    icon={CalendarDays}
                    title="No appointments in this view"
                    description="Confirmed appointments and past outcomes will appear here after your clinic schedules them."
                  />
                ) : (
                  <div className="space-y-3">
                    {visibleAppointments.map((appointment) => (
                      <AppointmentRow
                        key={appointment.id}
                        appointment={appointment}
                        pendingChangeRequest={pendingChangeRequestsByAppointment.get(
                          appointment.id,
                        )}
                        onAction={openChangeDialog}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-border/70 bg-card/95 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg">Request history</CardTitle>
                <CardDescription>
                  New visit, cancellation, and reschedule requests your clinic can triage.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Tabs
                  value={activeRequestTab}
                  onValueChange={(value) => setActiveRequestTab(value as RequestTab)}
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
                </Tabs>

                {visibleRequests.length === 0 ? (
                  <EmptyPanel
                    icon={FileClock}
                    title="No requests in this view"
                    description="Appointment requests will appear here after you send them to your clinic."
                  />
                ) : (
                  <div className="space-y-3">
                    {visibleRequests.map((request) => (
                      <RequestRow key={request.id} request={request} />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </section>
        ) : null}
      </div>

      <Dialog
        open={changeDialog !== null}
        onOpenChange={(open) => {
          if (!open) closeChangeDialog();
        }}
      >
        <DialogContent className="max-w-xl rounded-[28px] border-border/80">
          <DialogHeader>
            <DialogTitle className="text-2xl">
              {changeDialog?.action === 'cancel' ? 'Request cancellation' : 'Request reschedule'}
            </DialogTitle>
            <DialogDescription className="leading-6">
              {changeDialog
                ? formatPortalDateTime(changeDialog.appointment.startsAt)
                : 'Appointment request'}
            </DialogDescription>
          </DialogHeader>

          {changeDialog?.action === 'cancel' ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="cancel-reason">Cancellation reason</Label>
                <Input
                  id="cancel-reason"
                  value={cancelReason}
                  onChange={(event) => setCancelReason(event.target.value)}
                  maxLength={120}
                  disabled={submittingAction}
                  placeholder="Example: I cannot attend this visit"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cancel-notes">Additional notes</Label>
                <Textarea
                  id="cancel-notes"
                  value={cancelNotes}
                  onChange={(event) => setCancelNotes(event.target.value)}
                  rows={4}
                  maxLength={2000}
                  disabled={submittingAction}
                  placeholder="Optional details for your clinic"
                />
              </div>
            </div>
          ) : null}

          {changeDialog?.action === 'reschedule' ? (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="reschedule-start">Preferred start date</Label>
                  <Input
                    id="reschedule-start"
                    type="date"
                    value={rescheduleStartDate}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      setRescheduleStartDate(nextValue);
                      if (rescheduleEndDate && rescheduleEndDate < nextValue) {
                        setRescheduleEndDate(nextValue);
                      }
                    }}
                    disabled={submittingAction}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reschedule-end">Preferred end date</Label>
                  <Input
                    id="reschedule-end"
                    type="date"
                    value={rescheduleEndDate}
                    min={rescheduleStartDate}
                    onChange={(event) => setRescheduleEndDate(event.target.value)}
                    disabled={submittingAction}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="reschedule-reason">Reason</Label>
                <Input
                  id="reschedule-reason"
                  value={rescheduleReason}
                  onChange={(event) => setRescheduleReason(event.target.value)}
                  maxLength={120}
                  disabled={submittingAction}
                  placeholder="Example: need a morning appointment"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reschedule-notes">Additional notes</Label>
                <Textarea
                  id="reschedule-notes"
                  value={rescheduleNotes}
                  onChange={(event) => setRescheduleNotes(event.target.value)}
                  rows={4}
                  maxLength={2000}
                  disabled={submittingAction}
                  placeholder="Optional availability details"
                />
              </div>
            </div>
          ) : null}

          {actionError ? (
            <div className="rounded-2xl border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {actionError}
            </div>
          ) : null}

          <DialogFooter className="mt-2 gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={closeChangeDialog}
              disabled={submittingAction}
            >
              Keep visit unchanged
            </Button>
            <Button
              type="button"
              onClick={() => void submitChangeRequest()}
              disabled={submittingAction}
              variant={changeDialog?.action === 'cancel' ? 'destructive' : 'default'}
            >
              {submittingAction ? 'Sending...' : 'Send request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </RouteGuard>
  );
}
