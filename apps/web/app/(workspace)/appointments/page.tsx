'use client';

import { useSync } from '@/app/ServiceWorkerAndSyncProvider';
import { StaleDataNotice } from '@/components/feedback/StaleDataNotice';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Ban,
  BellRing,
  CalendarClock,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Clock3,
  MoreHorizontal,
  RefreshCw,
  Search,
  UserRound,
  UserX,
} from 'lucide-react';
import { ActiveFilterSummary } from '@/components/app-shell/ActiveFilterSummary';
import { AppMetricCard, AppMetricGroup } from '@/components/app-shell/AppMetricCard';
import { AppPageHeader } from '@/components/app-shell/AppPageHeader';
import { SegmentedControl } from '@/components/app-shell/SegmentedControl';
import { InlineErrorState, SectionSkeleton } from '@/components/feedback/AppState';
import { EmptyStateCard } from '@/components/ops/OpsShared';
import {
  RecordSection,
  RecordSectionDescription,
  RecordSectionHeader,
  RecordSectionTitle,
} from '@/components/patients/RecordSection';
import { RouteGuard } from '@/components/RouteGuard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { useAuth } from '@/lib/auth-context';
import { getActiveBootstrapClinic, getBootstrapActiveClinicId } from '@/lib/bootstrap-clinics';
import { useBootstrap } from '@/lib/bootstrap-context';
import { cn } from '@/lib/utils';
import { AppointmentRequestsPanel } from '@/components/appointments/AppointmentRequestsPanel';
import { AppointmentStatusBadge } from '@/components/appointments/AppointmentStatusBadge';
import {
  describeCancellation,
  describeTimeEntryZone,
  fromClinicDateTimeLocal,
  nextConfirmedAppointment,
  toClinicDateTimeLocal,
  getAppointmentActionLabel as getActionLabel,
  getAppointmentStatusFilterLabel as getStatusLabel,
} from '@/lib/appointment-status';
import {
  cancelStaffAppointment,
  completeStaffAppointment,
  fetchAppointmentStaffOptions,
  fetchStaffAppointments,
  getPortalErrorMessage,
  markStaffAppointmentNoShow,
  rescheduleStaffAppointment,
  type AppointmentStaffOptionsResponse,
  type StaffAppointmentRecord,
  type StaffAppointmentStatus,
  type StaffAppointmentsResponse,
} from '@/lib/patient-portal';
import {
  OPS_DEFAULT_TIMEZONE,
  formatOpsDate,
  formatOpsDateTime,
  formatOpsTime,
  getTodayInTimeZone,
  hasPermission,
} from '@/lib/ops';

type ViewMode = 'day' | 'week';
type StatusFilter = 'ALL' | StaffAppointmentStatus;
type LifecycleAction = 'reschedule' | 'cancel' | 'complete' | 'no-show';

interface LifecycleDialogState {
  action: LifecycleAction;
  appointment: StaffAppointmentRecord;
}

const STATUS_FILTERS: StatusFilter[] = ['ALL', 'CONFIRMED', 'COMPLETED', 'NO_SHOW', 'CANCELLED'];

const EMPTY_STAFF_OPTIONS: AppointmentStaffOptionsResponse = {
  doctors: [],
  volunteers: [],
};

function parseDateInput(date: string) {
  return new Date(`${date}T00:00:00.000Z`);
}

function formatDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: string, days: number) {
  const next = parseDateInput(date);
  next.setUTCDate(next.getUTCDate() + days);
  return formatDateInput(next);
}

function getWeekStart(date: string) {
  const parsed = parseDateInput(date);
  const day = parsed.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  parsed.setUTCDate(parsed.getUTCDate() + diff);
  return formatDateInput(parsed);
}

function getDateKey(value: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value));
  const values = Object.fromEntries(
    parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]),
  ) as Record<'year' | 'month' | 'day', string>;
  return `${values.year}-${values.month}-${values.day}`;
}

function getRangeForView(selectedDate: string, viewMode: ViewMode) {
  if (viewMode === 'day') {
    return {
      from: selectedDate,
      to: selectedDate,
    };
  }

  const from = getWeekStart(selectedDate);
  return {
    from,
    to: addDays(from, 6),
  };
}

function staffName(staff: StaffAppointmentRecord['assignedDoctor']) {
  return staff?.displayName ?? (staff?.id ? 'Assigned staff' : 'Unassigned');
}

function formatReminderFailure(reason: string | null) {
  if (!reason) return null;
  return reason
    .split(':')[0]
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/^\w/, (letter) => letter.toUpperCase());
}

