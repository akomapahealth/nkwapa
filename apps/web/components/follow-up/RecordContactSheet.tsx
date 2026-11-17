'use client';

import { useState } from 'react';
import { MapPin, Phone } from 'lucide-react';
import {
  deriveHypertensionEscalation,
  HYPERTENSION_ESCALATION_REASON_LABELS,
  HYPERTENSION_SYMPTOM_LABELS,
  HYPERTENSION_SYMPTOMS,
  type HypertensionSymptomValue,
} from '@nkwapa/db/hypertension-interview';
import {
  deriveDiabetesEscalation,
  DIABETES_ESCALATION_REASON_LABELS,
  DIABETES_URGENT_SYMPTOM_LABELS,
  DIABETES_URGENT_SYMPTOMS,
  type DiabetesUrgentSymptomValue,
} from '@nkwapa/db/diabetes-interview';
import {
  MEDICATION_ADHERENCE_LEVEL_LABELS,
  MEDICATION_ADHERENCE_LEVELS,
  type MedicationAdherenceLevelValue,
} from '@nkwapa/db/clinical-vocabulary';
import { useWideSheet } from '@/components/app-shell/ListToolbar';
import { SegmentedControl } from '@/components/app-shell/SegmentedControl';
import {
  CheckboxQuestion,
  ChoiceQuestion,
  MultiChoiceQuestion,
  NumberQuestion,
} from '@/components/encounters/hypertension/InterviewQuestion';
import { InlineNotice } from '@/components/feedback/InlineNotice';
import { FollowUpTierBadge } from '@/components/patients/follow-up/FollowUpTierBadge';
import { Button } from '@/components/ui/button';
import { confirmAction } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { getErrorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useBootstrap } from '@/lib/bootstrap-context';
import { submitFollowUpAttempt } from '@/lib/follow-up-offline';
import { generateClientId } from '@/lib/outbox';
import { useAsyncResource } from '@/lib/use-async-resource';
import {
  ATTEMPT_MODES,
  CANCEL_REASON_LABELS,
  cancelContact,
  CLOSING_STEP_LABELS,
  CONTACT_MODE_LABELS,
  CONTACT_PURPOSE_LABELS,
  fetchContact,
  formatDueDay,
  NOT_REACHED_LABELS,
  STOPPING_CANCEL_REASONS,
  type CancelReason,
  type ClosingStep,
  type ContactDetail,
  type ContactMode,
  type ContactOutcome,
  type NotReachedReason,
  type RecordAttemptInput,
} from '@/lib/follow-up-contacts';
import { googleMapsUrl } from '@/lib/residential-location';
import { cn } from '@/lib/utils';

/** What the person can say happened once they reached the patient. */
const REACHED_OUTCOMES: ContactOutcome[] = [
  'REACHED',
  'AGREED_TO_RETURN',
  'REFERRED',
  'REFERRAL_CONFIRMED',
  'DECLINED',
];
const REACHED_OUTCOME_LABELS: Record<string, string> = {
  REACHED: 'Spoke with them',
  AGREED_TO_RETURN: 'Agreed to come in',
  REFERRED: 'Referred elsewhere',
  REFERRAL_CONFIRMED: 'They reached the referral',
  DECLINED: 'Declined follow-up',
};
const SYMPTOM_OPTIONS = HYPERTENSION_SYMPTOMS;
const ADHERENCE_OPTIONS = MEDICATION_ADHERENCE_LEVELS;
const CLOSING_STEPS = Object.keys(CLOSING_STEP_LABELS) as ClosingStep[];
const CANCEL_REASONS = Object.keys(CANCEL_REASON_LABELS) as CancelReason[];

export interface RecordedContact {
  contactStatus: 'DONE' | 'DUE';
  urgent: boolean;
  /** Kept on this device until it reconnects. */
  queued?: boolean;
  /** Plain words for the page's status line. */
  message: string;
}

/**
 * Record one follow-up contact (#338): call the patient, then either "not reached" in two taps,
 * or what was found, what was agreed and when they are next due. A danger sign shows the urgent
 * warning before saving, from the same rule the server uses to raise the flag.
 */
