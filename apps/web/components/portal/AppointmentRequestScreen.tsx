'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CalendarRange, Clock3, Send } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useBootstrap } from '@/lib/bootstrap-context';
import {
  createAppointmentRequest,
  fetchAppointmentRequests,
  formatPortalDate,
  formatPortalDateTime,
  getPortalClinicId,
  getPortalClinicName,
  type AppointmentRequestRecord,
} from '@/lib/patient-portal';
import { getAppointmentRequestTypeLabel } from '@/lib/appointment-status';
import { RouteGuard } from '@/components/RouteGuard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

const REASON_SUGGESTIONS = [
  'Routine follow-up',
  'Review recent symptoms',
  'Medication check-in',
  'Discuss home readings',
] as const;

function addDays(days: number) {
  const value = new Date();
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
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

export function AppointmentRequestScreen() {
  const router = useRouter();
  const getToken = useAuth();
  const bootstrap = useBootstrap()?.bootstrap ?? null;
  const clinicId = getPortalClinicId(bootstrap);
  const clinicName = getPortalClinicName(bootstrap, clinicId);

  const [preferredStartDate, setPreferredStartDate] = useState(() => addDays(2));
  const [preferredEndDate, setPreferredEndDate] = useState(() => addDays(7));
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [recentRequests, setRecentRequests] = useState<AppointmentRequestRecord[]>([]);
  const [loadingContext, setLoadingContext] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!clinicId || !getToken) {
        setLoadingContext(false);
        return;
      }

      setLoadingContext(true);
      try {
        const requests = await fetchAppointmentRequests(clinicId, getToken);
        if (!cancelled) {
          setRecentRequests(requests);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) {
          setLoadingContext(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [clinicId, getToken]);

  const nextAppointment = useMemo(() => getNextAppointment(recentRequests), [recentRequests]);
  const latestRequest = recentRequests[0] ?? null;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!clinicId || !getToken) {
      setError('An active clinic is required before you can submit a request.');
      return;
    }

    if (!preferredStartDate || !preferredEndDate) {
      setError('Please choose both a start date and an end date.');
      return;
    }

    if (preferredEndDate < preferredStartDate) {
      setError('Your preferred end date must be on or after the start date.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await createAppointmentRequest(clinicId, getToken, {
        preferredStartDate,
        preferredEndDate,
        reason: reason.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      router.push('/portal/appointments');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <RouteGuard requiredPermission="PATIENT.PORTAL.WRITE_SELF_REPORT">
      <div className="space-y-6">
        <Button asChild variant="ghost" size="sm">
          <Link href="/portal/appointments">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to appointments
          </Link>
        </Button>

        <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <Card className="overflow-hidden border-border/70 bg-gradient-to-br from-primary/10 via-card to-card">
            <CardHeader className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="rounded-full px-3 py-1">
                  Request a visit
                </Badge>
                {clinicName && (
                  <Badge variant="outline" className="rounded-full bg-background/80 px-3 py-1">
                    {clinicName}
                  </Badge>
                )}
              </div>
              <div className="space-y-2">
                <CardTitle className="text-2xl md:text-3xl">
                  Tell your clinic when you would like to be seen.
                </CardTitle>
                <CardDescription className="max-w-2xl text-sm md:text-base">
                  Share your preferred date window, a short reason for the visit, and any helpful
                  context so staff can schedule you faster.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-border/70 bg-background/80 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Best for
                </p>
                <p className="mt-2 text-sm">
                  Routine follow-ups, reviewing symptoms, medication questions, or discussing home
                  readings.
                </p>
              </div>
              <div className="rounded-2xl border border-border/70 bg-background/80 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Scheduling note
                </p>
                <p className="mt-2 text-sm">
                  Your clinic confirms the exact time after reviewing your request.
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card className="border-border/70 bg-card/95">
              <CardHeader>
                <CardTitle className="text-lg">Current scheduling snapshot</CardTitle>
                <CardDescription>Helpful context before you submit a new request.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {loadingContext ? (
                  <div className="h-28 animate-pulse rounded-2xl border border-border/70 bg-muted/30" />
                ) : nextAppointment ? (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
                    <div className="flex items-center gap-2">
                      <CalendarRange className="h-4 w-4 text-emerald-700" />
                      <p className="font-medium text-emerald-900">Next confirmed visit</p>
                    </div>
                    <p className="mt-2 text-sm text-emerald-900">
                      {formatPortalDateTime(nextAppointment.startsAt)}
                    </p>
                    <p className="text-sm text-emerald-800/80">
                      Ends {formatPortalDateTime(nextAppointment.endsAt)}
                    </p>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 p-4 text-sm text-muted-foreground">
                    No confirmed appointment is currently scheduled.
                  </div>
                )}

                <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Latest request
                  </p>
                  <p className="mt-2 text-sm font-medium">
                    {latestRequest
                      ? `${formatPortalDate(latestRequest.preferredStartDate)} to ${formatPortalDate(latestRequest.preferredEndDate)}`
                      : 'No recent request'}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {latestRequest
                      ? `${getAppointmentRequestTypeLabel(latestRequest.requestType)} - ${
                          latestRequest.reason || 'No reason provided'
                        }`
                      : 'Your next request will appear here after submission.'}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/70 bg-card/95">
              <CardHeader>
                <CardTitle className="text-lg">Before you submit</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <p>Share the date range that works best for you, not the exact time.</p>
                <p>
                  Add a short reason so staff know whether you need a routine follow-up, symptom
                  review, or medication discussion.
                </p>
                <p>
                  If your clinic confirms the visit, it will show up in your appointments dashboard
                  automatically.
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        {error && (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {error}
          </div>
        )}

        <Card className="border-border/70 bg-card/95">
          <CardHeader>
            <CardTitle className="text-lg">Visit request details</CardTitle>
            <CardDescription>
              Pick a date window and add any details that will help your care team prepare.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="space-y-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="preferredStartDate">Preferred start date</Label>
                    <Input
                      id="preferredStartDate"
                      type="date"
                      value={preferredStartDate}
                      onChange={(event) => {
                        const nextValue = event.target.value;
                        setPreferredStartDate(nextValue);
                        if (preferredEndDate && preferredEndDate < nextValue) {
                          setPreferredEndDate(nextValue);
                        }
                      }}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="preferredEndDate">Preferred end date</Label>
                    <Input
                      id="preferredEndDate"
                      type="date"
                      value={preferredEndDate}
                      min={preferredStartDate}
                      onChange={(event) => setPreferredEndDate(event.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <Label htmlFor="reason">Visit reason</Label>
                  <Input
                    id="reason"
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder="Example: review my recent blood pressure readings"
                    maxLength={120}
                  />
                  <div className="flex flex-wrap gap-2">
                    {REASON_SUGGESTIONS.map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => setReason(suggestion)}
                        className="rounded-full border border-border/70 bg-background px-3 py-1.5 text-sm text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Anything else your clinic should know?</Label>
                  <Textarea
                    id="notes"
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="Add symptoms, home readings, or availability notes that may help your care team schedule you."
                    rows={6}
                    maxLength={2000}
                  />
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-3xl border border-border/70 bg-gradient-to-br from-secondary/10 via-background to-background p-5">
                  <div className="flex items-center gap-2">
                    <Clock3 className="h-4 w-4 text-secondary-foreground" />
                    <p className="font-medium">Request summary</p>
                  </div>
                  <div className="mt-4 space-y-4 text-sm">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        Date window
                      </p>
                      <p className="mt-2">
                        {preferredStartDate && preferredEndDate
                          ? `${formatPortalDate(preferredStartDate)} to ${formatPortalDate(preferredEndDate)}`
                          : 'Choose your preferred date range'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        Reason
                      </p>
                      <p className="mt-2 text-muted-foreground">
                        {reason.trim() || 'Add a short visit reason'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        Notes
                      </p>
                      <p className="mt-2 text-muted-foreground">
                        {notes.trim() || 'Optional visit notes can help your clinic prepare.'}
                      </p>
                    </div>
                  </div>
                </div>

                <Button type="submit" disabled={submitting} className="w-full">
                  <Send className="h-4 w-4" />
                  {submitting ? 'Submitting request...' : 'Submit appointment request'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </RouteGuard>
  );
}
