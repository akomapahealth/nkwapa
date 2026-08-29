'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useBootstrap } from '@/lib/bootstrap-context';
import { useAuth } from '@/lib/auth-context';
import { useSync } from '@/app/ServiceWorkerAndSyncProvider';
import { apiFetch } from '@/lib/api';
import { InlineErrorState, SectionSkeleton } from '@/components/feedback/AppState';
import { InlineNotice } from '@/components/ops/OpsShared';
import { RouteGuard } from '@/components/RouteGuard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { VitalsForm } from '@/components/VitalsForm';
import { DiabetesScreeningForm } from '@/components/DiabetesScreeningForm';
import { HypertensionForm } from '@/components/HypertensionForm';

const STEPS = ['confirm', 'vitals', 'htn', 'diabetes', 'review'] as const;

function NewEncounterFlow({ clinicId }: { clinicId: string }) {
  const params = useParams();
  const router = useRouter();
  const patientId = params.patientId as string;
  const getToken = useAuth();
  const bootstrap = useBootstrap()?.bootstrap ?? null;
  const { syncNow } = useSync();
  const userId = bootstrap?.userId ?? '';

  // The visit is recorded against the chart in this clinic, so every link back to the patient
  // uses the canonical clinic-scoped address rather than the legacy redirect.
  const patientHref = `/clinics/${clinicId}/patients/${patientId}`;

  const [step, setStep] = useState(0);
  const [encounterId, setEncounterId] = useState<string | null>(null);
  const [patient, setPatient] = useState<{
    firstName: string;
    lastName: string;
    patientCode: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createEncounter = useCallback(async () => {
    if (!clinicId || !getToken) return null;
    const res = await apiFetch(`/clinics/${encodeURIComponent(clinicId)}/encounters`, {
      method: 'POST',
      body: JSON.stringify({ patientId }),
      getToken,
    });
    if (!res.ok) throw new Error(await res.text());
    const enc = (await res.json()) as { id: string };
    return enc.id;
  }, [clinicId, patientId, getToken]);

  useEffect(() => {
    if (!clinicId || !getToken) return;
    let cancelled = false;
    (async () => {
      try {
        const patientRes = await apiFetch(
          `/patients/${encodeURIComponent(patientId)}?clinicId=${encodeURIComponent(clinicId)}`,
          { getToken },
        );
        if (!patientRes.ok) throw new Error(await patientRes.text());
        const data = (await patientRes.json()) as {
          patient: { firstName: string; lastName: string; patientCode: string };
        };
        if (cancelled) return;
        setPatient(data.patient);
        const encId = await createEncounter();
        if (cancelled) return;
        setEncounterId(encId);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clinicId, patientId, getToken, createEncounter]);

  const handleSubmitForReview = async () => {
    if (!encounterId || !getToken || !clinicId) return;
    setSubmitting(true);
    setError(null);
    try {
      await syncNow(clinicId);
      const res = await apiFetch(`/encounters/${encodeURIComponent(encounterId)}/submit`, {
        method: 'POST',
        getToken,
      });
      if (!res.ok) throw new Error(await res.text());
      router.push(`/encounters/${encounterId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !encounterId || !patient) {
    if (error) {
      return (
        <div className="space-y-4">
          <InlineErrorState title="We couldn't start this visit" description={error} />
          <Button asChild variant="outline">
            <Link href={patientHref}>Back to Patient</Link>
          </Button>
        </div>
      );
    }

    return <SectionSkeleton lines={3} className="p-6" />;
  }

  const currentStep = STEPS[step];
  const isLastStep = step === STEPS.length - 1;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" asChild>
          <Link href={patientHref}>
            <ArrowLeft className="h-4 w-4" />
            Back to Patient
          </Link>
        </Button>
        <span className="text-sm text-muted-foreground">
          Step {step + 1} of {STEPS.length}
        </span>
      </div>

      <div className="flex gap-2">
        {STEPS.map((s, i) => (
          <div
            key={s}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              i <= step ? 'bg-primary' : 'bg-muted'
            }`}
          />
        ))}
      </div>

      {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}

      {currentStep === 'confirm' && (
        <Card>
          <CardHeader>
            <h2 className="font-heading text-xl font-semibold">Confirm Patient</h2>
          </CardHeader>
          <CardContent>
            <p className="text-lg">
              {patient.firstName} {patient.lastName}
            </p>
            <p className="font-mono text-muted-foreground">{patient.patientCode}</p>
            <Button className="mt-4" onClick={() => setStep(1)}>
              Continue to Vitals
            </Button>
          </CardContent>
        </Card>
      )}

      {currentStep === 'vitals' && (
        <VitalsForm
          clinicId={clinicId}
          encounterId={encounterId}
          recordedByUserId={userId}
          onSaved={() => setStep(2)}
        />
      )}

      {currentStep === 'htn' && (
        <HypertensionForm
          clinicId={clinicId}
          encounterId={encounterId}
          onSaved={() => setStep(3)}
        />
      )}

      {currentStep === 'diabetes' && (
        <DiabetesScreeningForm
          clinicId={clinicId}
          encounterId={encounterId}
          recordedByUserId={userId}
          onSaved={() => setStep(4)}
        />
      )}

      {currentStep === 'review' && (
        <Card>
          <CardHeader>
            <h2 className="font-heading text-xl font-semibold">Review &amp; Submit</h2>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              Review the data in each section. You can go back to edit. When ready, submit for
              clinical review.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(3)}>
                Back to Diabetes
              </Button>
              <Button onClick={handleSubmitForReview} disabled={submitting}>
                {submitting ? 'Submitting…' : 'Submit for Clinical Review'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {!isLastStep && currentStep !== 'confirm' && currentStep !== 'review' && (
        <Button variant="outline" onClick={() => setStep((s) => Math.max(0, s - 1))}>
          Back
        </Button>
      )}
    </div>
  );
}

export default function NewEncounterPage() {
  const clinicId = useBootstrap()?.activeClinicId ?? null;

  return (
    <RouteGuard
      requiredPermission="ENCOUNTER.CREATE"
      requiresClinic
      clinicSurface="Starting a patient visit"
    >
      {clinicId ? <NewEncounterFlow clinicId={clinicId} /> : null}
    </RouteGuard>
  );
}
