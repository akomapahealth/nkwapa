'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
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
  PortalConfirmedVisit,
  PortalFact,
  PortalHero,
  PortalPanel,
} from '@/components/portal/PortalPanels';
import { PortalLinkRequiredState } from '@/components/portal/PortalLinkRequiredState';
import { PortalWriteGateNotice, usePortalWriteGate } from '@/components/portal/PortalWriteGate';
import { usePortalResource } from '@/components/portal/use-portal-resource';
import { RouteGuard } from '@/components/RouteGuard';
import { useToast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { focusField } from '@/components/ui/field';
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
  // The field the message is about, so it can be focused and marked invalid.
  const [errorField, setErrorField] = useState<string | null>(null);
  const fail = (message: string, field: string | null = null) => {
    setError(message);
    setErrorField(field);
    if (field) focusField(field);
  };
  const invalidProps = (id: string) =>
    errorField === id
      ? { 'aria-invalid': true as const, 'aria-describedby': 'appointment-request-error' }
      : {};
  const { showToast } = useToast();

  const context = usePortalResource<AppointmentRequestRecord[]>({
    resourceKey: clinicId ?? 'no-clinic',
    enabled: Boolean(clinicId),
    errorMessage: 'Your appointment context could not be loaded.',
    // A patient who has not claimed their record needs the claim prompt, not an error string.
    // `usePortalResource` keeps that case distinguishable from a transient failure.
    fetcher: async (token) => fetchAppointmentRequests(clinicId!, token),
  });

  // Typing a reading offline is fine; sending it is not. The draft stays in the form until then.
  const writeGate = usePortalWriteGate();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!writeGate.canWrite) return;

    if (!clinicId || !getToken) {
      fail('An active clinic is required before you can submit a request.');
      return;
    }

    if (!preferredStartDate || !preferredEndDate) {
      fail(
        'Please choose both a start date and an end date.',
        preferredStartDate ? 'preferredEndDate' : 'preferredStartDate',
      );
      return;
    }

    if (preferredEndDate < preferredStartDate) {
      fail('Your preferred end date must be on or after the start date.', 'preferredEndDate');
      return;
    }

    setSubmitting(true);
    setError(null);
    setErrorField(null);

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
        <Button
          asChild
          variant="ghost"
          size="default"
          className="h-auto max-w-full whitespace-normal text-left"
        >
          <Link href="/portal/appointments">
            <ArrowLeft aria-hidden="true" className="mr-2 h-4 w-4" />
            Back to appointments
          </Link>
        </Button>

        <PortalHero
          clinicName={clinicName}
          title="Request an appointment"
          description="Tell your clinic when you can come and why you would like an appointment."
        />

        {error ? (
          <div id="appointment-request-error" role="alert">
            <InlineErrorState title="This request was not sent" description={error} />
          </div>
        ) : null}

        <PortalPanel
          title="Visit request details"
          description="Choose the dates that work for you. Your clinic will confirm the time."
        >
          <form
            onSubmit={handleSubmit}
            className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]"
          >
            <div className="min-w-0 space-y-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="preferredStartDate">Preferred start date</Label>
                  <Input
                    id="preferredStartDate"
                    {...invalidProps('preferredStartDate')}
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
                    {...invalidProps('preferredEndDate')}
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
                      aria-pressed={reason === suggestion}
                      className="inline-flex min-h-11 items-center rounded-sm border border-input bg-card px-4 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 aria-pressed:border-primary aria-pressed:bg-selected aria-pressed:font-semibold aria-pressed:text-primary"
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

            <div className="min-w-0 space-y-4">
              <div className="border-t border-border py-4">
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

              <PortalWriteGateNotice gate={writeGate} />

              <Button
                type="submit"
                disabled={submitting || !writeGate.canWrite}
                className="h-auto w-full min-w-0 whitespace-normal [overflow-wrap:anywhere]"
              >
                <Send aria-hidden="true" className="h-4 w-4" />
                {submitting ? 'Sending request…' : 'Submit appointment request'}
              </Button>
            </div>
          </form>
        </PortalPanel>

        <div className="grid gap-6 lg:grid-cols-2">
          <PortalPanel
            title="Your appointments"
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
                        description="Send a request and your clinic will confirm a time for you."
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
            title="What happens next"
            contentClassName="space-y-3 text-sm leading-6 text-muted-foreground"
          >
            <p>Share the date range that works best for you, not the exact time.</p>
            <p>
              Add a short reason so your clinic knows whether you need a routine follow-up, symptom
              review, or medication discussion.
            </p>
            <p>
              If your clinic confirms the visit, it will show up under Appointments automatically.
            </p>
          </PortalPanel>
        </div>
      </div>
    </RouteGuard>
  );
}
