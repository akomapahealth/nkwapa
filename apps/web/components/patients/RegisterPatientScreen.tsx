'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { readApiError } from '@/lib/ops';
import { useSync } from '@/app/ServiceWorkerAndSyncProvider';
import { InlineNotice } from '@/components/feedback/InlineNotice';
import { apiFetch, type GetToken } from '@/lib/api';
import { AppPageHeader } from '@/components/app-shell/AppPageHeader';
import { FormSectionCard } from '@/components/app-shell/FormSectionCard';
import { PhoneInput } from '@/components/PhoneInput';
import { Button } from '@/components/ui/button';
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
import { ProgressiveHelp } from '@/components/ui/progressive-help';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ResidentialLocationFields } from '@/components/patients/ResidentialLocationFields';
import {
  emptyResidentialLocation,
  toResidentialLocationPayload,
  type ResidentialLocationValue,
} from '@/lib/residential-location';
import { FieldError, FieldLabel, RequiredLegend } from '@/components/ui/field';

import { PatientFormErrors, usePatientFormErrors } from './PatientFormErrors';
import styles from './registration-workspace.module.css';

interface CreatePatientBody {
  firstName: string;
  lastName: string;
  dob?: string;
  sex?: 'MALE' | 'FEMALE' | 'OTHER' | 'UNKNOWN';
  phoneE164?: string;
  email?: string;
  nationalIdType: 'VOTER_ID' | 'NATIONAL_ID' | 'PASSPORT' | 'OTHER' | 'NONE';
  nationalId: string;
}

interface ExistingPatient {
  id: string;
  patientCode: string;
  firstName: string;
  lastName: string;
  nationalIdLast4: string | null;
}

/**
 * Registering a patient, for both `/patients/new` and `/clinics/:clinicId/patients/new`.
 *
 * The route files differ only in where the clinic id comes from. Everything the two used to pass
 * separately — where "back" and "cancel" go, and what that link is called — is the same registry
 * for both, so it is derived here rather than handed in twice.
 */