function AppointmentReminderStatus({
  appointment,
  timezone,
}: {
  appointment: StaffAppointmentRecord;
  timezone: string;
}) {
  const summary = appointment.reminderSummary;
  if (!summary || summary.total === 0) {
    return (
      <Badge variant="outline" className="w-fit gap-1">
        <BellRing className="h-3.5 w-3.5" />
        No reminders
      </Badge>
    );
  }

  const label = summary.failed
    ? (formatReminderFailure(summary.latestFailureReason) ?? 'Reminder failed')
    : summary.queued && summary.nextQueuedAt
      ? `Queued ${formatOpsDateTime(summary.nextQueuedAt, timezone)}`
      : summary.delivered
        ? `${summary.delivered} delivered`
        : summary.sent
          ? `${summary.sent} sent`
          : `${summary.total} tracked`;
  const variant: 'destructive' | 'secondary' | 'finalized' = summary.failed
    ? 'destructive'
    : summary.queued
      ? 'secondary'
      : 'finalized';

  return (
    <div className="flex flex-col gap-1">
      <Badge variant={variant} className="w-fit gap-1">
        <BellRing className="h-3.5 w-3.5" />
        {label}
      </Badge>
      {summary.channels.length ? (
        <span className="text-xs text-muted-foreground">{summary.channels.join(' + ')}</span>
      ) : null}
    </div>
  );
}

function groupAppointmentsByDay(
  items: StaffAppointmentRecord[],
  range: { from: string; to: string },
  timeZone: string,
) {
  const groups = new Map<string, StaffAppointmentRecord[]>();
  let cursor = range.from;
  while (cursor <= range.to) {
    groups.set(cursor, []);
    cursor = addDays(cursor, 1);
  }

  for (const item of items) {
    const key = getDateKey(item.startsAt, timeZone);
    const bucket = groups.get(key) ?? [];
    bucket.push(item);
    groups.set(key, bucket);
  }

  return [...groups.entries()];
}

