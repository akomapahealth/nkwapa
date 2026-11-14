'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarPlus,
  CheckCircle2,
  Inbox,
  MoreHorizontal,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import { ListSearch } from '@/components/app-shell/ListToolbar';
import { AppMetricCard, AppMetricGroup } from '@/components/app-shell/AppMetricCard';
import { AppointmentRequestStatusBadge } from '@/components/appointments/AppointmentStatusBadge';
import { InlineErrorState, SectionSkeleton } from '@/components/feedback/AppState';
import { EmptyStateCard } from '@/components/ops/OpsShared';
import {
  RecordSection,
  RecordSectionDescription,
  RecordSectionHeader,
  RecordSectionTitle,
} from '@/components/patients/RecordSection';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { focusField } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import {
  describeTimeEntryZone,
  fromClinicDateTimeLocal,
  getAppointmentRequestTypeLabel,
  toClinicDateTimeLocal,
} from '@/lib/appointment-status';
import type { GetToken } from '@/lib/api';
import { formatOpsDate, formatOpsDateTime } from '@/lib/ops';
import {
  confirmStaffAppointmentRequest,
  fetchStaffAppointmentRequests,
  getPortalErrorMessage,
  rejectStaffAppointmentRequest,
  type AppointmentRequestRecord,
  type AppointmentStaffOptionsResponse,
} from '@/lib/patient-portal';
import { cn } from '@/lib/utils';

/**
 * The requests patients have sent, and the two decisions staff can make about them.
 *
 * Until this existed a patient could ask for a visit, a different time, or a cancellation, and no
 * screen in the product could see it. The API had implemented all three since Appointment V2
 * shipped; only the staff half of the conversation was missing.
 */

type TriageAction = 'confirm' | 'reject';

interface TriageDialogState {
  action: TriageAction;
  request: AppointmentRequestRecord;
}

const UNASSIGNED = 'UNASSIGNED';

/** Open the confirm dialog on the patient's preferred window rather than on an empty form. */
function defaultSlotFor(request: AppointmentRequestRecord, timezone: string) {
  const day = toClinicDateTimeLocal(request.preferredStartDate, timezone).slice(0, 10);
  const start = day ? fromClinicDateTimeLocal(`${day}T09:00`, timezone) : null;
  if (!start) return { startsAt: '', endsAt: '' };
  return {
    startsAt: `${day}T09:00`,
    endsAt: toClinicDateTimeLocal(
      new Date(Date.parse(start) + 30 * 60_000).toISOString(),
      timezone,
    ),
  };
}

function requestWindow(request: AppointmentRequestRecord, timezone: string) {
  const from = formatOpsDate(request.preferredStartDate, timezone);
  const to = formatOpsDate(request.preferredEndDate, timezone);
  return from === to ? from : `${from} to ${to}`;
}

