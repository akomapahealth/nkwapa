'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarClock,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  RefreshCw,
  Search,
  UserRound,
} from 'lucide-react';
import { ActiveFilterSummary } from '@/components/app-shell/ActiveFilterSummary';
import { AppMetricCard } from '@/components/app-shell/AppMetricCard';
import { AppPageHeader } from '@/components/app-shell/AppPageHeader';
import { InlineErrorState, SectionSkeleton } from '@/components/feedback/AppState';
import { EmptyStateCard } from '@/components/ops/OpsShared';
import { RouteGuard } from '@/components/RouteGuard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/lib/auth-context';
import { getActiveBootstrapClinic, getBootstrapActiveClinicId } from '@/lib/bootstrap-clinics';
import { useBootstrap } from '@/lib/bootstrap-context';
import { cn } from '@/lib/utils';
import {
  fetchAppointmentStaffOptions,
  fetchStaffAppointments,
  getPortalErrorMessage,
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
} from '@/lib/ops';

type ViewMode = 'day' | 'week';
type StatusFilter = 'ALL' | StaffAppointmentStatus;

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

function getStatusLabel(status: StaffAppointmentStatus | StatusFilter) {
  switch (status) {
    case 'CONFIRMED':
      return 'Confirmed';
    case 'COMPLETED':
      return 'Completed';
    case 'NO_SHOW':
      return 'No-show';
    case 'CANCELLED':
      return 'Cancelled';
    case 'ALL':
    default:
      return 'All statuses';
  }
}

function getStatusVariant(
  status: StaffAppointmentStatus,
): 'finalized' | 'secondary' | 'warning' | 'destructive' | 'outline' {
  switch (status) {
    case 'CONFIRMED':
      return 'secondary';
    case 'COMPLETED':
      return 'finalized';
    case 'NO_SHOW':
      return 'warning';
    case 'CANCELLED':
      return 'destructive';
    default:
      return 'outline';
  }
}

