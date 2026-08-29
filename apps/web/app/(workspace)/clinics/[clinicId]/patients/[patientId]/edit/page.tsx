'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { apiFetch } from '@/lib/api';
import { db } from '@/lib/db';
import { enqueueOutboxMutation, SYNC_OPERATION } from '@/lib/outbox';
import { AppMetricCard } from '@/components/app-shell/AppMetricCard';
import { AppPageHeader } from '@/components/app-shell/AppPageHeader';
import { FormSectionCard } from '@/components/app-shell/FormSectionCard';
import { InlineErrorState, SectionSkeleton } from '@/components/feedback/AppState';
import { RouteGuard } from '@/components/RouteGuard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { InlineNotice } from '@/components/ops/OpsShared';
import { ProgressiveHelp } from '@/components/ui/progressive-help';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ArrowLeft, FilePenLine, ShieldCheck, UserRoundPen } from 'lucide-react';
import { ResidentialLocationFields } from '@/components/patients/ResidentialLocationFields';
import {
  emptyResidentialLocation,
  toResidentialLocationPayload,
  toResidentialLocationValue,
  type PatientLocationStatus,
  type ResidentialLocationValue,
} from '@/lib/residential-location';

interface PatientData {
  id: string;
  patientCode: string;
  firstName: string;
  lastName: string;
  dob?: string | null;
  sex: string;
  phoneE164?: string | null;
  email?: string | null;
  nationalIdLast4?: string | null;
  residentialLocationStatus?: PatientLocationStatus | string | null;
  residentialRegion?: string | null;
  residentialDistrict?: string | null;
  residentialCommunity?: string | null;
  residentialAddressNote?: string | null;
}