export function AppointmentRequestsPanel({
  clinicId,
  getToken,
  canManage,
  staffOptions,
  timezone,
  onRequestResolved,
}: {
  clinicId: string | null;
  getToken: GetToken | null | undefined;
  canManage: boolean;
  staffOptions: AppointmentStaffOptionsResponse;
  timezone: string;
  /** Confirming a request creates an appointment, so the schedule beside this must reload. */
  onRequestResolved: () => void | Promise<void>;
}) {
  const { showToast } = useToast();
  const [query, setQuery] = useState('');
  const dialogReturnFocus = useRef<HTMLButtonElement | null>(null);
  const [requests, setRequests] = useState<AppointmentRequestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<unknown | null>(null);
  const [dialog, setDialog] = useState<TriageDialogState | null>(null);
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [doctorId, setDoctorId] = useState(UNASSIGNED);
  const [volunteerId, setVolunteerId] = useState(UNASSIGNED);
  const [notes, setNotes] = useState('');
  const [reason, setReason] = useState('');
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(
    async (options?: { background?: boolean }) => {
      if (!clinicId || !getToken) {
        setLoading(false);
        return;
      }
      if (options?.background) setRefreshing(true);
      else setLoading(true);
      setError(null);

      try {
        setRequests(await fetchStaffAppointmentRequests(clinicId, getToken));
      } catch (err) {
        setError(err);
        setRequests([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [clinicId, getToken],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // Only the requests still awaiting a decision. The rest are history the portal already shows.
  const pending = useMemo(
    () => requests.filter((request) => ['REQUESTED', 'TRIAGED'].includes(request.status)),
    [requests],
  );

  const visibleRequests = pending.filter((request) =>
    `${patientName(request)} ${request.patient?.patientCode ?? ''}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );

  function openDialog(action: TriageAction, request: AppointmentRequestRecord) {
    if (action === 'confirm') dialogReturnFocus.current = null;
    const slot = defaultSlotFor(request, timezone);
    setDialog({ action, request });
    setStartsAt(slot.startsAt);
    setEndsAt(slot.endsAt);
    setDoctorId(UNASSIGNED);
    setVolunteerId(UNASSIGNED);
    setNotes('');
    setReason('');
    setDialogError(null);
  }

  function closeDialog() {
    if (submitting) return;
    setDialog(null);
    setDialogError(null);
  }

  async function submit() {
    if (!clinicId || !getToken || !dialog) return;
    const { action, request } = dialog;
    setDialogError(null);

    try {
      setSubmitting(true);
      if (action === 'confirm') {
        const start = fromClinicDateTimeLocal(startsAt, timezone);
        const end = fromClinicDateTimeLocal(endsAt, timezone);
        if (!start || !end) {
          setDialogError('Choose valid start and end times.');
          focusField(start ? 'confirm-ends-at' : 'confirm-starts-at');
          return;
        }
        if (new Date(end) <= new Date(start)) {
          setDialogError('End time must be after start time.');
          focusField('confirm-ends-at');
          return;
        }
        await confirmStaffAppointmentRequest(clinicId, request.id, getToken, {
          startsAt: start,
          endsAt: end,
          assignedDoctorId: doctorId === UNASSIGNED ? undefined : doctorId,
          assignedVolunteerId: volunteerId === UNASSIGNED ? undefined : volunteerId,
          notes: notes.trim() || undefined,
        });
      } else {
        const trimmed = reason.trim();
        if (!trimmed) {
          setDialogError('Add a reason so the patient knows why.');
          focusField('reject-reason');
          return;
        }
        await rejectStaffAppointmentRequest(clinicId, request.id, getToken, { reason: trimmed });
      }

      showToast({
        title:
          action === 'confirm'
            ? `Appointment booked for ${patientName(request)}`
            : 'Request declined',
        description:
          action === 'confirm'
            ? 'The patient can see the confirmed visit, and a reminder is scheduled.'
            : 'The patient can see the reason on their request history.',
        tone: 'success',
      });
      setDialog(null);
      await Promise.all([load({ background: true }), onRequestResolved()]);
    } catch (err) {
      const message = getPortalErrorMessage(err);
      setDialogError(message);
      showToast({ title: 'Request update failed', description: message, tone: 'error' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <RecordSection>
      <RecordSectionHeader className="flex flex-row items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <RecordSectionTitle id="patient-requests-title" className="flex items-center gap-2">
            <Inbox className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            Patient requests
          </RecordSectionTitle>
          <RecordSectionDescription>
            {canManage
              ? 'Confirm to book the visit and its reminder, or decline with a reason the patient sees.'
              : 'Requests patients have sent this clinic. Acting on them requires appointment write access.'}
          </RecordSectionDescription>
        </div>
        <Button
          type="button"
          variant="outline"
          className="shrink-0 cursor-pointer"
          onClick={() => void load({ background: true })}
          disabled={loading || refreshing}
        >
          <RefreshCw
            className={cn('h-4 w-4', refreshing && 'animate-spin motion-reduce:animate-none')}
            aria-hidden="true"
          />
          <span className="sr-only compact:not-sr-only">Refresh requests</span>
        </Button>
      </RecordSectionHeader>
      <div className="space-y-3 pb-2">
        <AppMetricGroup variant="strip">
          <AppMetricCard
            title="Awaiting a decision"
            value={loading || error ? '…' : pending.length}
            icon={Inbox}
            detail="Patient requests still awaiting a clinic decision."
          />
        </AppMetricGroup>
        <ListSearch
          id="appointment-request-search"
          label="Search patient requests"
          placeholder="Patient name or code"
          value={query}
          onChange={setQuery}
        />
        <div aria-live="polite" aria-busy={loading || refreshing}>
          {loading ? (
            <SectionSkeleton lines={3} />
          ) : error ? (
            <InlineErrorState
              title="We couldn't load patient requests"
              description={getPortalErrorMessage(error)}
              onRetry={() => void load()}
              retryLabel="Try again"
            />
          ) : pending.length === 0 ? (
            <EmptyStateCard
              icon={<Inbox className="h-5 w-5" aria-hidden="true" />}
              title="No requests waiting"
              description="New visit, reschedule, and cancellation requests from patients appear here as soon as they are sent."
            />
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                {visibleRequests.length === 0
                  ? 'No requests match this search.'
                  : query.trim()
                    ? `Showing ${visibleRequests.length} of ${pending.length}`
                    : ''}
              </p>
              <ul>
                {visibleRequests.map((request) => (
                  <li key={request.id} className="border-t border-border py-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          <span className="font-medium text-foreground">
                            {getAppointmentRequestTypeLabel(request.requestType)}
                          </span>
                          <AppointmentRequestStatusBadge status={request.status} />
                        </div>
                        <p className="text-base font-medium text-foreground [overflow-wrap:anywhere]">
                          {patientName(request)}
                          {request.patient?.patientCode ? (
                            <span className="ml-2 text-sm font-normal text-muted-foreground">
                              {request.patient.patientCode}
                            </span>
                          ) : null}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Preferred window: {requestWindow(request, timezone)}
                        </p>
                        {request.sourceAppointment ? (
                          <p className="text-sm text-muted-foreground">
                            About the visit on{' '}
                            {formatOpsDateTime(request.sourceAppointment.startsAt, timezone)}
                          </p>
                        ) : null}
                        {request.reason ? (
                          <p className="border-l-2 border-border pl-3 text-sm text-foreground">
                            {request.reason}
                          </p>
                        ) : null}
                      </div>
                      {canManage ? (
                        <div className="flex shrink-0 flex-wrap gap-2">
                          <Button
                            type="button"
                            className="cursor-pointer"
                            onClick={() => openDialog('confirm', request)}
                          >
                            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                            Confirm request
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={`More actions for ${patientName(request)}`}
                                onPointerDownCapture={(event) => {
                                  dialogReturnFocus.current = event.currentTarget;
                                }}
                                onKeyDownCapture={(event) => {
                                  dialogReturnFocus.current = event.currentTarget;
                                }}
                              >
                                <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onSelect={() => setTimeout(() => openDialog('reject', request), 0)}
                                className="text-destructive"
                              >
                                Decline
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      ) : (
                        <span className="shrink-0 text-xs font-medium text-muted-foreground">
                          Read-only
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>

      <Dialog open={Boolean(dialog)} onOpenChange={(open) => (!open ? closeDialog() : undefined)}>
        <DialogContent
          variant="form"
          className="max-w-lg rounded-lg"
          onCloseAutoFocus={(event) => {
            const trigger = dialogReturnFocus.current;
            dialogReturnFocus.current = null;
            if (trigger?.isConnected) {
              event.preventDefault();
              trigger.focus({ preventScroll: true });
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {dialog?.action === 'confirm' ? 'Confirm request' : 'Decline request'}
            </DialogTitle>
            <DialogDescription>
              {dialog?.action === 'confirm'
                ? 'Booking the visit schedules a reminder and shows the patient the exact time.'
                : 'The patient sees this reason on their request history, so write it for them.'}
            </DialogDescription>
          </DialogHeader>

          {dialog ? (
            <div className="space-y-4">
              {dialogError ? (
                <p
                  id="triage-dialog-error"
                  role="alert"
                  className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive-ink"
                >
                  {dialogError}
                </p>
              ) : null}

              <p className="border-y border-border py-3 text-sm text-foreground">
                {requestSummary(dialog.request, timezone)}
              </p>

              {dialog.action === 'confirm' ? (
                <>
                  <fieldset className="space-y-2">
                    <legend className="text-sm font-semibold text-foreground">Visit time</legend>
                    <p id="confirm-zone" className="text-sm text-muted-foreground">
                      {describeTimeEntryZone(timezone)}
                    </p>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="confirm-starts-at">Start time</Label>
                        <Input
                          id="confirm-starts-at"
                          type="datetime-local"
                          value={startsAt}
                          onChange={(event) => setStartsAt(event.target.value)}
                          aria-describedby={
                            dialogError ? 'confirm-zone triage-dialog-error' : 'confirm-zone'
                          }
                          aria-invalid={Boolean(dialogError)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="confirm-ends-at">End time</Label>
                        <Input
                          id="confirm-ends-at"
                          type="datetime-local"
                          value={endsAt}
                          onChange={(event) => setEndsAt(event.target.value)}
                          aria-describedby={
                            dialogError ? 'confirm-zone triage-dialog-error' : 'confirm-zone'
                          }
                          aria-invalid={Boolean(dialogError)}
                        />
                      </div>
                    </div>
                  </fieldset>
                  <fieldset className="space-y-2">
                    <legend className="text-sm font-semibold text-foreground">Care team</legend>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="confirm-doctor">Doctor</Label>
                        <Select value={doctorId} onValueChange={setDoctorId}>
                          <SelectTrigger id="confirm-doctor">
                            <SelectValue placeholder="Unassigned" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                            {staffOptions.doctors.map((option) => (
                              <SelectItem key={option.id} value={option.id}>
                                {option.displayName}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="confirm-volunteer">Volunteer</Label>
                        <Select value={volunteerId} onValueChange={setVolunteerId}>
                          <SelectTrigger id="confirm-volunteer">
                            <SelectValue placeholder="Unassigned" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                            {staffOptions.volunteers.map((option) => (
                              <SelectItem key={option.id} value={option.id}>
                                {option.displayName}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </fieldset>
                  <div className="space-y-2">
                    <Label htmlFor="confirm-notes">Visit notes</Label>
                    <Textarea
                      id="confirm-notes"
                      rows={3}
                      maxLength={2000}
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                      placeholder="Anything the clinical team should know before the visit."
                    />
                  </div>
                </>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="reject-reason">Reason</Label>
                  <Textarea
                    id="reject-reason"
                    rows={3}
                    maxLength={2000}
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder="For example: no capacity that week, please request another date."
                    aria-describedby={dialogError ? 'triage-dialog-error' : undefined}
                    aria-invalid={Boolean(dialogError)}
                  />
                </div>
              )}
            </div>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="cursor-pointer"
              onClick={closeDialog}
              disabled={submitting}
            >
              Keep waiting
            </Button>
            <Button
              type="button"
              className="cursor-pointer"
              onClick={() => void submit()}
              disabled={submitting}
            >
              {dialog?.action === 'confirm' ? (
                <CalendarPlus className="h-4 w-4" aria-hidden="true" />
              ) : (
                <XCircle className="h-4 w-4" aria-hidden="true" />
              )}
              {submitting
                ? 'Saving...'
                : dialog?.action === 'confirm'
                  ? 'Book appointment'
                  : 'Decline request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </RecordSection>
  );
}

/** Staff see the patient's name; the portal's own view of a request never carries one. */
function patientName(request: AppointmentRequestRecord) {
  if (!request.patient) return 'A patient';
  return `${request.patient.firstName} ${request.patient.lastName}`.trim() || 'A patient';
}

function requestSummary(request: AppointmentRequestRecord, timezone: string) {
  const who = patientName(request);
  const what = getAppointmentRequestTypeLabel(request.requestType).toLowerCase();
  return `${who} sent a ${what} for ${requestWindow(request, timezone)}.`;
}