function AppointmentActions({
  appointment,
  canManage,
  disabled,
  onAction,
}: {
  appointment: StaffAppointmentRecord;
  canManage: boolean;
  disabled?: boolean;
  onAction: (action: LifecycleAction, appointment: StaffAppointmentRecord) => void;
}) {
  if (appointment.status !== 'CONFIRMED') {
    return (
      <span className="text-xs font-medium text-muted-foreground">
        {getStatusLabel(appointment.status)}
      </span>
    );
  }

  if (!canManage) {
    return <span className="text-xs font-medium text-muted-foreground">Read-only</span>;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="w-11 cursor-pointer rounded-full"
          disabled={disabled}
        >
          <MoreHorizontal className="h-4 w-4" />
          <span className="sr-only">Open appointment actions</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 rounded-lg border-border/80">
        <DropdownMenuLabel>Lifecycle actions</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="cursor-pointer"
          onSelect={() => onAction('reschedule', appointment)}
        >
          <CalendarClock className="h-4 w-4" />
          Reschedule
        </DropdownMenuItem>
        <DropdownMenuItem
          className="cursor-pointer"
          onSelect={() => onAction('complete', appointment)}
        >
          <CheckCircle2 className="h-4 w-4" />
          Complete
        </DropdownMenuItem>
        <DropdownMenuItem
          className="cursor-pointer"
          onSelect={() => onAction('no-show', appointment)}
        >
          <UserX className="h-4 w-4" />
          Mark no-show
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="cursor-pointer text-destructive focus:text-destructive"
          onSelect={() => onAction('cancel', appointment)}
        >
          <Ban className="h-4 w-4" />
          Cancel appointment
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AppointmentTime({
  appointment,
  timezone,
}: {
  appointment: StaffAppointmentRecord;
  timezone: string;
}) {
  // A cancelled visit keeps its slot visible, struck through beside its status label.
  return (
    <span
      className={cn(
        'tabular-nums',
        appointment.status === 'CANCELLED' && 'text-muted-foreground line-through',
      )}
    >
      {formatOpsTime(appointment.startsAt, timezone)} to{' '}
      {formatOpsTime(appointment.endsAt, timezone)}
    </span>
  );
}

function AppointmentCancellationNote({
  appointment,
  timezone,
}: {
  appointment: StaffAppointmentRecord;
  timezone: string;
}) {
  if (appointment.status !== 'CANCELLED' || !appointment.cancellation) return null;
  return (
    <p className="mt-1 text-sm text-muted-foreground">
      {describeCancellation(appointment.cancellation, timezone)}
    </p>
  );
}

function AppointmentRow({
  appointment,
  timezone,
  canManage,
  disabled,
  onAction,
}: {
  appointment: StaffAppointmentRecord;
  timezone: string;
  canManage: boolean;
  disabled?: boolean;
  onAction: (action: LifecycleAction, appointment: StaffAppointmentRecord) => void;
}) {
  return (
    <li className="border-t border-border py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">
            <AppointmentTime appointment={appointment} timezone={timezone} />
          </p>
          <p className="mt-1 text-base font-medium text-foreground [overflow-wrap:anywhere]">
            {appointment.patient.displayName}
          </p>
          <p className="text-sm text-muted-foreground">{appointment.patient.patientCode}</p>
        </div>
        <AppointmentStatusBadge status={appointment.status} />
      </div>
      <AppointmentCancellationNote appointment={appointment} timezone={timezone} />
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Doctor</dt>
        <dd className="text-foreground">{staffName(appointment.assignedDoctor)}</dd>
        <dt className="text-muted-foreground">Volunteer</dt>
        <dd className="text-foreground">{staffName(appointment.assignedVolunteer)}</dd>
        <dt className="text-muted-foreground">Reminders</dt>
        <dd>
          <AppointmentReminderStatus appointment={appointment} timezone={timezone} />
        </dd>
      </dl>
      {appointment.notes ? (
        <p className="mt-3 text-sm text-muted-foreground">{appointment.notes}</p>
      ) : null}
      <div className="mt-2 flex justify-end">
        <AppointmentActions
          appointment={appointment}
          canManage={canManage}
          disabled={disabled}
          onAction={onAction}
        />
      </div>
    </li>
  );
}

/** The week as seven days with their counts; choosing one opens that day. */
function WeekStrip({
  days,
  today,
  onOpenDay,
}: {
  days: Array<[string, StaffAppointmentRecord[]]>;
  today: string;
  onOpenDay: (date: string) => void;
}) {
  return (
    <nav aria-label="Days in this week" className="border-t border-border py-3">
      <ol className="grid grid-cols-7 gap-1">
        {days.map(([date, appointments]) => {
          const day = parseDateInput(date);
          const weekday = day.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' });
          const count = appointments.length;
          return (
            <li key={date}>
              <button
                type="button"
                onClick={() => onOpenDay(date)}
                aria-current={date === today ? 'date' : undefined}
                className={cn(
                  'flex min-h-11 w-full cursor-pointer flex-col items-center rounded-md px-1 py-2 text-center hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  date === today && 'bg-muted/60 font-semibold',
                )}
              >
                <span className="text-xs text-muted-foreground">{weekday}</span>
                <span className="text-sm text-foreground">{day.getUTCDate()}</span>
                <span
                  className={cn(
                    'text-xs tabular-nums',
                    count ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {count}
                  <span className="sr-only">
                    {' '}
                    appointment{count === 1 ? '' : 's'}
                    {date === today ? ', today' : ''}. Open this day.
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export default function StaffAppointmentsPage() {
  const bootstrapCtx = useBootstrap();
  const bootstrap = bootstrapCtx?.bootstrap ?? null;
  const getToken = useAuth();
  const { isOnline } = useSync();
  const { showToast } = useToast();
  const clinicId = bootstrapCtx?.activeClinicId ?? getBootstrapActiveClinicId(bootstrap);
  const activeClinic = getActiveBootstrapClinic(bootstrap, clinicId);

  const [viewMode, setViewMode] = useState<ViewMode>('day');
  const [selectedDate, setSelectedDate] = useState(() => getTodayInTimeZone());
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [doctorFilter, setDoctorFilter] = useState('ALL');
  const [volunteerFilter, setVolunteerFilter] = useState('ALL');
  const [patientSearch, setPatientSearch] = useState('');
  const [debouncedPatientSearch, setDebouncedPatientSearch] = useState('');
  const [appointmentsData, setAppointmentsData] = useState<StaffAppointmentsResponse | null>(null);
  const [staffOptions, setStaffOptions] =
    useState<AppointmentStaffOptionsResponse>(EMPTY_STAFF_OPTIONS);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<unknown | null>(null);
  const [lifecycleDialog, setLifecycleDialog] = useState<LifecycleDialogState | null>(null);
  const [rescheduleStartsAt, setRescheduleStartsAt] = useState('');
  const [rescheduleEndsAt, setRescheduleEndsAt] = useState('');
  const [lifecycleReason, setLifecycleReason] = useState('');
  const [lifecycleNotes, setLifecycleNotes] = useState('');
  const [lifecycleError, setLifecycleError] = useState<string | null>(null);
  const [lifecycleSubmitting, setLifecycleSubmitting] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedPatientSearch(patientSearch.trim());
    }, 300);
    return () => window.clearTimeout(timer);
  }, [patientSearch]);

  const range = useMemo(() => getRangeForView(selectedDate, viewMode), [selectedDate, viewMode]);

  const loadSchedule = useCallback(
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
        const [appointments, staff] = await Promise.all([
          fetchStaffAppointments(clinicId, getToken, {
            from: range.from,
            to: range.to,
            status: statusFilter === 'ALL' ? undefined : statusFilter,
            assignedDoctorId: doctorFilter === 'ALL' ? undefined : doctorFilter,
            assignedVolunteerId: volunteerFilter === 'ALL' ? undefined : volunteerFilter,
            patientSearch: debouncedPatientSearch || undefined,
          }),
          fetchAppointmentStaffOptions(clinicId, getToken),
        ]);
        setAppointmentsData(appointments);
        setStaffOptions(staff);
      } catch (err) {
        setError(err);
        setAppointmentsData(null);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [
      clinicId,
      debouncedPatientSearch,
      doctorFilter,
      getToken,
      range.from,
      range.to,
      statusFilter,
      volunteerFilter,
    ],
  );

  useEffect(() => {
    void loadSchedule();
  }, [loadSchedule]);

  const timezone = appointmentsData?.timezone ?? OPS_DEFAULT_TIMEZONE;
  const items = useMemo(() => appointmentsData?.items ?? [], [appointmentsData?.items]);
  const summary = appointmentsData?.summary ?? {
    total: 0,
    confirmed: 0,
    cancelled: 0,
    completed: 0,
    noShow: 0,
  };
  const groupedAppointments = useMemo(
    () => groupAppointmentsByDay(items, range, timezone),
    [items, range, timezone],
  );
  const nextAppointment = nextConfirmedAppointment(items);
  const canManageAppointments = hasPermission(
    bootstrap?.effectivePermissionsForActiveClinic ?? [],
    'APPOINTMENT.WRITE',
  );
  const rangeLabel =
    range.from === range.to
      ? formatOpsDate(range.from, timezone)
      : `${formatOpsDate(range.from, timezone)} to ${formatOpsDate(range.to, timezone)}`;

  function shiftRange(direction: -1 | 1) {
    setSelectedDate((current) => addDays(current, direction * (viewMode === 'day' ? 1 : 7)));
  }

  function openLifecycleDialog(action: LifecycleAction, appointment: StaffAppointmentRecord) {
    setLifecycleDialog({ action, appointment });
    setRescheduleStartsAt(toClinicDateTimeLocal(appointment.startsAt, timezone));
    setRescheduleEndsAt(toClinicDateTimeLocal(appointment.endsAt, timezone));
    setLifecycleReason('');
    setLifecycleNotes(appointment.notes ?? '');
    setLifecycleError(null);
  }

  function closeLifecycleDialog() {
    if (lifecycleSubmitting) {
      return;
    }
    setLifecycleDialog(null);
    setLifecycleError(null);
  }

  async function submitLifecycleAction() {
    if (!clinicId || !getToken || !lifecycleDialog) {
      return;
    }

    const { action, appointment } = lifecycleDialog;
    setLifecycleError(null);

    try {
      setLifecycleSubmitting(true);
      if (action === 'reschedule') {
        const startsAt = fromClinicDateTimeLocal(rescheduleStartsAt, timezone);
        const endsAt = fromClinicDateTimeLocal(rescheduleEndsAt, timezone);
        if (!startsAt || !endsAt) {
          setLifecycleError('Choose valid start and end times.');
          focusField(startsAt ? 'reschedule-ends-at' : 'reschedule-starts-at');
          return;
        }
        if (new Date(endsAt) <= new Date(startsAt)) {
          setLifecycleError('End time must be after start time.');
          focusField('reschedule-ends-at');
          return;
        }
        await rescheduleStaffAppointment(clinicId, appointment.id, getToken, {
          startsAt,
          endsAt,
          notes: lifecycleNotes.trim() || undefined,
        });
      } else if (action === 'cancel') {
        const reason = lifecycleReason.trim();
        if (!reason) {
          setLifecycleError('Add a cancellation reason before continuing.');
          focusField('lifecycle-reason');
          return;
        }
        await cancelStaffAppointment(clinicId, appointment.id, getToken, { reason });
      } else if (action === 'complete') {
        await completeStaffAppointment(clinicId, appointment.id, getToken, {
          notes: lifecycleNotes.trim() || undefined,
        });
      } else {
        await markStaffAppointmentNoShow(clinicId, appointment.id, getToken, {
          reason: lifecycleReason.trim() || undefined,
        });
      }

      showToast({
        title: `${appointment.patient.displayName} updated`,
        description: `${getActionLabel(action)} completed successfully.`,
        tone: 'success',
      });
      setLifecycleDialog(null);
      await loadSchedule({ background: true });
    } catch (err) {
      const message = getPortalErrorMessage(err);
      setLifecycleError(message);
      showToast({
        title: 'Appointment update failed',
        description: message,
        tone: 'error',
      });
    } finally {
      setLifecycleSubmitting(false);
    }
  }

  const today = getTodayInTimeZone(timezone);
  const filtersBusy = loading || refreshing;

  return (
    <RouteGuard requiredPermission="APPOINTMENT.READ">
      <div className="space-y-8">
        <AppPageHeader
          title="Appointments"
          description="Requests from patients come first, then the schedule by day or week."
          hint={
            canManageAppointments
              ? 'Use lifecycle actions on confirmed appointments to reschedule, cancel, complete, or reconcile no-shows.'
              : 'Schedule actions require appointment write access.'
          }
          actions={
            <Button
              type="button"
              variant="outline"
              className="cursor-pointer"
              onClick={() => void loadSchedule({ background: true })}
              disabled={filtersBusy}
            >
              <RefreshCw
                className={cn('h-4 w-4', refreshing && 'animate-spin motion-reduce:animate-none')}
                aria-hidden="true"
              />
              <span className="sr-only compact:not-sr-only">Refresh</span>
            </Button>
          }
        />

        <AppointmentRequestsPanel
          clinicId={clinicId}
          getToken={getToken}
          canManage={canManageAppointments}
          staffOptions={staffOptions}
          timezone={timezone}
          onRequestResolved={() => loadSchedule({ background: true })}
        />

        <RecordSection aria-labelledby="appointment-range-title">
          <RecordSectionHeader className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-1.5">
              <p className="text-sm text-muted-foreground">
                {viewMode === 'day' ? 'Day schedule' : 'Week schedule'}
              </p>
              <RecordSectionTitle id="appointment-range-title">{rangeLabel}</RecordSectionTitle>
              <RecordSectionDescription>
                Times in {timezone}
                {activeClinic ? ` at ${activeClinic.clinicName}` : ''}.
              </RecordSectionDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="w-11 cursor-pointer"
                onClick={() => shiftRange(-1)}
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                <span className="sr-only">Previous range</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                className="cursor-pointer"
                onClick={() => setSelectedDate(getTodayInTimeZone())}
              >
                Today
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="w-11 cursor-pointer"
                onClick={() => shiftRange(1)}
              >
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
                <span className="sr-only">Next range</span>
              </Button>
              <SegmentedControl
                label="Schedule range"
                value={viewMode}
                onChange={setViewMode}
                className="w-[260px]"
                options={[
                  { value: 'day', label: 'Day', description: 'Show one day of appointments.' },
                  { value: 'week', label: 'Week', description: 'Show one week of appointments.' },
                ]}
              />
            </div>
          </RecordSectionHeader>

          {viewMode === 'week' && !loading && !error ? (
            <WeekStrip
              days={groupedAppointments}
              today={today}
              onOpenDay={(date) => {
                setSelectedDate(date);
                setViewMode('day');
              }}
            />
          ) : null}

          <div className="grid gap-4 border-t border-border py-4 md:grid-cols-2 xl:grid-cols-5">
            <div className="space-y-2">
              <Label htmlFor="appointment-date">Go to date</Label>
              <Input
                id="appointment-date"
                type="date"
                value={selectedDate}
                onChange={(event) => setSelectedDate(event.target.value || getTodayInTimeZone())}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="appointment-status">Status</Label>
              <Select
                value={statusFilter}
                onValueChange={(value) => setStatusFilter(value as StatusFilter)}
              >
                <SelectTrigger id="appointment-status">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_FILTERS.map((status) => (
                    <SelectItem key={status} value={status}>
                      {getStatusLabel(status)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="appointment-doctor">Doctor</Label>
              <Select value={doctorFilter} onValueChange={setDoctorFilter}>
                <SelectTrigger id="appointment-doctor">
                  <SelectValue placeholder="All doctors" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All doctors</SelectItem>
                  {staffOptions.doctors.map((doctor) => (
                    <SelectItem key={doctor.id} value={doctor.id}>
                      {doctor.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="appointment-volunteer">Volunteer</Label>
              <Select value={volunteerFilter} onValueChange={setVolunteerFilter}>
                <SelectTrigger id="appointment-volunteer">
                  <SelectValue placeholder="All volunteers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All volunteers</SelectItem>
                  {staffOptions.volunteers.map((volunteer) => (
                    <SelectItem key={volunteer.id} value={volunteer.id}>
                      {volunteer.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="appointment-patient-search">Patient</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="appointment-patient-search"
                  type="search"
                  value={patientSearch}
                  onChange={(event) => setPatientSearch(event.target.value)}
                  placeholder="Name or code"
                  className="pl-9"
                />
              </div>
            </div>
          </div>

          <ActiveFilterSummary
            items={[
              {
                label: 'Status',
                value: statusFilter === 'ALL' ? null : getStatusLabel(statusFilter),
              },
              {
                label: 'Doctor',
                value:
                  doctorFilter === 'ALL'
                    ? null
                    : staffOptions.doctors.find((doctor) => doctor.id === doctorFilter)
                        ?.displayName,
              },
              {
                label: 'Volunteer',
                value:
                  volunteerFilter === 'ALL'
                    ? null
                    : staffOptions.volunteers.find((volunteer) => volunteer.id === volunteerFilter)
                        ?.displayName,
              },
              { label: 'Patient', value: debouncedPatientSearch || null },
            ]}
            emptyLabel="Showing every appointment in this range"
          />

          <AppMetricGroup className="mt-4">
            <AppMetricCard
              title="Next visit"
              tone="calm"
              value={
                appointmentsData
                  ? nextAppointment
                    ? formatOpsTime(nextAppointment.startsAt, timezone)
                    : 'None'
                  : '…'
              }
              icon={Clock3}
              detail={
                nextAppointment
                  ? `${nextAppointment.patient.displayName} on ${formatOpsDateTime(
                      nextAppointment.startsAt,
                      timezone,
                    )}`
                  : 'No confirmed visit in the current filters.'
              }
            />

            <AppMetricCard
              title="Scheduled"
              onActivate={() => setStatusFilter('ALL')}
              actionLabel="Show scheduled appointments"
              value={appointmentsData ? summary.total : '…'}
              icon={CalendarDays}
              detail={`Appointments in ${viewMode === 'day' ? 'this day' : 'this week'}.`}
            />
            <AppMetricCard
              title="Confirmed"
              onActivate={() => setStatusFilter('CONFIRMED')}
              actionLabel="Show confirmed appointments"
              value={appointmentsData ? summary.confirmed : '…'}
              icon={CalendarClock}
              detail="Upcoming or active confirmed visits."
            />
            <AppMetricCard
              title="Completed"
              onActivate={() => setStatusFilter('COMPLETED')}
              actionLabel="Show completed appointments"
              value={appointmentsData ? summary.completed : '…'}
              icon={UserRound}
              detail={`${summary.cancelled} cancelled, ${summary.noShow} no-show in this range.`}
            />
          </AppMetricGroup>
        </RecordSection>

        {!isOnline ? <StaleDataNotice isOnline={false} /> : null}
        {error ? (
          <InlineErrorState
            description={getPortalErrorMessage(error)}
            onRetry={() => void loadSchedule()}
            retryLabel="Reload appointments"
          />
        ) : null}

        <div aria-live="polite" aria-busy={filtersBusy} className="space-y-6">
          <p className="sr-only">
            {loading
              ? 'Loading the appointment schedule.'
              : error
                ? 'The appointment schedule could not be loaded.'
                : `${items.length} appointment${items.length === 1 ? '' : 's'} for ${rangeLabel}.`}
          </p>
          {loading ? (
            <SectionSkeleton lines={viewMode === 'day' ? 3 : 5} className="rounded-lg p-6" />
          ) : error ? null : items.length === 0 ? (
            <EmptyStateCard
              title="No appointments found"
              description="Try a different date range or clear one of the filters to broaden the schedule."
            />
          ) : (
            groupedAppointments.map(([date, appointments]) => (
              <RecordSection key={date} aria-labelledby={`appointments-${date}`}>
                <div className="flex items-baseline justify-between gap-3 py-3">
                  <h3 id={`appointments-${date}`} className="font-semibold text-foreground">
                    {formatOpsDate(date, timezone)}
                    {date === today ? (
                      <span className="ml-2 text-sm font-normal text-muted-foreground">Today</span>
                    ) : null}
                  </h3>
                  <p className="text-sm tabular-nums text-muted-foreground">
                    {appointments.length} appointment{appointments.length === 1 ? '' : 's'}
                  </p>
                </div>

                {appointments.length === 0 ? (
                  <p className="border-t border-border py-3 text-sm text-muted-foreground">
                    Nothing scheduled for this day.
                  </p>
                ) : (
                  <>
                    <ul className="xl:hidden">
                      {appointments.map((appointment) => (
                        <AppointmentRow
                          key={appointment.id}
                          appointment={appointment}
                          timezone={timezone}
                          canManage={canManageAppointments}
                          disabled={lifecycleSubmitting}
                          onAction={openLifecycleDialog}
                        />
                      ))}
                    </ul>

                    <div
                      role="region"
                      aria-label={`Appointments on ${formatOpsDate(date, timezone)}`}
                      tabIndex={0}
                      className="scroll-region hidden overflow-x-auto xl:block"
                    >
                      <table className="w-full min-w-[1080px] border-collapse text-sm">
                        <caption className="sr-only">
                          Appointments on {formatOpsDate(date, timezone)}, with status, reminders,
                          assigned staff, and available actions.
                        </caption>
                        <thead className="border-b border-border text-left text-eyebrow text-muted-foreground">
                          <tr>
                            <th scope="col" className="px-3 py-2 font-medium">
                              Time
                            </th>
                            <th scope="col" className="px-3 py-2 font-medium">
                              Patient
                            </th>
                            <th scope="col" className="px-3 py-2 font-medium">
                              Status
                            </th>
                            <th scope="col" className="px-3 py-2 font-medium">
                              Reminders
                            </th>
                            <th scope="col" className="px-3 py-2 font-medium">
                              Doctor
                            </th>
                            <th scope="col" className="px-3 py-2 font-medium">
                              Volunteer
                            </th>
                            <th scope="col" className="px-3 py-2 font-medium">
                              Notes
                            </th>
                            <th scope="col" className="px-3 py-2 text-right font-medium">
                              Actions
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {appointments.map((appointment) => (
                            <tr
                              key={appointment.id}
                              className="border-t border-border transition-colors hover:bg-muted/30"
                            >
                              <td className="whitespace-nowrap px-3 py-2 font-medium text-foreground">
                                <AppointmentTime appointment={appointment} timezone={timezone} />
                              </td>
                              <td className="px-3 py-2">
                                <div className="font-medium text-foreground">
                                  {appointment.patient.displayName}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {appointment.patient.patientCode}
                                </div>
                              </td>
                              <td className="px-3 py-2">
                                <AppointmentStatusBadge status={appointment.status} />
                                <AppointmentCancellationNote
                                  appointment={appointment}
                                  timezone={timezone}
                                />
                              </td>
                              <td className="px-3 py-2">
                                <AppointmentReminderStatus
                                  appointment={appointment}
                                  timezone={timezone}
                                />
                              </td>
                              <td className="px-3 py-2 text-muted-foreground">
                                {staffName(appointment.assignedDoctor)}
                              </td>
                              <td className="px-3 py-2 text-muted-foreground">
                                {staffName(appointment.assignedVolunteer)}
                              </td>
                              <td className="max-w-[260px] px-3 py-2 text-muted-foreground">
                                <span className="line-clamp-2">
                                  {appointment.notes || 'No notes'}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-right">
                                <AppointmentActions
                                  appointment={appointment}
                                  canManage={canManageAppointments}
                                  disabled={lifecycleSubmitting}
                                  onAction={openLifecycleDialog}
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </RecordSection>
            ))
          )}
        </div>
      </div>

      <Dialog
        open={lifecycleDialog !== null}
        onOpenChange={(open) => {
          if (!open) closeLifecycleDialog();
        }}
      >
        <DialogContent variant="form" className="max-w-xl rounded-lg border-border/80">
          <DialogHeader>
            <DialogTitle className="font-heading text-2xl">
              {lifecycleDialog ? getActionLabel(lifecycleDialog.action) : 'Update appointment'}
            </DialogTitle>
            <DialogDescription className="leading-6">
              {lifecycleDialog
                ? `${lifecycleDialog.appointment.patient.displayName}, ${lifecycleDialog.appointment.patient.patientCode}`
                : null}
            </DialogDescription>
          </DialogHeader>

          {lifecycleError ? (
            <div
              id="lifecycle-dialog-error"
              role="alert"
              className="rounded-lg border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive-ink"
            >
              {lifecycleError}
            </div>
          ) : null}

          {lifecycleDialog ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 border-y border-border py-3 text-sm">
              <dt className="text-muted-foreground">Booked</dt>
              <dd className="tabular-nums text-foreground">
                {formatOpsDateTime(lifecycleDialog.appointment.startsAt, timezone)} to{' '}
                {formatOpsTime(lifecycleDialog.appointment.endsAt, timezone)}
              </dd>
              <dt className="text-muted-foreground">Doctor</dt>
              <dd className="text-foreground">
                {staffName(lifecycleDialog.appointment.assignedDoctor)}
              </dd>
              <dt className="text-muted-foreground">Volunteer</dt>
              <dd className="text-foreground">
                {staffName(lifecycleDialog.appointment.assignedVolunteer)}
              </dd>
            </dl>
          ) : null}

          {lifecycleDialog?.action === 'reschedule' ? (
            <div className="space-y-4">
              <fieldset className="space-y-2">
                <legend className="text-sm font-semibold text-foreground">New time</legend>
                <p id="reschedule-zone" className="text-sm text-muted-foreground">
                  {describeTimeEntryZone(timezone)}
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="reschedule-starts-at">Start time</Label>
                    <Input
                      id="reschedule-starts-at"
                      aria-describedby={
                        lifecycleError
                          ? 'reschedule-zone lifecycle-dialog-error'
                          : 'reschedule-zone'
                      }
                      aria-invalid={Boolean(lifecycleError)}
                      type="datetime-local"
                      value={rescheduleStartsAt}
                      onChange={(event) => setRescheduleStartsAt(event.target.value)}
                      disabled={lifecycleSubmitting}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reschedule-ends-at">End time</Label>
                    <Input
                      id="reschedule-ends-at"
                      aria-describedby={
                        lifecycleError
                          ? 'reschedule-zone lifecycle-dialog-error'
                          : 'reschedule-zone'
                      }
                      aria-invalid={Boolean(lifecycleError)}
                      type="datetime-local"
                      value={rescheduleEndsAt}
                      onChange={(event) => setRescheduleEndsAt(event.target.value)}
                      disabled={lifecycleSubmitting}
                    />
                  </div>
                </div>
              </fieldset>
              <div className="space-y-2">
                <Label htmlFor="reschedule-notes">Notes</Label>
                <Textarea
                  id="reschedule-notes"
                  value={lifecycleNotes}
                  onChange={(event) => setLifecycleNotes(event.target.value)}
                  disabled={lifecycleSubmitting}
                  placeholder="Optional appointment notes"
                />
              </div>
            </div>
          ) : null}

          {lifecycleDialog?.action === 'cancel' || lifecycleDialog?.action === 'no-show' ? (
            <div className="space-y-2">
              <Label htmlFor="lifecycle-reason">
                {lifecycleDialog.action === 'cancel' ? 'Cancellation reason' : 'No-show reason'}
              </Label>
              <Textarea
                id="lifecycle-reason"
                aria-describedby={lifecycleError ? 'lifecycle-dialog-error' : undefined}
                aria-invalid={Boolean(lifecycleError)}
                value={lifecycleReason}
                onChange={(event) => setLifecycleReason(event.target.value)}
                disabled={lifecycleSubmitting}
                placeholder={
                  lifecycleDialog.action === 'cancel'
                    ? 'Required for cancelled appointments'
                    : 'Optional reconciliation note'
                }
              />
            </div>
          ) : null}

          {lifecycleDialog?.action === 'complete' ? (
            <div className="space-y-2">
              <Label htmlFor="complete-notes">Completion notes</Label>
              <Textarea
                id="complete-notes"
                value={lifecycleNotes}
                onChange={(event) => setLifecycleNotes(event.target.value)}
                disabled={lifecycleSubmitting}
                placeholder="Optional visit outcome note"
              />
            </div>
          ) : null}

          <DialogFooter className="mt-2">
            <Button
              type="button"
              variant="outline"
              className="cursor-pointer"
              onClick={closeLifecycleDialog}
              disabled={lifecycleSubmitting}
            >
              Keep appointment
            </Button>
            <Button
              type="button"
              variant={lifecycleDialog?.action === 'cancel' ? 'destructive' : 'default'}
              className="cursor-pointer"
              onClick={() => void submitLifecycleAction()}
              disabled={lifecycleSubmitting}
            >
              {lifecycleSubmitting
                ? 'Saving...'
                : lifecycleDialog
                  ? getActionLabel(lifecycleDialog.action)
                  : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </RouteGuard>
  );
}
