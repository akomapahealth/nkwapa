'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { useBootstrap } from '@/lib/bootstrap-context';
import { useSync } from '@/app/ServiceWorkerAndSyncProvider';
import { apiFetch } from '@/lib/api';
import { getBootstrapActiveClinicId } from '@/lib/bootstrap-clinics';
import { InlineNotice } from '@/components/ops/OpsShared';
import { InlineErrorState } from '@/components/feedback/AppState';
import { RouteGuard } from '@/components/RouteGuard';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  RecordSection,
  RecordSectionContent,
  RecordSectionHeader,
  RecordSectionTitle,
} from '@/components/patients/RecordSection';
import { VitalsForm } from '@/components/VitalsForm';
import { DiabetesScreeningForm } from '@/components/DiabetesScreeningForm';
import { HypertensionForm } from '@/components/HypertensionForm';
import { HypertensionInterviewForm } from '@/components/encounters/hypertension/HypertensionInterviewForm';
import { DiabetesInterviewForm } from '@/components/encounters/diabetes/DiabetesInterviewForm';
import { CarePlanForm } from '@/components/CarePlanForm';
import {
  db,
  type DiabetesScreeningRecord,
  type TobaccoScreeningRecord,
  type VitalsRecord,
} from '@/lib/db';
import { ArrowLeft, Check, ClipboardCheck, ShieldCheck } from 'lucide-react';
import { PrescriptionPanel } from '@/components/patients/PrescriptionPanel';
import { isWebFeatureEnabled } from '@/lib/feature-flags';
import { DiabetesHistoryPanel } from '@/components/patients/DiabetesHistoryPanel';
import { HypertensionHistoryPanel } from '@/components/patients/HypertensionHistoryPanel';
import { ClinicalNotePanel } from '@/components/clinical-notes/ClinicalNotePanel';
import { StationSessionPanel } from '@/components/stations/StationSessionPanel';
import styles from '@/components/encounters/encounter-workspace.module.css';
import { confirmAction } from '@/components/ui/confirm-dialog';
import { formatOpsDateTime } from '@/lib/ops';

function hasPermission(permissions: string[], perm: string): boolean {
  return permissions.includes('*') || permissions.includes(perm);
}

// The review path as people say it; DRAFT and IN_REVIEW never reach the screen.
const STAGES = ['Draft', 'Pending review', 'Awaiting sign-off', 'Finalized'] as const;

function encounterStage(status: string, reviewed: boolean): number {
  if (status === 'FINALIZED') return 3;
  if (status === 'IN_REVIEW') return reviewed ? 2 : 1;
  return 0;
}

interface EncounterDetail {
  id: string;
  status: string;
  clinicId: string;
  patientId: string;
  preceptorReviewedById?: string | null;
  doctorFinalizedById?: string | null;
  createdAt: string;
  patient?: { firstName: string; lastName: string; patientCode: string };
  vitals?: Record<string, unknown>;
  tobaccoScreening?: Record<string, unknown>;
  diabetesScreening?: Record<string, unknown>;
  hypertensionAssessment?: Record<string, unknown>;
  carePlan?: Record<string, unknown>;
}

