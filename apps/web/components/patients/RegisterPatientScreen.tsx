'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, FilePenLine, ShieldCheck, UserPlus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { apiFetch, type GetToken } from '@/lib/api';
import { AppMetricCard } from '@/components/app-shell/AppMetricCard';
import { AppPageHeader } from '@/components/app-shell/AppPageHeader';
import { FormSectionCard } from '@/components/app-shell/FormSectionCard';
import { RouteGuard } from '@/components/RouteGuard';
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

interface CreatePatientBody {
  firstName: string;
  lastName: string;
  dob?: string;
  sex?: 'MALE' | 'FEMALE' | 'OTHER' | 'UNKNOWN';
  phoneE164?: string;
  email?: string;
  nationalIdType: 'VOTER_ID' | 'NATIONAL_ID' | 'PASSPORT' | 'OTHER';
  nationalId: string;
}

interface ExistingPatient {
  id: string;
  patientCode: string;
  firstName: string;
  lastName: string;
  nationalIdLast4: string | null;
}

export function RegisterPatientScreen({
  clinicId,
  getToken,
  backHref,
  backLabel,
}: {
  clinicId: string;
  getToken: GetToken | null | undefined;
  backHref: string;
  backLabel: string;
}) {
  const router = useRouter();
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
      const body = {
        ...form,
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
          existingPatient?: ExistingPatient;
        };
        setConflictPatient(payload.existingPatient ?? null);
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
    <RouteGuard requiredPermission="PATIENT.CREATE">
      <div className="space-y-6">
        <Button variant="ghost" asChild className="w-fit rounded-2xl">
          <Link href={backHref}>
            <ArrowLeft className="h-4 w-4" />
            {backLabel}
          </Link>
        </Button>

        <AppPageHeader
          eyebrow="Patient intake"
          title="Register a new patient"
          description="Capture the essentials and move the patient into care."
          helpTitle="How registration works"
          helpText="Record identity, contact details, and a trusted ID in one pass. Nkwapa checks for duplicate national IDs before it creates the chart."
        />

        <div className="grid gap-4 md:grid-cols-3">
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
        </div>

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
            Capture the most reliable identity details available today. If the patient does not have
            a national ID yet, use the document or local identifier your clinic is relying on for
            intake and update the chart later when the official ID is available.
          </ProgressiveHelp>

          <form onSubmit={handleSubmit} className="space-y-4">
            <FormSectionCard
              title="Identity"
              description="Start with the patient’s core demographic details."
              hint="Use the legal or most reliable identity details available during intake."
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First name *</Label>
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
                  <Label htmlFor="lastName">Last name *</Label>
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
              hint="If the patient does not yet have an official national ID, choose the document type you are using at intake and record that identifier instead."
            >
              <div className="grid gap-4 sm:grid-cols-[minmax(0,220px),minmax(0,1fr)]">
                <div className="space-y-2">
                  <Label>National ID type</Label>
                  <Select
                    value={form.nationalIdType}
                    onValueChange={(value) =>
                      setForm((current) => ({
                        ...current,
                        nationalIdType: value as CreatePatientBody['nationalIdType'],
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="OTHER">Other</SelectItem>
                      <SelectItem value="VOTER_ID">Voter ID</SelectItem>
                      <SelectItem value="NATIONAL_ID">National ID</SelectItem>
                      <SelectItem value="PASSPORT">Passport</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="nationalId">National ID *</Label>
                  <Input
                    id="nationalId"
                    required
                    value={form.nationalId}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, nationalId: event.target.value }))
                    }
                  />
                </div>
              </div>
            </FormSectionCard>

            <div className="flex flex-wrap gap-2 rounded-[28px] border border-border/70 bg-card/80 p-4">
              <Button type="submit" disabled={loading} className="rounded-2xl">
                {loading ? 'Creating...' : 'Create patient'}
              </Button>
              <Button variant="outline" asChild className="rounded-2xl">
                <Link href={backHref}>Cancel</Link>
              </Button>
            </div>
          </form>
        </div>
      </div>
    </RouteGuard>
  );
}