export function RegisterPatientScreen({
  clinicId,
  getToken,
}: {
  clinicId: string;
  getToken: GetToken | null | undefined;
}) {
  const workspace = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = workspace.current;
    if (!root) return;
    const navigation = document.querySelector<HTMLElement>('nav[aria-label="Primary"]');
    const chat = document.querySelector<HTMLElement>('[data-testid="chat-toggle"]');
    const measure = () => {
      if (navigation)
        root.style.setProperty(
          '--registration-nav-clearance',
          `${navigation.getBoundingClientRect().height}px`,
        );
      if (chat)
        root.style.setProperty(
          '--registration-chat-clearance',
          `${Math.max(88, window.innerWidth - chat.getBoundingClientRect().left + 12)}px`,
        );
    };
    // Navigation labels and the chat launcher grow with text size. Their actual
    // geometry, rather than the shell's nominal height, owns the phone clearance.
    const observer = new ResizeObserver(measure);
    if (navigation) observer.observe(navigation);
    if (chat) observer.observe(chat);
    window.addEventListener('resize', measure);
    measure();
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);
  const router = useRouter();
  const { isOnline } = useSync();
  const validation = usePatientFormErrors();
  const registryHref = `/clinics/${clinicId}/patients`;
  const [form, setForm] = useState<CreatePatientBody>({
    firstName: '',
    lastName: '',
    dob: '',
    sex: 'UNKNOWN',
    phoneE164: '',
    email: '',
    nationalIdType: 'OTHER',
    nationalId: '',
  });
  const [location, setLocation] = useState<ResidentialLocationValue>(emptyResidentialLocation());
  const [loading, setLoading] = useState(false);
  const submitting = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [conflictPatient, setConflictPatient] = useState<ExistingPatient | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!clinicId || !getToken || submitting.current) {
      return;
    }

    submitting.current = true;
    setLoading(true);
    setError(null);
    setConflictPatient(null);

    let leaving = false;
    try {
      const noId = form.nationalIdType === 'NONE';
      const body = {
        ...form,
        // A patient with no ID document has no number to send (#214).
        nationalId: noId ? undefined : form.nationalId,
        dob: form.dob || undefined,
        phoneE164: form.phoneE164 || undefined,
        email: form.email || undefined,
        ...toResidentialLocationPayload(location),
      };

      const response = await apiFetch(`/clinics/${encodeURIComponent(clinicId)}/patients`, {
        method: 'POST',
        body: JSON.stringify(body),
        getToken,
        activeClinicId: clinicId,
      });

      if (response.status === 409) {
        const payload = (await response.json()) as {
          message?: string;
          details?: { existingPatient?: ExistingPatient };
        };
        if (payload.details?.existingPatient) {
          setConflictPatient(payload.details.existingPatient);
        } else {
          // Never a silent refusal: without the matching chart, say what happened.
          setError(payload.message ?? 'A patient with this national ID already exists.');
        }
        return;
      }

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      const patient = (await response.json()) as { id: string };
      router.push(`/clinics/${clinicId}/patients/${patient.id}`);
      leaving = true;
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
    } finally {
      if (!leaving) {
        submitting.current = false;
        setLoading(false);
      }
    }
  };

  return (
    <div ref={workspace} className={styles.workspace}>
      <Button variant="ghost" asChild className="w-fit">
        <Link href={registryHref}>
          <ArrowLeft className="h-4 w-4" />
          Back to Patients
        </Link>
      </Button>

      <AppPageHeader
        title="Register a new patient"
        description="Capture the essentials and move the patient into care."
        helpTitle="How registration works"
        helpText="Record identity, contact details, and a trusted ID in one pass. Nkwapa checks for duplicate national IDs before it creates the chart. A patient with no ID document can still be registered, and the ID added later."
      />

      <Dialog
        open={!!conflictPatient}
        onOpenChange={(open) => {
          if (!open) {
            setConflictPatient(null);
          }
        }}
      >
        <DialogContent className={styles.conflict}>
          <DialogHeader>
            <DialogTitle>Patient already exists</DialogTitle>
            <DialogDescription>
              A patient with this national ID is already in the system.
            </DialogDescription>
          </DialogHeader>
          {conflictPatient ? (
            <div className="min-w-0 border-y border-rule py-4 text-sm">
              <p className="break-words font-sans font-medium">
                {conflictPatient.firstName} {conflictPatient.lastName}
              </p>
              <p className="break-words font-mono text-muted-foreground">
                {conflictPatient.patientCode}
              </p>
              {conflictPatient.nationalIdLast4 ? (
                <p className="text-muted-foreground">ID ...{conflictPatient.nationalIdLast4}</p>
              ) : null}
            </div>
          ) : null}
          <DialogFooter className={styles.conflictActions}>
            <Button variant="outline" onClick={() => setConflictPatient(null)}>
              Review details
            </Button>
            {conflictPatient ? (
              <Button asChild>
                <Link href={`/clinics/${clinicId}/patients/${conflictPatient.id}`}>
                  Open existing patient
                </Link>
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex flex-col gap-4">
        <ProgressiveHelp
          title="Before you save"
          className="rounded-none border-x-0 border-t-0 bg-transparent shadow-none"
        >
          Capture the most reliable identity details available today. If the patient has no ID
          document at all, choose &ldquo;No ID document&rdquo;: the chart is identified by its
          patient code, and the ID can be added from the chart when they bring one. Without an ID,
          Nkwapa relies on name, date of birth and phone to spot duplicates, so fill those in.
        </ProgressiveHelp>

        <form
          onSubmit={handleSubmit}
          onInvalidCapture={validation.onInvalidCapture}
          onChange={validation.onChange}
          className={styles.form}
        >
          {!isOnline ? (
            <InlineNotice tone="warning">
              You are offline. Connect to create this patient record.
            </InlineNotice>
          ) : null}
          <PatientFormErrors errors={validation.errors} message={conflictPatient ? null : error} />
          <RequiredLegend />
          <div className={styles.sections}>
            <FormSectionCard
              title="Identity"
              description="Start with the patient’s core demographic details."
              hint="Use the legal or most reliable identity details available during intake."
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <FieldLabel htmlFor="firstName" required>
                    First name
                  </FieldLabel>
                  <Input
                    id="firstName"
                    {...validation.fieldProps('firstName')}
                    required
                    value={form.firstName}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setForm((current) => ({ ...current, firstName: value }));
                    }}
                  />
                  <FieldError
                    reserveSpace={validation.submitted}
                    id="firstName"
                    message={validation.fieldMessage('firstName')}
                  />
                </div>
                <div className="space-y-2">
                  <FieldLabel htmlFor="lastName" required>
                    Last name
                  </FieldLabel>
                  <Input
                    id="lastName"
                    {...validation.fieldProps('lastName')}
                    required
                    value={form.lastName}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setForm((current) => ({ ...current, lastName: value }));
                    }}
                  />
                  <FieldError
                    reserveSpace={validation.submitted}
                    id="lastName"
                    message={validation.fieldMessage('lastName')}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dob">Date of birth</Label>
                  <Input
                    id="dob"
                    {...validation.fieldProps('dob')}
                    type="date"
                    value={form.dob}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setForm((current) => ({ ...current, dob: value }));
                    }}
                  />
                  <FieldError
                    reserveSpace={validation.submitted}
                    id="dob"
                    message={validation.fieldMessage('dob')}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sex">Sex</Label>
                  <Select
                    value={form.sex}
                    onValueChange={(value) =>
                      setForm((current) => ({
                        ...current,
                        sex: value as CreatePatientBody['sex'],
                      }))
                    }
                  >
                    <SelectTrigger id="sex">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="UNKNOWN">Unknown</SelectItem>
                      <SelectItem value="MALE">Male</SelectItem>
                      <SelectItem value="FEMALE">Female</SelectItem>
                      <SelectItem value="OTHER">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </FormSectionCard>

            <FormSectionCard
              title="Contact details"
              description="Add the best follow-up channels your team can use after today’s visit."
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="patient-phone">Phone (Ghana)</Label>
                  <PhoneInput
                    id="patient-phone"
                    value={form.phoneE164}
                    onChange={(value) => setForm((current) => ({ ...current, phoneE164: value }))}
                    placeholder="024 123 4567"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    {...validation.fieldProps('email')}
                    type="email"
                    value={form.email}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setForm((current) => ({ ...current, email: value }));
                    }}
                  />
                  <FieldError
                    reserveSpace={validation.submitted}
                    id="email"
                    message={validation.fieldMessage('email')}
                  />
                </div>
              </div>
            </FormSectionCard>

            <ResidentialLocationFields value={location} onChange={setLocation} />

            <FormSectionCard
              title="National ID"
              description="The ID check runs when you save this form."
              hint="Choose the document the patient showed. If they have none, choose “No ID document” and add the ID later from the chart."
            >
              <div className="grid gap-4 sm:grid-cols-[minmax(0,220px),minmax(0,1fr)]">
                <div className="space-y-2">
                  <Label htmlFor="nationalIdType">National ID type</Label>
                  <Select
                    value={form.nationalIdType}
                    onValueChange={(value) => {
                      validation.clear('nationalId');
                      setForm((current) => ({
                        ...current,
                        nationalIdType: value as CreatePatientBody['nationalIdType'],
                      }));
                    }}
                  >
                    <SelectTrigger id="nationalIdType">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="OTHER">Other</SelectItem>
                      <SelectItem value="VOTER_ID">Voter ID</SelectItem>
                      <SelectItem value="NATIONAL_ID">National ID</SelectItem>
                      <SelectItem value="PASSPORT">Passport</SelectItem>
                      <SelectItem value="NONE">No ID document</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {form.nationalIdType === 'NONE' ? (
                  <p className="self-end text-sm text-muted-foreground">
                    No ID number. The patient code identifies this chart until an ID is added.
                  </p>
                ) : (
                  <div className="space-y-2">
                    <FieldLabel htmlFor="nationalId" required>
                      National ID
                    </FieldLabel>
                    <Input
                      id="nationalId"
                      {...validation.fieldProps('nationalId')}
                      required
                      value={form.nationalId}
                      onChange={(event) => {
                        const value = event.currentTarget.value;
                        setForm((current) => ({ ...current, nationalId: value }));
                      }}
                    />
                    <FieldError
                      reserveSpace={validation.submitted}
                      id="nationalId"
                      message={validation.fieldMessage('nationalId')}
                    />
                  </div>
                )}
              </div>
            </FormSectionCard>
          </div>
          <div
            className={styles.actions}
            aria-label="Registration actions"
            role="group"
            data-sticky-actions
          >
            <Button type="submit" disabled={loading} aria-busy={loading || undefined}>
              {loading ? 'Creating...' : 'Create patient'}
            </Button>
            <Button variant="outline" asChild>
              <Link href={registryHref}>Cancel</Link>
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
