'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { useBootstrap } from '@/lib/bootstrap-context';
import { useSync } from '@/app/ServiceWorkerAndSyncProvider';
import { apiFetch } from '@/lib/api';
import { getBootstrapActiveClinicId } from '@/lib/bootstrap-clinics';
import { AppMetricCard } from '@/components/app-shell/AppMetricCard';
import { AppPageHeader } from '@/components/app-shell/AppPageHeader';
import { EmptyStateCard, InlineNotice } from '@/components/ops/OpsShared';
import { RouteGuard } from '@/components/RouteGuard';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { VitalsForm } from '@/components/VitalsForm';
import { DiabetesScreeningForm } from '@/components/DiabetesScreeningForm';
import { HypertensionForm } from '@/components/HypertensionForm';
import { CarePlanForm } from '@/components/CarePlanForm';
import { db, type TobaccoScreeningRecord, type VitalsRecord } from '@/lib/db';
import { ArrowLeft, ClipboardPlus, HeartPulse, ShieldCheck } from 'lucide-react';
import { PrescriptionPanel } from '@/components/patients/PrescriptionPanel';
import { isWebFeatureEnabled } from '@/lib/feature-flags';

function hasPermission(permissions: string[], perm: string): boolean {
  return permissions.includes('*') || permissions.includes(perm);
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
  const encounterId = params.encounterId as string;
  const getToken = useAuth();
  const bootstrap = useBootstrap()?.bootstrap ?? null;
  const { syncNow } = useSync();
  const clinicId = getBootstrapActiveClinicId(bootstrap);
  const userId = bootstrap?.userId ?? '';
  const perms = bootstrap?.effectivePermissionsForActiveClinic ?? [];
  const canReadPrescriptions = hasPermission(perms, 'PRESCRIPTION.READ');
  const canWritePrescriptions = hasPermission(perms, 'PRESCRIPTION.WRITE');
  const medicalHistoryEnabled = isWebFeatureEnabled('medicalHistory');

  const [encounter, setEncounter] = useState<EncounterDetail | null>(null);
  const [vitals, setVitals] = useState<VitalsRecord | null>(null);
  const [tobacco, setTobacco] = useState<TobaccoScreeningRecord | null>(null);
  const [diabetes, setDiabetes] = useState<Record<string, unknown> | null>(null);
  const [hypertension, setHypertension] = useState<Record<string, unknown> | null>(null);
  const [carePlan, setCarePlan] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [transitioning, setTransitioning] = useState(false);
  const [activeTab, setActiveTab] = useState('vitals');
  const [savingBeforeSwitch, setSavingBeforeSwitch] = useState(false);

  const vitalsSaveRef = useRef<(() => Promise<void>) | null>(null);
  const screeningSaveRef = useRef<(() => Promise<void>) | null>(null);
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
      setDiabetes(enc.diabetesScreening ?? null);
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
        if (d) setDiabetes(d as unknown as Record<string, unknown>);
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
      screeningSaveRef.current,
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
        screening: screeningSaveRef.current,
        hypertension: hypertensionSaveRef.current,
        careplan: carePlanSaveRef.current,
      };
      const saveCurrent = saveFns[activeTab];
      if (saveCurrent) {
        setSavingBeforeSwitch(true);
        try {
          await saveCurrent();
        } catch {
          // Save failed; still allow tab switch
        } finally {
          setSavingBeforeSwitch(false);
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
              Back to Queues
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
              Back to Queues
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

  return (
    <RouteGuard requiredPermission="ENCOUNTER.READ">
      <div className="space-y-6">
        <AppPageHeader
          eyebrow="Encounter workspace"
          title={
            encounter.patient
              ? `${encounter.patient.firstName} ${encounter.patient.lastName}`
              : 'Encounter Workspace'
          }
          description="Capture vitals, screening assessments, hypertension evaluation, and care plan decisions from a shared charting flow."
          badges={
            <>
              {encounter.patient ? (
                <Badge variant="outline" className="border-primary/25 bg-background/80 font-mono">
                  {encounter.patient.patientCode}
                </Badge>
              ) : null}
              <Badge
                variant={
                  isFinalized ? 'finalized' : encounter.status === 'IN_REVIEW' ? 'review' : 'draft'
                }
              >
                {encounter.status}
              </Badge>
            </>
          }
          actions={
            <>
              <Button asChild variant="ghost" className="rounded-2xl">
                <Link href={`/clinics/${encounter.clinicId}/patients/${encounter.patientId}`}>
                  <ArrowLeft className="h-4 w-4" />
                  Back to Patient
                </Link>
              </Button>
              {canSubmit ? (
                <Button
                  size="sm"
                  onClick={() => doTransition('submit')}
                  disabled={transitioning}
                  className="rounded-2xl"
                >
                  Submit for Review
                </Button>
              ) : null}
              {canReview ? (
                <Button
                  size="sm"
                  onClick={() => doTransition('review')}
                  disabled={transitioning}
                  className="rounded-2xl"
                >
                  Mark Reviewed
                </Button>
              ) : null}
              {canFinalize ? (
                <Button
                  size="sm"
                  onClick={() => doTransition('finalize')}
                  disabled={transitioning}
                  className="rounded-2xl"
                >
                  Finalize
                </Button>
              ) : null}
            </>
          }
        />

        <div className="grid gap-4 md:grid-cols-3">
          <AppMetricCard
            title="Encounter state"
            value={encounter.status}
            icon={ClipboardPlus}
            detail="The current review stage for this encounter."
          />
          <AppMetricCard
            title="Forms"
            value={canFinalize ? '4' : '3'}
            icon={HeartPulse}
            detail="Vitals, screening, hypertension, and care plan appear based on workflow state."
          />
          <AppMetricCard
            title="Editability"
            value={isFinalized ? 'Locked' : 'Open'}
            icon={ShieldCheck}
            detail="Finalized encounters are preserved as read-only records."
          />
        </div>

        {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}

        {encounter.patient ? (
          <Card className="rounded-[28px] border-border/80 bg-card/90 shadow-lg shadow-black/5">
            <CardHeader>
              <h1 className="text-xl font-semibold font-heading">
                {encounter.patient.firstName} {encounter.patient.lastName}
              </h1>
              <p className="text-sm text-muted-foreground font-mono">
                {encounter.patient.patientCode}
              </p>
              <p className="text-sm text-muted-foreground">
                Created: {new Date(encounter.createdAt).toLocaleString()}
              </p>
            </CardHeader>
          </Card>
        ) : null}

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

        {!isFinalized && clinicId && (
          <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
            <TabsList className="h-auto flex-wrap justify-start gap-2 rounded-3xl border border-border/80 bg-card/75 p-2">
              <TabsTrigger value="vitals" disabled={savingBeforeSwitch}>
                Vitals
              </TabsTrigger>
              <TabsTrigger value="screening" disabled={savingBeforeSwitch}>
                Screening
              </TabsTrigger>
              <TabsTrigger value="hypertension" disabled={savingBeforeSwitch}>
                Hypertension
              </TabsTrigger>
              {canFinalize && (
                <TabsTrigger value="careplan" disabled={savingBeforeSwitch}>
                  Care Plan
                </TabsTrigger>
              )}
            </TabsList>
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
            <TabsContent value="screening">
              <DiabetesScreeningForm
                clinicId={clinicId}
                encounterId={encounterId}
                initialData={diabetes as Parameters<typeof DiabetesScreeningForm>[0]['initialData']}
                onSaved={fetchData}
                saveRef={screeningSaveRef}
              />
            </TabsContent>
            <TabsContent value="hypertension">
              <HypertensionForm
                clinicId={clinicId}
                encounterId={encounterId}
                initialData={hypertension as Parameters<typeof HypertensionForm>[0]['initialData']}
                onSaved={fetchData}
                saveRef={hypertensionSaveRef}
              />
            </TabsContent>
            {canFinalize && (
              <TabsContent value="careplan">
                <CarePlanForm
                  clinicId={clinicId}
                  encounterId={encounterId}
                  initialData={carePlan as Parameters<typeof CarePlanForm>[0]['initialData']}
                  onSaved={fetchData}
                  saveRef={carePlanSaveRef}
                />
              </TabsContent>
            )}
          </Tabs>
        )}

        {isFinalized && (
          <div className="space-y-4">
            <Card className="rounded-[28px] border-border/80 bg-card/90 shadow-lg shadow-black/5">
              <CardContent className="pt-6">
                <EmptyStateCard
                  title="Encounter finalized"
                  description="This encounter is complete and all measurements are read-only."
                />
              </CardContent>
            </Card>
            <VitalsForm
              clinicId={encounter.clinicId}
              encounterId={encounterId}
              recordedByUserId={userId}
              initialData={vitals}
              initialTobaccoData={tobacco}
              canEdit={false}
            />
            <Card className="rounded-[28px] border-border/80 bg-card/90 shadow-lg shadow-black/5">
              <CardContent className="pt-6">
                {carePlan && (
                  <div className="mt-4 space-y-2">
                    <p>
                      <span className="font-medium">Counseling given:</span>{' '}
                      {(carePlan as { counselingGiven?: boolean }).counselingGiven ? 'Yes' : 'No'}
                    </p>
                    <p>
                      <span className="font-medium">Medication prescribed:</span>{' '}
                      {(carePlan as { medicationPrescribed?: boolean }).medicationPrescribed
                        ? 'Yes'
                        : 'No'}
                    </p>
                    {(carePlan as { followUpDate?: string }).followUpDate && (
                      <p>
                        <span className="font-medium">Follow-up:</span>{' '}
                        {new Date(
                          (carePlan as { followUpDate: string }).followUpDate,
                        ).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </RouteGuard>
  );
}