export function RecordContactSheet({
  clinicId,
  contactId,
  online,
  savedCopy,
  onClose,
  onRecorded,
}: {
  clinicId: string;
  contactId: string | null;
  online: boolean;
  /** The device's copy of this contact, used when the server cannot be reached. */
  savedCopy?: ContactDetail | null;
  onClose: () => void;
  onRecorded: (result: RecordedContact) => void;
}) {
  const wide = useWideSheet();
  return (
    <Sheet open={contactId !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <SheetContent
        side={wide ? 'right' : 'bottom'}
        className={cn(
          'flex flex-col bg-card p-0 pb-[env(safe-area-inset-bottom)]',
          wide ? 'w-full sm:max-w-lg' : 'max-h-[92dvh] rounded-t-xl',
        )}
      >
        {contactId ? (
          <ContactForm
            key={contactId}
            clinicId={clinicId}
            contactId={contactId}
            online={online}
            savedCopy={savedCopy ?? null}
            onRecorded={onRecorded}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function ContactForm({
  clinicId,
  contactId,
  online,
  savedCopy,
  onRecorded,
}: {
  clinicId: string;
  contactId: string;
  online: boolean;
  savedCopy: ContactDetail | null;
  onRecorded: (result: RecordedContact) => void;
}) {
  const contact = useAsyncResource({
    fetcher: (getToken, signal) => fetchContact(clinicId, contactId, getToken, signal),
    resourceKey: `${clinicId}:${contactId}`,
    errorMessage: 'This contact could not be loaded.',
    requiresOnline: true,
  });
  const data = contact.data ?? savedCopy;
  return (
    <>
      <SheetHeader className="shrink-0 border-b border-border px-5 pb-4 text-left">
        <SheetTitle className="pr-12 font-body">
          {data?.patient.name ?? 'Follow-up contact'}
        </SheetTitle>
        <SheetDescription>
          {data
            ? `${CONTACT_PURPOSE_LABELS[data.purpose]} · ${CONTACT_MODE_LABELS[data.mode]} · due ${formatDueDay(data.dueOn)}`
            : 'Loading the contact.'}
        </SheetDescription>
        {data ? (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <FollowUpTierBadge tier={data.patient.tier} />
            <span className="font-mono text-xs text-muted-foreground" translate="no">
              {data.patient.patientCode}
            </span>
            {data.attemptCount > 0 ? (
              <span className="text-sm text-muted-foreground">
                {data.attemptCount} earlier {data.attemptCount === 1 ? 'try' : 'tries'}
              </span>
            ) : null}
          </div>
        ) : null}
      </SheetHeader>
      {contact.error && !data ? (
        <div className="p-5">
          <InlineNotice tone="error">{contact.error}</InlineNotice>
        </div>
      ) : data ? (
        <AttemptForm
          clinicId={clinicId}
          contact={data}
          online={online && contact.isOnline}
          onRecorded={onRecorded}
        />
      ) : (
        <p className="type-body p-5 text-muted-foreground" role="status">
          Loading…
        </p>
      )}
    </>
  );
}

function AttemptForm({
  clinicId,
  contact,
  online,
  onRecorded,
}: {
  clinicId: string;
  contact: ContactDetail;
  online: boolean;
  onRecorded: (result: RecordedContact) => void;
}) {
  const getToken = useAuth();
  const bootstrap = useBootstrap()?.bootstrap ?? null;
  const userId = bootstrap?.userId ?? null;
  const displayName = bootstrap?.displayName ?? undefined;
  const defaultMode: ContactMode = ATTEMPT_MODES.includes(contact.mode) ? contact.mode : 'PHONE';
  const [mode, setMode] = useState<ContactMode>(defaultMode);
  const [reached, setReached] = useState<'yes' | 'no' | ''>('');
  const [symptoms, setSymptoms] = useState<HypertensionSymptomValue[]>([]);
  const [diabetesSymptoms, setDiabetesSymptoms] = useState<DiabetesUrgentSymptomValue[]>([]);
  const [adherence, setAdherence] = useState<MedicationAdherenceLevelValue | ''>('');
  const [systolic, setSystolic] = useState('');
  const [diastolic, setDiastolic] = useState('');
  const [steps, setSteps] = useState<ClosingStep[]>([]);
  const [outcome, setOutcome] = useState<ContactOutcome>('REACHED');
  const [destination, setDestination] = useState('');
  const [nextOn, setNextOn] = useState(contact.suggestedNextOn ?? '');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const s = Number(systolic);
  const d = Number(diastolic);
  const hasReading = systolic !== '' && diastolic !== '';
  const readingError =
    (systolic !== '') !== (diastolic !== '')
      ? 'Enter both numbers of the reading, or neither.'
      : hasReading && (!Number.isInteger(s) || !Number.isInteger(d))
        ? 'Enter whole numbers.'
        : undefined;
  const findings = [
    ...deriveHypertensionEscalation({
      symptoms,
      systolicBp: hasReading && !readingError ? s : null,
      diastolicBp: hasReading && !readingError ? d : null,
    }).reasons.map((reason) => HYPERTENSION_ESCALATION_REASON_LABELS[reason]),
    ...deriveDiabetesEscalation({ urgentSymptoms: diabetesSymptoms }).reasons.map(
      (reason) => DIABETES_ESCALATION_REASON_LABELS[reason],
    ),
  ];
  const today = new Date().toISOString().slice(0, 10);

  async function save(input: RecordAttemptInput) {
    if (!userId) return setError('Sign in again to record this contact.');
    setSaving(true);
    setError(null);
    const name = contact.patient.name;
    try {
      // Each save is one attempt: three unanswered calls are three, not one retried write.
      const result = await submitFollowUpAttempt(
        { clinicId, contact, attemptId: generateClientId(), attempt: input },
        { getToken, isOnline: online, actor: { userId, displayName } },
      );
      if (result.outcome === 'refused') {
        setError(
          result.error.status === 409
            ? 'This contact is no longer open. Refresh the list.'
            : getErrorMessage(result.error),
        );
        setSaving(false);
        return;
      }
      const reached = input.outcome !== 'ATTEMPTED';
      if (result.outcome === 'queued') {
        onRecorded({
          contactStatus: reached ? 'DONE' : 'DUE',
          urgent: findings.length > 0 && reached,
          queued: true,
          message: `Saved ${name}'s contact on this device. It sends when you reconnect${
            reached && findings.length > 0 ? ', and the urgent flag is raised then' : ''
          }.`,
        });
        return;
      }
      onRecorded({
        contactStatus: result.contactStatus,
        urgent: result.urgent,
        message:
          result.contactStatus === 'DONE'
            ? `Recorded ${name}'s contact.${result.urgent ? ' An urgent flag was raised for the clinic.' : ''}`
            : `Recorded that ${name} was not reached. The contact stays on the list.`,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The contact could not be saved.');
      setSaving(false);
    }
  }

  async function notReached(reason: NotReachedReason) {
    await save({ mode, outcome: 'ATTEMPTED', notReachedReason: reason });
  }

  async function submitReached() {
    if (readingError) return setError(readingError);
    if (outcome === 'REFERRED' && !destination.trim()) {
      return setError('Say where they were referred.');
    }
    await save({
      mode,
      outcome,
      symptoms: symptoms.filter((symptom) => symptom !== 'NONE'),
      ...(contact.asksDiabetes
        ? { diabetesSymptoms: diabetesSymptoms.filter((symptom) => symptom !== 'NONE') }
        : {}),
      ...(adherence ? { adherence } : {}),
      ...(hasReading ? { reportedSystolicBp: s, reportedDiastolicBp: d } : {}),
      closingSteps: steps,
      ...(outcome === 'REFERRED' ? { referralDestination: destination.trim() } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
      ...(nextOn && nextOn !== contact.suggestedNextOn ? { nextContactOn: nextOn } : {}),
    });
  }

  async function cancel(reason: CancelReason) {
    const stops = STOPPING_CANCEL_REASONS.includes(reason);
    const confirmed = await confirmAction({
      title: stops ? 'Stop all follow-up for this patient?' : 'Cancel this contact?',
      description: stops
        ? `${CANCEL_REASON_LABELS[reason]}: every open contact for ${contact.patient.name} is cancelled, and none are booked until they are next seen at the clinic.`
        : 'Only this contact is cancelled. The next one is booked from their tier as usual.',
      confirmLabel: stops ? 'Stop follow-up' : 'Cancel contact',
      cancelLabel: 'Keep it',
      destructive: stops,
    });
    if (!confirmed) return;
    setSaving(true);
    setError(null);
    try {
      await cancelContact(clinicId, contact.id, reason, getToken);
      onRecorded({
        contactStatus: 'DONE',
        urgent: false,
        message: stops
          ? `Stopped follow-up for ${contact.patient.name}.`
          : `Cancelled ${contact.patient.name}'s contact.`,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The contact could not be cancelled.');
      setSaving(false);
    }
  }

  const location = contact.location;
  const disabled = saving;

  return (
    <>
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
        {!online ? (
          <InlineNotice tone="info" live={false}>
            You are offline. What you record stays on this device and sends when you reconnect.
          </InlineNotice>
        ) : null}

        <section aria-labelledby="contact-how" className="space-y-3">
          <h3 id="contact-how" className="type-label font-semibold text-foreground">
            Reach them
          </h3>
          {contact.patient.phoneE164 ? (
            <Button asChild size="lg" className="w-full justify-center">
              <a href={`tel:${contact.patient.phoneE164}`}>
                <Phone aria-hidden="true" /> Call {contact.patient.phoneE164}
              </a>
            </Button>
          ) : (
            <p className="type-body text-muted-foreground">No phone number on the record.</p>
          )}
          {location && (location.community || location.landmark || location.latitude != null) ? (
            <div className="type-body rounded-md border border-border px-3 py-2">
              <p className="text-foreground">
                {[location.community, location.landmark, location.digitalAddress]
                  .filter(Boolean)
                  .join(' · ') || 'Home position recorded'}
              </p>
              {location.latitude != null && location.longitude != null ? (
                <a
                  href={googleMapsUrl({
                    latitude: location.latitude,
                    longitude: location.longitude,
                  })}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-11 items-center gap-1.5 font-medium text-primary underline-offset-4 hover:underline sm:min-h-0"
                >
                  <MapPin aria-hidden="true" className="h-4 w-4" /> Open in Maps
                </a>
              ) : null}
            </div>
          ) : null}
          <ChoiceQuestion
            id="contact-mode"
            label="How you tried"
            value={mode}
            onChange={(value) => setMode(value as ContactMode)}
            options={ATTEMPT_MODES}
            labels={CONTACT_MODE_LABELS}
            disabled={disabled}
          />
          <p aria-hidden="true" className="type-label pt-1 text-foreground">
            Did you reach them?
          </p>
          <SegmentedControl
            label="Did you reach them?"
            value={reached || 'unset'}
            options={[
              { value: 'yes', label: 'Reached them' },
              { value: 'no', label: 'Not reached' },
            ]}
            onChange={(value) => setReached(value as 'yes' | 'no')}
          />
        </section>

        {reached === 'no' ? (
          <section aria-labelledby="contact-not-reached" className="space-y-3">
            <h3 id="contact-not-reached" className="type-label font-semibold text-foreground">
              Why not? Saves at once.
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(NOT_REACHED_LABELS) as NotReachedReason[]).map((reason) => (
                <Button
                  key={reason}
                  variant="outline"
                  disabled={disabled}
                  onClick={() => void notReached(reason)}
                >
                  {NOT_REACHED_LABELS[reason]}
                </Button>
              ))}
            </div>
          </section>
        ) : null}

        {reached === 'yes' ? (
          <>
            <MultiChoiceQuestion
              id="contact-symptoms"
              ask="Since we last saw you, have you had any of these? Read each one out."
              label="Danger signs"
              value={symptoms}
              onChange={(value) => setSymptoms(value as HypertensionSymptomValue[])}
              options={SYMPTOM_OPTIONS}
              labels={HYPERTENSION_SYMPTOM_LABELS}
              exclusive={['NONE']}
              disabled={disabled}
            />
            {contact.asksDiabetes ? (
              <MultiChoiceQuestion
                id="contact-diabetes-symptoms"
                ask="And for their diabetes: any of these today?"
                label="Diabetes danger signs"
                value={diabetesSymptoms}
                onChange={(value) => setDiabetesSymptoms(value as DiabetesUrgentSymptomValue[])}
                options={DIABETES_URGENT_SYMPTOMS}
                labels={DIABETES_URGENT_SYMPTOM_LABELS}
                exclusive={['NONE']}
                disabled={disabled}
              />
            ) : null}
            {findings.length > 0 ? (
              <InlineNotice
                tone="error"
                className="motion-safe:animate-in motion-safe:fade-in-0 duration-200 ease-out"
              >
                <span className="block font-semibold" data-testid="contact-urgent">
                  Urgent: they need to be seen today.
                </span>
                <span className="block">
                  {findings.join(' · ')}. Saving raises an urgent flag for the clinic
                  {online ? '' : ' once this device reconnects'}. Tell them to come in now or go to
                  the nearest emergency unit.
                </span>
              </InlineNotice>
            ) : null}
            <ChoiceQuestion
              id="contact-adherence"
              ask="Are you taking your medicines as prescribed?"
              label="Taking medicines"
              value={adherence}
              onChange={(value) => setAdherence(value as MedicationAdherenceLevelValue)}
              options={ADHERENCE_OPTIONS}
              labels={MEDICATION_ADHERENCE_LEVEL_LABELS}
              disabled={disabled}
            />
            <fieldset className="space-y-2">
              <legend className="type-label font-semibold text-foreground">
                A reading they took themselves
              </legend>
              <p className="text-sm text-muted-foreground">
                Saved as reported by the patient, never as a measured vital.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <NumberQuestion
                  id="contact-systolic"
                  label="Systolic (top)"
                  value={systolic}
                  onChange={setSystolic}
                  disabled={disabled}
                />
                <NumberQuestion
                  id="contact-diastolic"
                  label="Diastolic (bottom)"
                  value={diastolic}
                  onChange={setDiastolic}
                  error={readingError}
                  disabled={disabled}
                />
              </div>
            </fieldset>
            <fieldset className="space-y-2">
              <legend className="type-label font-semibold text-foreground">
                Before you finish
              </legend>
              {CLOSING_STEPS.map((step) => (
                <CheckboxQuestion
                  key={step}
                  id={`contact-step-${step}`}
                  label={CLOSING_STEP_LABELS[step]}
                  checked={steps.includes(step)}
                  onChange={(checked) =>
                    setSteps((now) =>
                      checked ? [...now, step] : now.filter((item) => item !== step),
                    )
                  }
                  disabled={disabled}
                />
              ))}
            </fieldset>
            <ChoiceQuestion
              id="contact-outcome"
              label="Outcome"
              value={outcome}
              onChange={(value) => setOutcome(value as ContactOutcome)}
              options={REACHED_OUTCOMES}
              labels={REACHED_OUTCOME_LABELS}
              disabled={disabled}
            />
            {outcome === 'REFERRED' ? (
              <div className="space-y-2">
                <Label htmlFor="contact-destination">Referred to</Label>
                <Input
                  id="contact-destination"
                  value={destination}
                  maxLength={200}
                  onChange={(event) => setDestination(event.target.value)}
                  disabled={disabled}
                />
                <p className="text-sm text-muted-foreground">
                  A call to confirm they got there is booked for a week from today.
                </p>
              </div>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="contact-next">Next contact</Label>
              <Input
                id="contact-next"
                type="date"
                min={today}
                value={nextOn}
                onChange={(event) => setNextOn(event.target.value)}
                disabled={disabled}
              />
              <p className="text-sm text-muted-foreground">
                {contact.suggestedNextOn
                  ? `Their tier suggests ${formatDueDay(contact.suggestedNextOn, { year: 'numeric' })}. Change it to the day you agreed.`
                  : 'Their tier sets the next date after saving.'}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact-notes">Notes</Label>
              <Textarea
                id="contact-notes"
                value={notes}
                maxLength={1000}
                rows={3}
                onChange={(event) => setNotes(event.target.value)}
                disabled={disabled}
              />
            </div>
          </>
        ) : null}

        {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}

        <details className="type-body border-t border-border pt-4">
          <summary className="cursor-pointer text-muted-foreground">
            This contact is no longer needed
          </summary>
          {!online ? (
            <p className="mt-3 text-sm text-muted-foreground">Cancelling needs a connection.</p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            {CANCEL_REASONS.map((reason) => (
              <Button
                key={reason}
                variant="outline"
                size="sm"
                disabled={disabled || !online}
                onClick={() => void cancel(reason)}
              >
                {CANCEL_REASON_LABELS[reason]}
              </Button>
            ))}
          </div>
        </details>
      </div>
      {reached === 'yes' ? (
        <div className="flex shrink-0 justify-end border-t border-border px-5 py-4">
          <Button onClick={() => void submitReached()} disabled={disabled}>
            {saving ? 'Saving…' : 'Save contact'}
          </Button>
        </div>
      ) : null}
    </>
  );
}