function staffName(staff: StaffAppointmentRecord['assignedDoctor']) {
  return staff?.displayName ?? (staff?.id ? 'Assigned staff' : 'Unassigned');
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

function AppointmentMobileCard({
  appointment,
  timezone,
}: {
  appointment: StaffAppointmentRecord;
  timezone: string;
}) {
  return (
    <article className="rounded-3xl border border-border/80 bg-background/80 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-foreground">
            {appointment.patient.displayName}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">{appointment.patient.patientCode}</p>
        </div>
        <Badge variant={getStatusVariant(appointment.status)}>
          {getStatusLabel(appointment.status)}
        </Badge>
      </div>
      <div className="mt-4 grid gap-3 text-sm">
        <div className="flex items-center gap-2 text-foreground">
          <Clock3 className="h-4 w-4 text-primary" />
          <span>
            {formatOpsTime(appointment.startsAt, timezone)} to{' '}
            {formatOpsTime(appointment.endsAt, timezone)}
          </span>
        </div>
        <div className="grid gap-2 rounded-2xl border border-border/70 bg-card/70 p-3">
          <p className="text-muted-foreground">Doctor: {staffName(appointment.assignedDoctor)}</p>
          <p className="text-muted-foreground">
            Volunteer: {staffName(appointment.assignedVolunteer)}
          </p>
        </div>
        {appointment.notes ? (
          <p className="rounded-2xl bg-muted/40 p-3 text-muted-foreground">{appointment.notes}</p>
        ) : null}
      </div>
    </article>
  );
}

export default function StaffAppointmentsPage() {
  const bootstrapCtx = useBootstrap();
  const bootstrap = bootstrapCtx?.bootstrap ?? null;
  const getToken = useAuth();
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
  const items = appointmentsData?.items ?? [];
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
  const nextAppointment = items.find((appointment) => appointment.status === 'CONFIRMED') ?? null;
  const rangeLabel =
    range.from === range.to
      ? formatOpsDate(range.from, timezone)
      : `${formatOpsDate(range.from, timezone)} to ${formatOpsDate(range.to, timezone)}`;

  function shiftRange(direction: -1 | 1) {
    setSelectedDate((current) => addDays(current, direction * (viewMode === 'day' ? 1 : 7)));
  }

  return (
    <RouteGuard requiredPermission="APPOINTMENT.READ">
      <div className="space-y-6">
        <AppPageHeader
          eyebrow="Appointment schedule"
          title="Appointments"
          description="Review scheduled clinic visits by day or week, then narrow the list by status, assigned staff, or patient."
          hint="Read-only schedule view. Reschedule, cancel, complete, and no-show actions are handled in later lifecycle work."
          badges={
            activeClinic ? (
              <Badge variant="outline" className="rounded-full bg-background/80 px-3 py-1">
                {activeClinic.clinicName}
              </Badge>
            ) : null
          }
          actions={
            <Button
              type="button"
              variant="outline"
              onClick={() => void loadSchedule({ background: true })}
              disabled={refreshing || loading}
            >
              <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
              Refresh
            </Button>
          }
        />

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <AppMetricCard
            title="Scheduled"
            value={summary.total}
            icon={CalendarDays}
            detail={`Appointments in ${viewMode === 'day' ? 'this day' : 'this week'}.`}
          />
          <AppMetricCard
            title="Confirmed"
            value={summary.confirmed}
            icon={CalendarClock}
            detail="Upcoming or active confirmed visits."
          />
          <AppMetricCard
            title="Completed"
            value={summary.completed}
            icon={UserRound}
            detail="Appointments already completed in this range."
          />
          <AppMetricCard
            title="Next visit"
            value={nextAppointment ? formatOpsTime(nextAppointment.startsAt, timezone) : 'None'}
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
        </section>

        <Card className="rounded-[28px] border-border/80 bg-card/90 shadow-lg shadow-black/5">
          <CardHeader className="space-y-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <CardTitle className="text-xl">Schedule controls</CardTitle>
                <CardDescription>{rangeLabel}</CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="icon" onClick={() => shiftRange(-1)}>
                  <ChevronLeft className="h-4 w-4" />
                  <span className="sr-only">Previous range</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setSelectedDate(getTodayInTimeZone())}
                >
                  Today
                </Button>
                <Button type="button" variant="outline" size="icon" onClick={() => shiftRange(1)}>
                  <ChevronRight className="h-4 w-4" />
                  <span className="sr-only">Next range</span>
                </Button>
              </div>
            </div>

            <Tabs value={viewMode} onValueChange={(value) => setViewMode(value as ViewMode)}>
              <TabsList className="grid h-auto w-full grid-cols-2 gap-2 rounded-2xl border border-border/70 bg-background p-2 sm:w-[320px]">
                <TabsTrigger value="day" className="rounded-xl">
                  Day
                </TabsTrigger>
                <TabsTrigger value="week" className="rounded-xl">
                  Week
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <div className="space-y-2">
                <Label htmlFor="appointment-date">Anchor date</Label>
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
                { label: 'Range', value: rangeLabel },
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
                      : staffOptions.volunteers.find(
                          (volunteer) => volunteer.id === volunteerFilter,
                        )?.displayName,
                },
                { label: 'Patient', value: debouncedPatientSearch || null },
              ]}
              emptyLabel="Showing the full selected schedule range"
            />
          </CardContent>
        </Card>

        {error ? (
          <InlineErrorState
            description={getPortalErrorMessage(error)}
            onRetry={() => void loadSchedule()}
            retryLabel="Reload appointments"
          />
        ) : null}

        {loading ? (
          <SectionSkeleton lines={viewMode === 'day' ? 3 : 5} className="rounded-[28px] p-6" />
        ) : !error ? (
          <Card className="rounded-[28px] border-border/80 bg-card/90 shadow-lg shadow-black/5">
            <CardHeader className="space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle className="text-xl">
                    {viewMode === 'day' ? 'Day schedule' : 'Week schedule'}
                  </CardTitle>
                  <CardDescription>
                    {viewMode === 'day'
                      ? 'A compact answer to who is scheduled today.'
                      : 'Appointments grouped by the day they start.'}
                  </CardDescription>
                </div>
                <Badge variant="outline" className="w-fit rounded-full bg-background/80 px-3 py-1">
                  {items.length} shown
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              {items.length === 0 ? (
                <EmptyStateCard
                  title="No appointments found"
                  description="Try a different date range or clear one of the filters to broaden the schedule."
                />
              ) : (
                groupedAppointments.map(([date, appointments]) => (
                  <section key={date} className="space-y-3">
                    <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-background/70 px-4 py-3">
                      <div>
                        <h2 className="font-semibold text-foreground">
                          {formatOpsDate(date, timezone)}
                        </h2>
                        <p className="text-sm text-muted-foreground">
                          {appointments.length} appointment{appointments.length === 1 ? '' : 's'}
                        </p>
                      </div>
                    </div>

                    {appointments.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 p-4 text-sm text-muted-foreground">
                        Nothing scheduled for this day.
                      </div>
                    ) : (
                      <>
                        <div className="space-y-3 md:hidden">
                          {appointments.map((appointment) => (
                            <AppointmentMobileCard
                              key={appointment.id}
                              appointment={appointment}
                              timezone={timezone}
                            />
                          ))}
                        </div>

                        <div className="hidden overflow-x-auto rounded-2xl border border-border/80 md:block">
                          <table className="w-full min-w-[860px] border-collapse text-sm">
                            <thead className="bg-muted/50 text-left text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                              <tr>
                                <th className="px-4 py-3">Time</th>
                                <th className="px-4 py-3">Patient</th>
                                <th className="px-4 py-3">Status</th>
                                <th className="px-4 py-3">Doctor</th>
                                <th className="px-4 py-3">Volunteer</th>
                                <th className="px-4 py-3">Notes</th>
                              </tr>
                            </thead>
                            <tbody>
                              {appointments.map((appointment) => (
                                <tr
                                  key={appointment.id}
                                  className="border-t border-border/70 bg-background/70 transition-colors hover:bg-muted/30"
                                >
                                  <td className="whitespace-nowrap px-4 py-3 font-medium text-foreground">
                                    {formatOpsTime(appointment.startsAt, timezone)} to{' '}
                                    {formatOpsTime(appointment.endsAt, timezone)}
                                  </td>
                                  <td className="px-4 py-3">
                                    <div className="font-medium text-foreground">
                                      {appointment.patient.displayName}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                      {appointment.patient.patientCode}
                                    </div>
                                  </td>
                                  <td className="px-4 py-3">
                                    <Badge variant={getStatusVariant(appointment.status)}>
                                      {getStatusLabel(appointment.status)}
                                    </Badge>
                                  </td>
                                  <td className="px-4 py-3 text-muted-foreground">
                                    {staffName(appointment.assignedDoctor)}
                                  </td>
                                  <td className="px-4 py-3 text-muted-foreground">
                                    {staffName(appointment.assignedVolunteer)}
                                  </td>
                                  <td className="max-w-[260px] px-4 py-3 text-muted-foreground">
                                    <span className="line-clamp-2">
                                      {appointment.notes || 'No notes'}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}
                  </section>
                ))
              )}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </RouteGuard>
  );
}