function EditPatientForm() {
  const params = useParams();
  const router = useRouter();
  const clinicId = params.clinicId as string;
  const patientId = params.patientId as string;
  const getToken = useAuth();

  const [patient, setPatient] = useState<PatientData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dob, setDob] = useState('');
  const [sex, setSex] = useState('UNKNOWN');
  const [phoneE164, setPhoneE164] = useState('');
  const [email, setEmail] = useState('');
  const [location, setLocation] = useState<ResidentialLocationValue>(emptyResidentialLocation());

  const fetchPatient = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(
        `/patients/${encodeURIComponent(patientId)}?clinicId=${encodeURIComponent(clinicId)}`,
        { getToken, activeClinicId: clinicId },
      );
      if (!res.ok) throw new Error(await res.text());
      const json = (await res.json()) as { patient: PatientData };
      populateForm(json.patient);
    } catch {
      try {
        const local = await db.patients.get(patientId);
        if (local) {
          populateForm({
            id: local.id,
            patientCode: local.patientCode,
            firstName: local.firstName,
            lastName: local.lastName,
            dob: local.dob,
            sex: local.sex ?? 'UNKNOWN',
            phoneE164: local.phoneE164,
            email: local.email,
            nationalIdLast4: local.nationalIdLast4,
            residentialLocationStatus: local.residentialLocationStatus,
            residentialRegion: local.residentialRegion,
            residentialDistrict: local.residentialDistrict,
            residentialCommunity: local.residentialCommunity,
            residentialAddressNote: local.residentialAddressNote,
          });
        } else {
          setError('Patient not found');
        }
      } catch (localErr) {
        setError(localErr instanceof Error ? localErr.message : 'Failed to load patient');
      }
    } finally {
      setLoading(false);
    }
  }, [patientId, clinicId, getToken]);

  function populateForm(p: PatientData) {
    setPatient(p);
    setFirstName(p.firstName);
    setLastName(p.lastName);
    setDob(p.dob ? p.dob.substring(0, 10) : '');
    setSex(p.sex);
    setPhoneE164(p.phoneE164 ?? '');
    setEmail(p.email ?? '');
    setLocation(toResidentialLocationValue(p));
  }

  useEffect(() => {
    fetchPatient();
  }, [fetchPatient]);

  const handleSave = async () => {
    if (!patient) return;
    setSaving(true);
    setError(null);

    const body: Record<string, unknown> = {};
    if (firstName !== patient.firstName) body.firstName = firstName;
    if (lastName !== patient.lastName) body.lastName = lastName;
    const newDob = dob || null;
    const oldDob = patient.dob ? patient.dob.substring(0, 10) : null;
    if (newDob !== oldDob) body.dob = dob || undefined;
    if (sex !== patient.sex) body.sex = sex;
    if (phoneE164 !== (patient.phoneE164 ?? '')) body.phoneE164 = phoneE164;
    if (email !== (patient.email ?? '')) body.email = email;

    // Residential location is diffed and sent as a coherent block; the server
    // re-applies the status invariant.
    const locationPayload = toResidentialLocationPayload(location);
    const currentStatus = patient.residentialLocationStatus ?? 'NOT_RECORDED';
    const locationChanged =
      locationPayload.residentialLocationStatus !== currentStatus ||
      (locationPayload.residentialRegion ?? null) !== (patient.residentialRegion ?? null) ||
      (locationPayload.residentialDistrict ?? null) !== (patient.residentialDistrict ?? null) ||
      (locationPayload.residentialCommunity ?? null) !== (patient.residentialCommunity ?? null) ||
      (locationPayload.residentialAddressNote ?? null) !== (patient.residentialAddressNote ?? null);
    if (locationChanged) {
      Object.assign(body, locationPayload);
    }

    if (Object.keys(body).length === 0) {
      router.push(`/clinics/${clinicId}/patients/${patientId}`);
      return;
    }

    try {
      const res = await apiFetch(
        `/clinics/${encodeURIComponent(clinicId)}/patients/${encodeURIComponent(patientId)}`,
        {
          method: 'PATCH',
          body: JSON.stringify(body),
          getToken,
          activeClinicId: clinicId,
        },
      );
      if (!res.ok) throw new Error(await res.text());
      router.push(`/clinics/${clinicId}/patients/${patientId}`);
    } catch {
      try {
        const now = new Date().toISOString();
        const existing = await db.patients.get(patientId);
        if (existing) {
          const updated = { ...existing, ...body, updatedAt: now };
          await db.patients.put(updated);
          await enqueueOutboxMutation(db, {
            clinicId,
            entityType: 'patient',
            entityId: patientId,
            operation: SYNC_OPERATION.UPSERT,
            payloadJson: {
              ...updated,
              nationalId: undefined,
            },
          });
        }
        router.push(`/clinics/${clinicId}/patients/${patientId}`);
      } catch (offlineErr) {
        setError(offlineErr instanceof Error ? offlineErr.message : 'Failed to save changes');
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading && !patient) {
    return <SectionSkeleton lines={5} className="p-6" />;
  }

  if (!patient) {
    return (
      <div className="space-y-4">
        <InlineErrorState
          title="We couldn't open this chart for editing"
          description={error ?? 'This patient could not be loaded.'}
          onRetry={() => void fetchPatient()}
          retryLabel="Try again"
        />
        <Button asChild variant="outline">
          <Link href={`/clinics/${clinicId}/patients`}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Patients
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" className="w-fit">
        <Link href={`/clinics/${clinicId}/patients/${patientId}`}>
          <ArrowLeft className="h-4 w-4" />
          Back to Patient
        </Link>
      </Button>

      <AppPageHeader
        eyebrow="Clinic chart maintenance"
        title={`Edit Patient ${patient.patientCode}`}
        description="Update the current chart without changing protected identity history."
        helpTitle="How patient edits work"
        helpText="Demographics and contact details can change here. National ID details stay protected, and offline saves queue a sync when the network is unavailable."
      />

      <div className="grid gap-4 md:grid-cols-3">
        <AppMetricCard
          title="Record"
          value={patient.patientCode}
          icon={UserRoundPen}
          detail="The patient code remains constant while demographic details are updated."
        />
        <AppMetricCard
          title="National ID"
          value={patient.nationalIdLast4 ? `...${patient.nationalIdLast4}` : 'Not stored'}
          icon={ShieldCheck}
          detail="National ID details are treated as immutable during edit mode."
        />
        <AppMetricCard
          title="Workflow"
          value="Editable"
          icon={FilePenLine}
          detail="Changes save back to the clinic chart and sync through the offline queue when needed."
        />
      </div>

      {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}

      <div className="max-w-5xl space-y-4">
        <ProgressiveHelp title="What stays protected">
          National ID details remain read-only during edit mode so chart history stays stable. If
          identity cleanup is needed, use the clinic’s governed patient workflows instead of editing
          around the protected record.
        </ProgressiveHelp>

        <FormSectionCard
          title={`Edit ${patient.patientCode}`}
          description="Adjust the patient’s current demographic profile."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="firstName">First name</Label>
              <Input
                id="firstName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Last name</Label>
              <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dob">Date of birth</Label>
              <Input id="dob" type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sex">Sex</Label>
              <Select value={sex} onValueChange={setSex}>
                <SelectTrigger id="sex">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MALE">Male</SelectItem>
                  <SelectItem value="FEMALE">Female</SelectItem>
                  <SelectItem value="OTHER">Other</SelectItem>
                  <SelectItem value="UNKNOWN">Unknown</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </FormSectionCard>

        <FormSectionCard
          title="Contact details"
          description="Keep the best current follow-up channels on file."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="phoneE164">Phone</Label>
              <Input
                id="phoneE164"
                value={phoneE164}
                onChange={(e) => setPhoneE164(e.target.value)}
                placeholder="e.g. 0241234567"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>
        </FormSectionCard>

        <ResidentialLocationFields value={location} onChange={setLocation} />

        <FormSectionCard
          title="Protected identity fields"
          description="These are shown for confirmation only and cannot be changed here."
        >
          {patient.nationalIdLast4 ? (
            <p className="text-sm tabular-nums text-muted-foreground">
              National ID: ...{patient.nationalIdLast4} (immutable)
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              No national ID fragment is available in this view.
            </p>
          )}
        </FormSectionCard>

        <div className="flex flex-wrap gap-2 rounded-lg border border-border/70 bg-card p-4">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save changes'}
          </Button>
          <Button asChild variant="outline">
            <Link href={`/clinics/${clinicId}/patients/${patientId}`}>Cancel</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

/*
  The guard wraps the form rather than sitting inside it, so the chart is never read and the
  fields are never rendered for someone who may not edit. The route used to answer the question
  itself, after the fetch, with a destructive-coloured paragraph; a refusal is not an error.
*/
export default function EditPatientPage() {
  return (
    <RouteGuard requiredPermission="PATIENT.UPDATE">
      <EditPatientForm />
    </RouteGuard>
  );
}
