'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
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
  getPortalErrorMessage,
  type AppointmentRequestRecord,
} from '@/lib/patient-portal';
import { getAppointmentRequestTypeLabel } from '@/lib/appointment-status';
import { EmptyState, InlineErrorState, SectionSkeleton } from '@/components/feedback/AppState';
import { ResourceState } from '@/components/feedback/ResourceState';
import {
  PORTAL_HERO_GRID,
  PortalConfirmedVisit,
  PortalFact,
  PortalHero,
  PortalPanel,
} from '@/components/portal/PortalPanels';
import { PortalLinkRequiredState } from '@/components/portal/PortalLinkRequiredState';
import { usePortalResource } from '@/components/portal/use-portal-resource';
import { RouteGuard } from '@/components/RouteGuard';
import { useToast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
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
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();

  const context = usePortalResource<AppointmentRequestRecord[]>({
    resourceKey: clinicId ?? 'no-clinic',
    enabled: Boolean(clinicId),
    errorMessage: 'Your appointment context could not be loaded.',
    // A patient who has not claimed their record needs the claim prompt, not an error string.
    // `usePortalResource` keeps that case distinguishable from a transient failure.
    fetcher: async (token) => fetchAppointmentRequests(clinicId!, token),
  });

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
      const message = getPortalErrorMessage(err);
      setError(message);
      showToast({ title: 'Request could not be sent', description: message, tone: 'error' });
    } finally {
      setSubmitting(false);
    }
  }

  if (context.isLinkMissing && !context.isInitialLoading) {
    return (
      <RouteGuard requiredPermission="PATIENT.PORTAL.WRITE_SELF_REPORT">
        <div className="space-y-6">
          <PortalLinkRequiredState clinicName={clinicName} />
        </div>
      </RouteGuard>
    );
  }

  return (
    <RouteGuard requiredPermission="PATIENT.PORTAL.WRITE_SELF_REPORT">
      <div className="space-y-6">
        <Button asChild variant="ghost" size="sm">
          <Link href="/portal/appointments">
            <ArrowLeft aria-hidden="true" className="mr-2 h-4 w-4" />
            Back to appointments
          </Link>
        </Button>

        <section className={PORTAL_HERO_GRID}>
          <PortalHero
            eyebrow="Request a visit"
            clinicName={clinicName}
            title="Tell your clinic when you would like to be seen."
            description="Share your preferred date window, a short reason for the visit, and any helpful context so staff can schedule you faster."
            contentClassName="grid gap-4 md:grid-cols-2"
          >
            <PortalFact
              label="Best for"
              value="Routine follow-ups, reviewing symptoms, medication questions, or discussing home readings."
              valueClassName="font-normal leading-6"
            />
            <PortalFact
              label="Scheduling note"
              value="Your clinic confirms the exact time after reviewing your request."
              valueClassName="font-normal leading-6"
            />
          </PortalHero>

          <div className="space-y-4">
            <PortalPanel
              title="Current scheduling snapshot"
              description="Helpful context before you submit a new request."
              contentClassName="space-y-4"
            >
              <ResourceState
                state={context}
                // Pinned by e2e/appointments.spec.js: a failed context read must say what failed
                // and offer a retry, rather than printing a raw message into the page.
                errorTitle="We couldn't load your appointment context"
                skeleton={
                  <SectionSkeleton lines={1} className="border-0 bg-transparent p-0 shadow-none" />
                }
              >
                {(requests) => {
                  const nextAppointment = getNextAppointment(requests);
                  const latestRequest = requests[0] ?? null;

                  return (
                    <div className="space-y-4">
                      {nextAppointment ? (
                        <PortalConfirmedVisit
                          title="Next confirmed visit"
                          startsAt={formatPortalDateTime(nextAppointment.startsAt)}
                          endsAt={formatPortalDateTime(nextAppointment.endsAt)}
                          icon={<CalendarRange aria-hidden="true" className="h-4 w-4" />}
                        />
                      ) : (
                        <EmptyState
                          density="compact"
                          icon={CalendarRange}
                          title="No confirmed appointment yet"
                          description="Send a request below and your clinic will confirm a time for you."
                        />
                      )}

                      <PortalFact
                        label="Latest request"
                        value={
                          latestRequest
                            ? `${formatPortalDate(latestRequest.preferredStartDate)} to ${formatPortalDate(latestRequest.preferredEndDate)}`
                            : 'No recent request'
                        }
                        detail={
                          latestRequest
                            ? `${getAppointmentRequestTypeLabel(latestRequest.requestType)} - ${
                                latestRequest.reason || 'No reason provided'
                              }`
                            : 'Your next request will appear here after submission.'
                        }
                      />
                    </div>
                  );
                }}
              </ResourceState>
            </PortalPanel>

            <PortalPanel
              title="Before you submit"
              contentClassName="space-y-3 text-sm leading-6 text-muted-foreground"
            >
              <p>Share the date range that works best for you, not the exact time.</p>
              <p>
                Add a short reason so staff know whether you need a routine follow-up, symptom
                review, or medication discussion.
              </p>
              <p>
                If your clinic confirms the visit, it will show up in your appointments dashboard
                automatically.
              </p>
            </PortalPanel>
          </div>
        </section>

        {error ? (
          <div id="appointment-request-error" role="alert">
            <InlineErrorState title="This request was not sent" description={error} />
          </div>
        ) : null}

        <PortalPanel
          title="Visit request details"
          description="Pick a date window and add any details that will help your care team prepare."
        >
          <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="preferredStartDate">Preferred start date</Label>
                  <Input
                    id="preferredStartDate"
                    type="date"
                    className="tabular-nums"
                    value={preferredStartDate}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      setPreferredStartDate(nextValue);
                      // Moving the start past the end carries the end with it, rather than letting
                      // a patient submit a window the API would reject. Pinned by e2e.
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
                    className="tabular-nums"
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
                      className="inline-flex min-h-11 items-center rounded-full border border-input bg-background px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
              <div className="rounded-lg border border-border bg-background p-5">
                <h3 className="flex items-center gap-2 font-medium text-foreground">
                  <Clock3 aria-hidden="true" className="h-4 w-4 text-primary" />
                  Request summary
                </h3>
                <div className="mt-4 space-y-4">
                  <PortalFact
                    label="Date window"
                    value={
                      preferredStartDate && preferredEndDate
                        ? `${formatPortalDate(preferredStartDate)} to ${formatPortalDate(preferredEndDate)}`
                        : 'Choose your preferred date range'
                    }
                  />
                  <PortalFact
                    label="Reason"
                    value={reason.trim() || 'Add a short visit reason'}
                    valueClassName="font-normal text-muted-foreground"
                  />
                  <PortalFact
                    label="Notes"
                    value={notes.trim() || 'Optional visit notes can help your clinic prepare.'}
                    valueClassName="font-normal leading-6 text-muted-foreground"
                  />
                </div>
              </div>

              <Button type="submit" disabled={submitting} className="w-full">
                <Send aria-hidden="true" className="h-4 w-4" />
                {submitting ? 'Submitting request...' : 'Submit appointment request'}
              </Button>
            </div>
          </form>
        </PortalPanel>
      </div>
    </RouteGuard>
  );
}
