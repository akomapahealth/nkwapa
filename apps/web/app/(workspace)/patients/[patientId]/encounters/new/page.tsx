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
import { FormActions } from '@/components/ui/form-actions';
import styles from '@/components/encounters/encounter-workspace.module.css';
import {
  RecordSection,
  RecordSectionContent,
  RecordSectionHeader,
  RecordSectionTitle,
} from '@/components/patients/RecordSection';
import { VitalsForm } from '@/components/VitalsForm';
import { DiabetesScreeningForm } from '@/components/DiabetesScreeningForm';
import { HypertensionForm } from '@/components/HypertensionForm';
import { DiabetesInterviewForm } from '@/components/encounters/diabetes/DiabetesInterviewForm';
import { HypertensionInterviewForm } from '@/components/encounters/hypertension/HypertensionInterviewForm';
import { isWebFeatureEnabled } from '@/lib/feature-flags';

const STEPS = ['confirm', 'vitals', 'htn', 'diabetes', 'review'] as const;
const STEP_LABELS: Record<(typeof STEPS)[number], string> = {
  confirm: 'Patient',
  vitals: 'Vitals',
  htn: 'Hypertension',
  diabetes: 'Diabetes',
  review: 'Submit',
};

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
  /*
    This wizard rendered the pre-interview forms unconditionally while the encounter page rendered
    the guided ones behind the flag. With the flag on, a volunteer creating a visit here answered
    four hypertension fields and then landed on a tab showing the full interview - two different
    forms writing one record in a single sitting. The flag is read in both places now.
  */
  const guidedChronicTabsEnabled = isWebFeatureEnabled('guidedChronicTabs');
  const perms = bootstrap?.effectivePermissionsForActiveClinic ?? [];
  const canRecordClinicianPlan = perms.includes('CAREPLAN.CLINICIAN_PLAN');

  /*
    The guided hypertension interview reads today's blood pressure through from Vitals rather than
    copying it, and the vitals step immediately before this one is what produces it. Without
    reloading the encounter between steps the interview would show no reading at all on the one
    path where it was certainly just taken.
  */
  const [vitals, setVitals] = useState<Record<string, unknown> | null>(null);
  const [hypertension, setHypertension] = useState<Record<string, unknown> | null>(null);
  const [diabetes, setDiabetes] = useState<Record<string, unknown> | null>(null);
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

  /** Re-read what the previous step wrote, so the next one starts from the saved record. */
  const refreshEncounterRecords = useCallback(
    async (id: string) => {
      if (!getToken) return;
      try {
        const res = await apiFetch(`/encounters/${encodeURIComponent(id)}`, { getToken });
        if (!res.ok) return;
        const enc = (await res.json()) as Record<string, unknown>;
        setVitals((enc.vitals as Record<string, unknown> | undefined) ?? null);
        setHypertension(
          (enc.hypertensionAssessment as Record<string, unknown> | undefined) ?? null,
        );
        setDiabetes((enc.diabetesScreening as Record<string, unknown> | undefined) ?? null);
      } catch {
        // A failed refresh is not a failed step. The forms fall back to their own local record,
        // and the encounter page reloads everything after this flow hands off to it.
      }
    },
    [getToken],
  );

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
      <header className={styles.header}>
        <Link className={styles.back} href={patientHref}>
          <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
          Back to Patient
        </Link>
        <div className={styles.identityRow}>
          <div className={styles.identity}>
            <p className="text-sm text-muted-foreground">New visit</p>
            <h1 className="mt-1 type-page-title">
              {patient.firstName} {patient.lastName}
            </h1>
            <div className={styles.metadata}>
              <span className="font-mono tabular-nums" translate="no">
                {patient.patientCode}
              </span>
              <span className="tabular-nums">
                Step {step + 1} of {STEPS.length}
              </span>
            </div>
          </div>
        </div>
      </header>

      <ol aria-label="Visit steps" className={styles.wizardSteps}>
        {STEPS.map((s, i) => (
          <li
            key={s}
            data-state={i < step ? 'done' : i === step ? 'current' : 'next'}
            aria-current={i === step ? 'step' : undefined}
            className={styles.step}
          >
            {STEP_LABELS[s]}
          </li>
        ))}
      </ol>

      {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}

      {currentStep === 'confirm' && (
        <RecordSection aria-labelledby="new-visit-confirm">
          <RecordSectionHeader>
            <RecordSectionTitle id="new-visit-confirm">Confirm Patient</RecordSectionTitle>
          </RecordSectionHeader>
          <RecordSectionContent>
            <p className="text-muted-foreground">
              Check that the name and patient code above match the person in front of you before you
              record anything.
            </p>
            <FormActions sticky className="mt-4">
              <Button onClick={() => setStep(1)}>Continue to Vitals</Button>
            </FormActions>
          </RecordSectionContent>
        </RecordSection>
      )}

      {currentStep === 'vitals' && (
        <VitalsForm
          clinicId={clinicId}
          encounterId={encounterId}
          recordedByUserId={userId}
          onSaved={() => {
            void refreshEncounterRecords(encounterId);
            setStep(2);
          }}
        />
      )}

      {currentStep === 'htn' &&
        (guidedChronicTabsEnabled ? (
          <HypertensionInterviewForm
            clinicId={clinicId}
            encounterId={encounterId}
            patientId={patientId}
            canRecordClinicianPlan={canRecordClinicianPlan}
            initialData={hypertension}
            vitals={
              vitals
                ? {
                    systolicBp: (vitals.systolicBp as number | null) ?? null,
                    diastolicBp: (vitals.diastolicBp as number | null) ?? null,
                    pulseBpm: (vitals.pulseBpm as number | null) ?? null,
                    weightKg: (vitals.weightKg as number | null) ?? null,
                    heightCm: (vitals.heightCm as number | null) ?? null,
                    bmi: (vitals.bmi as number | null) ?? null,
                    updatedAt: vitals.updatedAt as string,
                  }
                : null
            }
            canEdit
            onSaved={() => {
              void refreshEncounterRecords(encounterId);
              setStep(3);
            }}
          />
        ) : (
          <HypertensionForm
            clinicId={clinicId}
            encounterId={encounterId}
            onSaved={() => setStep(3)}
          />
        ))}

      {currentStep === 'diabetes' &&
        (guidedChronicTabsEnabled ? (
          <DiabetesInterviewForm
            clinicId={clinicId}
            encounterId={encounterId}
            patientId={patientId}
            canRecordClinicianPlan={canRecordClinicianPlan}
            initialData={diabetes}
            canEdit
            onSaved={() => {
              void refreshEncounterRecords(encounterId);
              setStep(4);
            }}
          />
        ) : (
          <DiabetesScreeningForm
            clinicId={clinicId}
            encounterId={encounterId}
            recordedByUserId={userId}
            onSaved={() => setStep(4)}
          />
        ))}

      {currentStep === 'review' && (
        <RecordSection aria-labelledby="new-visit-review">
          <RecordSectionHeader>
            <RecordSectionTitle id="new-visit-review">Review &amp; Submit</RecordSectionTitle>
          </RecordSectionHeader>
          <RecordSectionContent>
            <p className="text-muted-foreground mb-4">
              Review the data in each section. You can go back to edit. When ready, submit for
              clinical review.
            </p>
            <FormActions split sticky>
              <Button variant="outline" onClick={() => setStep(3)}>
                Back to Diabetes
              </Button>
              <Button onClick={handleSubmitForReview} disabled={submitting}>
                {submitting ? 'Submitting…' : 'Submit for Clinical Review'}
              </Button>
            </FormActions>
          </RecordSectionContent>
        </RecordSection>
      )}

      {/* Its own row under the step's save row, at the start edge: the wizard's split layout. */}
      {!isLastStep && currentStep !== 'confirm' && currentStep !== 'review' && (
        <Button variant="outline" onClick={() => setStep((s) => Math.max(0, s - 1))}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
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
