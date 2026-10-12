'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, FilePenLine, ShieldCheck, UserPlus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { apiFetch, type GetToken } from '@/lib/api';
import { AppMetricCard, AppMetricGroup } from '@/components/app-shell/AppMetricCard';
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
import { InlineNotice } from '@/components/ops/OpsShared';
import { ResidentialLocationFields } from '@/components/patients/ResidentialLocationFields';
import {
  emptyResidentialLocation,
  toResidentialLocationPayload,
  type ResidentialLocationValue,
} from '@/lib/residential-location';
import { FieldLabel, RequiredLegend } from '@/components/ui/field';

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
  const router = useRouter();
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
  const [error, setError] = useState<string | null>(null);
  const [conflictPatient, setConflictPatient] = useState<ExistingPatient | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!clinicId || !getToken) {
      return;
    }

    setLoading(true);
    setError(null);
    setConflictPatient(null);

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
        throw new Error(await response.text());
      }

      const patient = (await response.json()) as { id: string };
      router.push(`/clinics/${clinicId}/patients/${patient.id}`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Button variant="ghost" asChild className="w-fit">
        <Link href={registryHref}>
          <ArrowLeft className="h-4 w-4" />
          Back to Patients
        </Link>
      </Button>

      <AppPageHeader
        eyebrow="Patient intake"
        title="Register a new patient"
        description="Capture the essentials and move the patient into care."
        helpTitle="How registration works"
        helpText="Record identity, contact details, and a trusted ID in one pass. Nkwapa checks for duplicate national IDs before it creates the chart. A patient with no ID document can still be registered, and the ID added later."
      />

      <AppMetricGroup className="md:grid-cols-3">
        <AppMetricCard
          title="Registration mode"
          value="Clinic"
          icon={UserPlus}
          detail="The chart is created directly in the active clinic."
        />
        <AppMetricCard
          title="Duplicate check"
          value="Enabled"
          icon={ShieldCheck}
          detail="National ID matching helps prevent duplicate charts."
        />
        <AppMetricCard
          title="Next step"
          value="Open chart"
          icon={FilePenLine}
          detail="After save, the patient record opens immediately."
        />
      </AppMetricGroup>

      <Dialog
        open={!!conflictPatient}
        onOpenChange={(open) => {
          if (!open) {
            setConflictPatient(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Patient already exists</DialogTitle>
            <DialogDescription>
              A patient with this national ID is already in the system.
            </DialogDescription>
          </DialogHeader>
          {conflictPatient ? (
            <div className="rounded-md border p-4 text-sm">
              <p className="font-medium">
                {conflictPatient.firstName} {conflictPatient.lastName}
              </p>
              <p className="font-mono text-muted-foreground">{conflictPatient.patientCode}</p>
              {conflictPatient.nationalIdLast4 ? (
                <p className="text-muted-foreground">ID ...{conflictPatient.nationalIdLast4}</p>
              ) : null}
            </div>
          ) : null}
          <DialogFooter>
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

      <div className="max-w-5xl space-y-4">
        {error && !conflictPatient ? <InlineNotice tone="error">{error}</InlineNotice> : null}

        <ProgressiveHelp title="Before you save">
          Capture the most reliable identity details available today. If the patient has no ID
          document at all, choose &ldquo;No ID document&rdquo;: the chart is identified by its
          patient code, and the ID can be added from the chart when they bring one. Without an ID,
          Nkwapa relies on name, date of birth and phone to spot duplicates, so fill those in.
        </ProgressiveHelp>

        <form onSubmit={handleSubmit} className="space-y-4">
          <RequiredLegend />
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
                  required
                  value={form.firstName}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, firstName: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <FieldLabel htmlFor="lastName" required>
                  Last name
                </FieldLabel>
                <Input
                  id="lastName"
                  required
                  value={form.lastName}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, lastName: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dob">Date of birth</Label>
                <Input
                  id="dob"
                  type="date"
                  value={form.dob}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, dob: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Sex</Label>
                <Select
                  value={form.sex}
                  onValueChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      sex: value as CreatePatientBody['sex'],
                    }))
                  }
                >
                  <SelectTrigger>
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
                <Label>Phone (Ghana)</Label>
                <PhoneInput
                  value={form.phoneE164}
                  onChange={(value) => setForm((current) => ({ ...current, phoneE164: value }))}
                  placeholder="024 123 4567"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, email: event.target.value }))
                  }
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
                  onValueChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      nationalIdType: value as CreatePatientBody['nationalIdType'],
                    }))
                  }
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
                    required
                    value={form.nationalId}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, nationalId: event.target.value }))
                    }
                  />
                </div>
              )}
            </div>
          </FormSectionCard>

          <div className="flex flex-wrap gap-2 rounded-lg border border-border/70 bg-card p-4">
            <Button type="submit" disabled={loading}>
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