export default function EncounterDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const encounterId = params.encounterId as string;
  const getToken = useAuth();
  const bootstrap = useBootstrap()?.bootstrap ?? null;
  const { syncNow } = useSync();
  const clinicId = (params.clinicId as string | undefined) ?? getBootstrapActiveClinicId(bootstrap);
  const userId = bootstrap?.userId ?? '';
  const perms = bootstrap?.effectivePermissionsForActiveClinic ?? [];
  const canReadPrescriptions = hasPermission(perms, 'PRESCRIPTION.READ');
  const canWritePrescriptions = hasPermission(perms, 'PRESCRIPTION.WRITE');
  const medicalHistoryEnabled = isWebFeatureEnabled('medicalHistory');
  const clinicalNotesEnabled = isWebFeatureEnabled('clinicalNotes');
  const guidedChronicTabsEnabled = isWebFeatureEnabled('guidedChronicTabs');
  const stationWorkflowEnabled = isWebFeatureEnabled('stationWorkflow');
  /*
    Resolved from the clinic-scoped permission rather than from the DOCTOR role.

    The role and the permission happen to coincide today, but the permission is what the API
    checks, and a boundary expressed two different ways is one grant away from disagreeing.
  */
  const canRecordClinicianPlan = hasPermission(perms, 'CAREPLAN.CLINICIAN_PLAN');
  const clinicRoles =
    bootstrap?.memberships.find((membership) => membership.clinicId === clinicId)?.roles ?? [];
  const isClinicalUser = clinicRoles.includes('DOCTOR') || clinicRoles.includes('VOLUNTEER');
  const isDoctor = clinicRoles.includes('DOCTOR');

  const [encounter, setEncounter] = useState<EncounterDetail | null>(null);
  const [vitals, setVitals] = useState<VitalsRecord | null>(null);
  const [tobacco, setTobacco] = useState<TobaccoScreeningRecord | null>(null);
  const [diabetes, setDiabetes] = useState<DiabetesScreeningRecord | null>(null);
  const [hypertension, setHypertension] = useState<Record<string, unknown> | null>(null);
  const [carePlan, setCarePlan] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [transitioning, setTransitioning] = useState(false);
  const [activeTab, setActiveTab] = useState(
    searchParams.get('tab') === 'clinical-note' ? 'clinical-note' : 'vitals',
  );
  const [savingBeforeSwitch, setSavingBeforeSwitch] = useState(false);

  const vitalsSaveRef = useRef<(() => Promise<void>) | null>(null);
  const diabetesSaveRef = useRef<(() => Promise<void>) | null>(null);
  const hypertensionSaveRef = useRef<(() => Promise<void>) | null>(null);
  const carePlanSaveRef = useRef<(() => Promise<void>) | null>(null);

  const fetchData = useCallback(async () => {
    if (!getToken) return;
    try {
      const res = await apiFetch(`/encounters/${encodeURIComponent(encounterId)}`, {
        getToken,
      });
      if (!res.ok) throw new Error(await res.text());
      const enc = (await res.json()) as EncounterDetail;
      setEncounter(enc);
      setVitals((enc.vitals as VitalsRecord | undefined) ?? null);
      setTobacco((enc.tobaccoScreening as TobaccoScreeningRecord | undefined) ?? null);
      setDiabetes((enc.diabetesScreening as DiabetesScreeningRecord | undefined) ?? null);
      setHypertension(enc.hypertensionAssessment ?? null);
      setCarePlan(enc.carePlan ?? null);
    } catch {
      try {
        const dbEnc = await db.encounters.get(encounterId);
        if (dbEnc) {
          setEncounter({
            id: dbEnc.id,
            status: dbEnc.status ?? 'DRAFT',
            clinicId: dbEnc.clinicId,
            patientId: dbEnc.patientId,
            createdAt: dbEnc.createdAt ?? new Date().toISOString(),
          });
        }
        const [v, tobaccoRecord, d, h, c] = await Promise.all([
          db.vitals.where('encounterId').equals(encounterId).first(),
          db.tobacco_screenings.where('encounterId').equals(encounterId).first(),
          db.diabetes_screenings.where('encounterId').equals(encounterId).first(),
          db.hypertension_assessments.where('encounterId').equals(encounterId).first(),
          db.care_plans.where('encounterId').equals(encounterId).first(),
        ]);
        if (v) setVitals(v);
        if (tobaccoRecord) setTobacco(tobaccoRecord);
        if (d) setDiabetes(d);
        if (h) setHypertension(h as unknown as Record<string, unknown>);
        if (c) setCarePlan(c as unknown as Record<string, unknown>);
      } catch {
        setError('Failed to load encounter');
      }
    } finally {
      setLoading(false);
    }
  }, [encounterId, getToken]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const saveAllForms = useCallback(async () => {
    const refs = [
      vitalsSaveRef.current,
      diabetesSaveRef.current,
      hypertensionSaveRef.current,
      carePlanSaveRef.current,
    ];
    for (const saveFn of refs) {
      if (saveFn) await saveFn();
    }
  }, []);

  const handleTabChange = useCallback(
    async (newValue: string) => {
      if (newValue === activeTab) return;
      const saveFns: Record<string, (() => Promise<void>) | null> = {
        vitals: vitalsSaveRef.current,
        diabetes: diabetesSaveRef.current,
        hypertension: hypertensionSaveRef.current,
        careplan: carePlanSaveRef.current,
      };
      const saveCurrent = saveFns[activeTab];
      if (saveCurrent) {
        setSavingBeforeSwitch(true);
        let failure: string | null = null;
        try {
          await saveCurrent();
        } catch (e) {
          failure = e instanceof Error ? e.message : 'This tab could not be saved.';
        } finally {
          setSavingBeforeSwitch(false);
        }
        /*
          The tab's panel unmounts on switch, so leaving after a failed save throws the draft
          away. Leaving stays possible, but only as a stated choice.
        */
        if (failure) {
          const leave = await confirmAction({
            title: 'These answers are not saved yet',
            description: `${failure} If you leave this tab now, the unsaved answers are lost.`,
            confirmLabel: 'Leave without saving',
            cancelLabel: 'Stay and fix',
            destructive: true,
          });
          if (!leave) {
            // The dialog hands focus back to the tab when it unmounts; wait for that, then take
            // the volunteer to the first answer that needs fixing.
            const focusInvalid = (frames: number) => {
              if (document.querySelector('[role="dialog"],[role="alertdialog"]') && frames > 0) {
                requestAnimationFrame(() => focusInvalid(frames - 1));
                return;
              }
              document
                .querySelector<HTMLElement>(
                  '[role="tabpanel"][data-state="active"] [aria-invalid="true"]:not([hidden] *)',
                )
                ?.focus();
            };
            requestAnimationFrame(() => focusInvalid(60));
            return;
          }
        }
      }
      setActiveTab(newValue);
    },
    [activeTab],
  );

  const doTransition = async (endpoint: 'submit' | 'review' | 'finalize') => {
    if (!encounter || !getToken || !clinicId) return;
    setTransitioning(true);
    setError(null);
    try {
      if (endpoint === 'submit') {
        await saveAllForms();
        await syncNow(clinicId);
      }
      const res = await apiFetch(`/encounters/${encodeURIComponent(encounterId)}/${endpoint}`, {
        method: 'POST',
        getToken,
      });
      if (!res.ok) throw new Error(await res.text());
      const updated = (await res.json()) as EncounterDetail;
      setEncounter(updated);
      await fetchData();
      if (endpoint === 'review') {
        // The review band's button is gone; hand focus to what replaced it, the sign-off band.
        requestAnimationFrame(() => document.getElementById('encounter-signoff')?.focus());
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setTransitioning(false);
    }
  };

  if (loading && !encounter)
    return (
      <RouteGuard requiredPermission="ENCOUNTER.READ">
        <div className="flex items-center justify-center p-8">Loading…</div>
      </RouteGuard>
    );
  if (error && !encounter)
    return (
      <RouteGuard requiredPermission="ENCOUNTER.READ">
        <div className="space-y-4">
          <p className="text-destructive">{error}</p>
          <Button asChild variant="outline">
            <Link href="/queues">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to queues
            </Link>
          </Button>
        </div>
      </RouteGuard>
    );
  if (!encounter)
    return (
      <RouteGuard requiredPermission="ENCOUNTER.READ">
        <div className="space-y-4">
          <p>Encounter not found.</p>
          <Button asChild variant="outline">
            <Link href="/queues">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to queues
            </Link>
          </Button>
        </div>
      </RouteGuard>
    );

  const isFinalized = encounter.status === 'FINALIZED';
  const canEditMeasurements = !isFinalized && hasPermission(perms, 'SCREENING.WRITE');
  const canSubmit =
    encounter.status === 'DRAFT' && hasPermission(perms, 'ENCOUNTER.SUBMIT_FOR_REVIEW');
  const canReview =
    encounter.status === 'IN_REVIEW' &&
    !encounter.preceptorReviewedById &&
    hasPermission(perms, 'ENCOUNTER.REVIEW');
  const canFinalize =
    encounter.status === 'IN_REVIEW' &&
    encounter.preceptorReviewedById &&
    hasPermission(perms, 'DOCTOR.FINALIZE');
  const stage = encounterStage(encounter.status, Boolean(encounter.preceptorReviewedById));

  return (
    <RouteGuard requiredPermission="ENCOUNTER.READ">
      <div className="min-w-0 space-y-6 [overflow-wrap:anywhere]">
        <header className={styles.header}>
          <Link
            className={styles.back}
            href={`/clinics/${encounter.clinicId}/patients/${encounter.patientId}`}
          >
            <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
            Back to patient
          </Link>
          <div className={styles.identityRow}>
            <div className={styles.identity}>
              <p className="text-sm text-muted-foreground">Encounter</p>
              <h1 className="mt-1 type-page-title">
                {encounter.patient
                  ? `${encounter.patient.firstName} ${encounter.patient.lastName}`
                  : 'Encounter workspace'}
              </h1>
              <div className={styles.metadata}>
                {encounter.patient ? (
                  <span className="font-mono tabular-nums" translate="no">
                    {encounter.patient.patientCode}
                  </span>
                ) : null}
                <Badge
                  variant={
                    isFinalized
                      ? 'finalized'
                      : encounter.status === 'IN_REVIEW'
                        ? 'review'
                        : 'draft'
                  }
                >
                  {STAGES[stage]}
                </Badge>
                <span className="tabular-nums">
                  Started{' '}
                  <time dateTime={encounter.createdAt}>
                    {formatOpsDateTime(encounter.createdAt)}
                  </time>
                </span>
              </div>
            </div>
            {canSubmit ? (
              <div role="group" aria-label="Encounter actions" className={styles.actions}>
                <Button onClick={() => doTransition('submit')} disabled={transitioning}>
                  Submit for review
                </Button>
              </div>
            ) : null}
          </div>
        </header>

        <EncounterProgress stage={stage} />

        {error ? (
          <InlineErrorState
            title="This encounter could not be loaded"
            description={error}
            onRetry={() => void fetchData()}
          />
        ) : null}

        {/* The preceptor's decision leads, in the place sign-off takes once it is made. Routine, so
            teal and one press: unlike Finalize it locks nothing. */}
        {canReview ? (
          <section aria-labelledby="encounter-review" className={styles.review}>
            <div className={styles.signoffText}>
              <ClipboardCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
              <div>
                <h2 id="encounter-review" className="font-sans text-base font-semibold">
                  Ready for your review
                </h2>
                <p className="text-sm text-muted-foreground">
                  Read each tab, then mark it reviewed. The visit moves on to sign-off.
                </p>
              </div>
            </div>
            <Button onClick={() => doTransition('review')} disabled={transitioning}>
              Mark reviewed
            </Button>
          </section>
        ) : null}

        {canFinalize ? (
          <section aria-labelledby="encounter-signoff" className={styles.signoff}>
            <div className={styles.signoffText}>
              <ShieldCheck
                className="mt-0.5 h-5 w-5 shrink-0 text-warning-ink"
                aria-hidden="true"
              />
              <div>
                <h2
                  id="encounter-signoff"
                  tabIndex={-1}
                  className="font-sans text-base font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Ready for your sign-off
                </h2>
                <p className="text-sm text-muted-foreground">
                  Finalizing locks every clinical tab. Check the care plan first.
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              className="border-warning text-warning-ink"
              onClick={async () => {
                // Finalizing locks the record for good, so it takes one deliberate confirmation.
                if (
                  await confirmAction({
                    title: 'Finalize this visit?',
                    description:
                      'Every clinical tab becomes read-only and the visit leaves your sign-off queue. This cannot be undone here.',
                    confirmLabel: 'Finalize visit',
                    cancelLabel: 'Not yet',
                    destructive: false,
                  })
                )
                  void doTransition('finalize');
              }}
              disabled={transitioning}
            >
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              Finalize
            </Button>
          </section>
        ) : null}

        {clinicId && (
          <Tabs
            value={activeTab}
            onValueChange={isFinalized ? setActiveTab : handleTabChange}
            className="w-full"
          >
            <TabsList aria-label="Encounter clinical sections">
              {stationWorkflowEnabled && isClinicalUser ? (
                <TabsTrigger value="station-session" disabled={savingBeforeSwitch}>
                  Station session
                </TabsTrigger>
              ) : null}
              <TabsTrigger value="vitals" disabled={savingBeforeSwitch}>
                Vitals
              </TabsTrigger>
              <TabsTrigger value="hypertension" disabled={savingBeforeSwitch}>
                Hypertension
              </TabsTrigger>
              <TabsTrigger value="diabetes" disabled={savingBeforeSwitch}>
                Diabetes
              </TabsTrigger>
              {canFinalize && (
                <TabsTrigger value="careplan" disabled={savingBeforeSwitch}>
                  Care plan
                </TabsTrigger>
              )}
              {clinicalNotesEnabled && isClinicalUser ? (
                <TabsTrigger value="clinical-note" disabled={savingBeforeSwitch}>
                  Clinical note
                </TabsTrigger>
              ) : null}
            </TabsList>
            {stationWorkflowEnabled && isClinicalUser ? (
              <TabsContent value="station-session">
                <StationSessionPanel
                  clinicId={clinicId}
                  encounterId={encounterId}
                  vitals={vitals}
                  diabetes={diabetes}
                  canEditCounselling={!isFinalized}
                  canSetCarePlan={!isFinalized && hasPermission(perms, 'CAREPLAN.WRITE')}
                />
              </TabsContent>
            ) : null}
            <TabsContent value="vitals">
              <VitalsForm
                clinicId={clinicId}
                encounterId={encounterId}
                recordedByUserId={userId}
                initialData={vitals as Parameters<typeof VitalsForm>[0]['initialData']}
                initialTobaccoData={tobacco}
                canEdit={canEditMeasurements}
                onSaved={fetchData}
                saveRef={vitalsSaveRef}
              />
            </TabsContent>
            <TabsContent value="diabetes" className="space-y-4">
              {guidedChronicTabsEnabled ? (
                <DiabetesInterviewForm
                  clinicId={clinicId}
                  encounterId={encounterId}
                  patientId={encounter.patientId}
                  canRecordClinicianPlan={canRecordClinicianPlan}
                  initialData={diabetes as Record<string, unknown> | null}
                  canEdit={canEditMeasurements}
                  onSaved={fetchData}
                  saveRef={diabetesSaveRef}
                />
              ) : (
                <DiabetesScreeningForm
                  clinicId={clinicId}
                  encounterId={encounterId}
                  recordedByUserId={userId}
                  initialData={diabetes}
                  canEdit={canEditMeasurements}
                  onSaved={fetchData}
                  saveRef={diabetesSaveRef}
                />
              )}
              <DiabetesHistoryPanel
                clinicId={clinicId}
                patientId={encounter.patientId}
                currentEncounterId={encounterId}
                refreshKey={diabetes?.updatedAt ?? null}
              />
            </TabsContent>
            <TabsContent value="hypertension" className="space-y-4">
              {/*
                The guided interview replaces the four-field form behind a flag, as clinical notes
                did. Both write the same record, so a clinic can be switched back mid-rollout
                without anything being lost.
              */}
              {guidedChronicTabsEnabled ? (
                <HypertensionInterviewForm
                  clinicId={clinicId}
                  encounterId={encounterId}
                  patientId={encounter.patientId}
                  canRecordClinicianPlan={canRecordClinicianPlan}
                  initialData={hypertension as Record<string, unknown> | null}
                  vitals={
                    vitals
                      ? {
                          systolicBp: vitals.systolicBp ?? null,
                          diastolicBp: vitals.diastolicBp ?? null,
                          pulseBpm: vitals.pulseBpm ?? null,
                          weightKg: vitals.weightKg ?? null,
                          heightCm: vitals.heightCm ?? null,
                          bmi: vitals.bmi ?? null,
                          updatedAt: vitals.updatedAt,
                        }
                      : null
                  }
                  canEdit={canEditMeasurements}
                  onSaved={fetchData}
                  saveRef={hypertensionSaveRef}
                />
              ) : (
                <HypertensionForm
                  clinicId={clinicId}
                  encounterId={encounterId}
                  initialData={
                    hypertension as Parameters<typeof HypertensionForm>[0]['initialData']
                  }
                  canEdit={canEditMeasurements}
                  onSaved={fetchData}
                  saveRef={hypertensionSaveRef}
                />
              )}
              {/* The same longitudinal view the diabetes tab has always had beside its form. */}
              <HypertensionHistoryPanel
                clinicId={clinicId}
                patientId={encounter.patientId}
                currentEncounterId={encounterId}
                refreshKey={
                  typeof hypertension?.updatedAt === 'string' ? hypertension.updatedAt : null
                }
              />
            </TabsContent>
            {canFinalize && (
              <TabsContent value="careplan">
                <CarePlanForm
                  clinicId={clinicId}
                  encounterId={encounterId}
                  initialData={carePlan as Parameters<typeof CarePlanForm>[0]['initialData']}
                  canEdit={!isFinalized}
                  onSaved={fetchData}
                  saveRef={carePlanSaveRef}
                />
              </TabsContent>
            )}
            {clinicalNotesEnabled && isClinicalUser ? (
              <TabsContent value="clinical-note">
                <ClinicalNotePanel
                  clinicId={clinicId}
                  encounterId={encounterId}
                  userId={userId}
                  isDoctor={isDoctor}
                />
              </TabsContent>
            ) : null}
          </Tabs>
        )}

        {/* After the clinical tabs: prescribing follows the assessment it rests on. */}
        {canReadPrescriptions && clinicId ? (
          <PrescriptionPanel
            clinicId={clinicId}
            patientId={encounter.patientId}
            encounterId={encounterId}
            userId={userId}
            canWrite={canWritePrescriptions}
            isFinalized={isFinalized}
            showAllergySafety={medicalHistoryEnabled}
          />
        ) : null}

        {isFinalized && (
          <div className="space-y-4">
            <InlineNotice tone="info">
              This encounter is finalized. Every clinical tab remains available in read-only mode.
            </InlineNotice>
            {carePlan ? (
              <RecordSection aria-labelledby="finalized-care-plan">
                <RecordSectionHeader>
                  <RecordSectionTitle id="finalized-care-plan">
                    Care plan as finalized
                  </RecordSectionTitle>
                </RecordSectionHeader>
                <RecordSectionContent>
                  <dl className="divide-y divide-rule border-y border-rule text-sm">
                    <div className="grid grid-cols-[minmax(0,12rem)_1fr] gap-4 py-2">
                      <dt className="text-muted-foreground">Counseling given</dt>
                      <dd className="font-medium">
                        {(carePlan as { counselingGiven?: boolean }).counselingGiven ? 'Yes' : 'No'}
                      </dd>
                    </div>
                    <div className="grid grid-cols-[minmax(0,12rem)_1fr] gap-4 py-2">
                      <dt className="text-muted-foreground">Medication prescribed</dt>
                      <dd className="font-medium">
                        {(carePlan as { medicationPrescribed?: boolean }).medicationPrescribed
                          ? 'Yes'
                          : 'No'}
                      </dd>
                    </div>
                    {(carePlan as { followUpDate?: string }).followUpDate && (
                      <div className="grid grid-cols-[minmax(0,12rem)_1fr] gap-4 py-2">
                        <dt className="text-muted-foreground">Follow-up</dt>
                        <dd className="font-medium tabular-nums">
                          {new Date(
                            (carePlan as { followUpDate: string }).followUpDate,
                          ).toLocaleDateString()}
                        </dd>
                      </div>
                    )}
                  </dl>
                </RecordSectionContent>
              </RecordSection>
            ) : null}
          </div>
        )}
      </div>
    </RouteGuard>
  );
}

/** Where this visit is on the review path, in words; the current step is not colour alone. */
function EncounterProgress({ stage }: { stage: number }) {
  return (
    <section aria-label="Review progress">
      <ol className={styles.progress}>
        {STAGES.map((label, index) => {
          const state = index < stage ? 'done' : index === stage ? 'current' : 'next';
          return (
            <li
              key={label}
              data-state={state}
              aria-current={index === stage ? 'step' : undefined}
              className={styles.step}
            >
              <span className="inline-flex items-center gap-1.5">
                {index < stage ? <Check className="h-4 w-4" aria-hidden="true" /> : null}
                {label}
              </span>
              <span className={styles.stepState}>
                {state === 'done' ? 'Done' : state === 'current' ? 'Current' : 'Not yet'}
              </span>
            </li>
          );
        })}
      </ol>
      <p className={styles.progressSummary} aria-hidden="true">
        <span className="font-semibold">{STAGES[stage]}</span>
        <span className="text-muted-foreground">
          {' '}
          · step {stage + 1} of {STAGES.length}
        </span>
      </p>
    </section>
  );
}
