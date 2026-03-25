"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useBootstrap } from "@/lib/bootstrap-context";
import { useSync } from "@/app/ServiceWorkerAndSyncProvider";
import { apiFetch } from "@/lib/api";
import { AppMetricCard } from "@/components/app-shell/AppMetricCard";
import { AppPageHeader } from "@/components/app-shell/AppPageHeader";
import { EmptyStateCard, InlineNotice } from "@/components/ops/OpsShared";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { VitalsForm } from "@/components/VitalsForm";
import { DiabetesScreeningForm } from "@/components/DiabetesScreeningForm";
import { HypertensionForm } from "@/components/HypertensionForm";
import { db } from "@/lib/db";
import { enqueueOutboxMutation } from "@/lib/outbox";
import { SYNC_OPERATION } from "@/lib/outbox";
import { ArrowLeft, ClipboardPlus, HeartPulse, ShieldCheck } from "lucide-react";

interface EncounterDetail {
  id: string;
  status: string;
  clinicId: string;
  patientId: string;
  createdAt: string;
}

export default function EncounterDetailPage() {
  const params = useParams();
  const clinicId = params.clinicId as string;
  const encounterId = params.encounterId as string;
  const getToken = useAuth();
  const bootstrap = useBootstrap()?.bootstrap ?? null;
  const { syncNow } = useSync();
  const userId = bootstrap?.userId ?? "";

  const [encounter, setEncounter] = useState<EncounterDetail | null>(null);
  const [activeTab, setActiveTab] = useState("vitals");
  const [savingBeforeSwitch, setSavingBeforeSwitch] = useState(false);

  const vitalsSaveRef = useRef<(() => Promise<void>) | null>(null);
  const screeningSaveRef = useRef<(() => Promise<void>) | null>(null);
  const hypertensionSaveRef = useRef<(() => Promise<void>) | null>(null);
  const [vitals, setVitals] = useState<{
    systolicBp?: number | null;
    diastolicBp?: number | null;
    heartRate?: number | null;
    weightKg?: number | null;
    heightCm?: number | null;
    bmi?: number | null;
    notes?: string | null;
  } | null>(null);
  const [diabetesScreening, setDiabetesScreening] = useState<{
    glucoseMgDl?: number | null;
    glucoseType?: string | null;
    hba1cPercent?: number | null;
    symptomsJson?: string | null;
    notes?: string | null;
  } | null>(null);
  const [hypertension, setHypertension] = useState<{
    classification?: string | null;
    suspected?: boolean | null;
    confirmed?: boolean | null;
    notes?: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [transitioning, setTransitioning] = useState(false);

  const fetchData = useCallback(async () => {
    let enc: EncounterDetail | null = null;
    try {
      const res = await apiFetch(
        `/clinics/${encodeURIComponent(clinicId)}/encounters/${encodeURIComponent(encounterId)}`,
        { getToken }
      );
      if (!res.ok) throw new Error(await res.text());
      enc = (await res.json()) as EncounterDetail;
      setEncounter(enc);
    } catch {
      try {
        const dbEnc = await db.encounters.get(encounterId);
        if (dbEnc) {
          enc = {
            id: dbEnc.id,
            status: dbEnc.status ?? "DRAFT",
            clinicId: dbEnc.clinicId,
            patientId: dbEnc.patientId,
            createdAt: dbEnc.createdAt ?? new Date().toISOString(),
          };
          setEncounter(enc);
        } else {
          setError("Encounter not found");
          setLoading(false);
          return;
        }
      } catch {
        setError("Failed to load encounter");
        setLoading(false);
        return;
      }
    }

    try {
      const [v, d, h] = await Promise.all([
        db.vitals.where("encounterId").equals(encounterId).first(),
        db.diabetes_screenings.where("encounterId").equals(encounterId).first(),
        db.hypertension_assessments.where("encounterId").equals(encounterId).first(),
      ]);
      if (v) setVitals(v);
      if (d) setDiabetesScreening(d);
      if (h) setHypertension(h);
    } catch {
      // ignore - vitals may not exist yet
    } finally {
      setLoading(false);
    }
  }, [clinicId, encounterId, getToken]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const saveAllForms = useCallback(async () => {
    const refs = [
      vitalsSaveRef.current,
      screeningSaveRef.current,
      hypertensionSaveRef.current,
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
    [activeTab]
  );

  const handleStatusTransition = async (newStatus: "IN_REVIEW" | "FINALIZED") => {
    if (!encounter) return;
    setTransitioning(true);
    try {
      if (newStatus === "IN_REVIEW") {
        await saveAllForms();
        await syncNow(clinicId);
      }
      const res = await apiFetch(
        `/clinics/${encodeURIComponent(clinicId)}/encounters/${encodeURIComponent(encounterId)}/status`,
        {
          method: "PATCH",
          body: JSON.stringify({ status: newStatus }),
          getToken,
          activeClinicId: clinicId,
        }
      );
      if (res.ok) {
        const updated = (await res.json()) as EncounterDetail;
        setEncounter(updated);
        await db.encounters.put({
          ...encounter,
          status: newStatus,
          updatedAt: new Date().toISOString(),
        });
      } else {
        const text = await res.text();
        if (text.includes("network") || !navigator.onLine) {
          await db.encounters.put({
            ...encounter,
            status: newStatus,
            updatedAt: new Date().toISOString(),
          });
          await enqueueOutboxMutation(db, {
            clinicId,
            entityType: "encounter",
            entityId: encounterId,
            operation: SYNC_OPERATION.UPSERT,
            payloadJson: {
              clinicId,
              patientId: encounter.patientId,
              status: newStatus,
              createdByUserId: userId,
            },
          });
          setEncounter((e) => (e ? { ...e, status: newStatus } : null));
        } else {
          setError(text);
        }
      }
    } catch {
      await db.encounters.put({
        ...encounter,
        status: newStatus,
        updatedAt: new Date().toISOString(),
      });
      await enqueueOutboxMutation(db, {
        clinicId,
        entityType: "encounter",
        entityId: encounterId,
        operation: SYNC_OPERATION.UPSERT,
        payloadJson: {
          clinicId,
          patientId: encounter.patientId,
          status: newStatus,
          createdByUserId: userId,
        },
      });
      setEncounter((e) => (e ? { ...e, status: newStatus } : null));
    } finally {
      setTransitioning(false);
    }
  };

  if (loading && !encounter)
    return (
      <div className="flex items-center justify-center p-8">Loading…</div>
    );
  if (error && !encounter)
    return (
      <div className="space-y-4">
        <p className="text-destructive">{error}</p>
        <Button asChild variant="outline">
          <Link href={`/clinics/${clinicId}/patients`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to patients
          </Link>
        </Button>
      </div>
    );
  if (!encounter)
    return (
      <div className="space-y-4">
        <p>Encounter not found.</p>
        <Button asChild variant="outline">
          <Link href={`/clinics/${clinicId}/patients`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to patients
          </Link>
        </Button>
      </div>
    );

  const canTransitionToReview = encounter.status === "DRAFT";
  const canTransitionToFinalized = encounter.status === "IN_REVIEW";
  const isFinalized = encounter.status === "FINALIZED";

  return (
    <div className="space-y-6">
      <AppPageHeader
        eyebrow="Clinic encounter"
        title="Encounter Workspace"
        description="Capture vitals, screening data, and hypertension findings in a cleaner encounter flow with clearer state transitions."
        badges={
          <Badge
            variant={
              isFinalized ? "default" : encounter.status === "IN_REVIEW" ? "secondary" : "outline"
            }
          >
            {encounter.status}
          </Badge>
        }
        actions={
          <>
            <Button asChild variant="ghost" className="rounded-2xl">
              <Link href={`/clinics/${clinicId}/patients/${encounter.patientId}`}>
                <ArrowLeft className="h-4 w-4" />
                Back to Patient
              </Link>
            </Button>
            {canTransitionToReview ? (
              <Button
                size="sm"
                onClick={() => handleStatusTransition("IN_REVIEW")}
                disabled={transitioning}
                className="rounded-2xl"
              >
                Submit for Review
              </Button>
            ) : null}
            {canTransitionToFinalized ? (
              <Button
                size="sm"
                onClick={() => handleStatusTransition("FINALIZED")}
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
          detail="The current charting stage for this clinic encounter."
        />
        <AppMetricCard
          title="Forms"
          value="3"
          icon={HeartPulse}
          detail="Vitals, diabetes screening, and hypertension assessment are available here."
        />
        <AppMetricCard
          title="Editability"
          value={isFinalized ? "Locked" : "Open"}
          icon={ShieldCheck}
          detail="Finalized encounters are read-only and preserved for review."
        />
      </div>

      {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}

      <Card className="rounded-[28px] border-border/80 bg-card/90 shadow-lg shadow-black/5">
        <CardHeader>
          <h1 className="text-xl font-semibold">Encounter</h1>
          <p className="text-sm text-muted-foreground">
            Created: {new Date(encounter.createdAt).toLocaleString()}
          </p>
        </CardHeader>
      </Card>

      {!isFinalized && (
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
          </TabsList>
          <TabsContent value="vitals">
            <VitalsForm
              clinicId={clinicId}
              encounterId={encounterId}
              recordedByUserId={userId}
              initialData={vitals ?? undefined}
              onSaved={fetchData}
              saveRef={vitalsSaveRef}
            />
          </TabsContent>
          <TabsContent value="screening">
            <DiabetesScreeningForm
              clinicId={clinicId}
              encounterId={encounterId}
              initialData={diabetesScreening ?? undefined}
              onSaved={fetchData}
              saveRef={screeningSaveRef}
            />
          </TabsContent>
          <TabsContent value="hypertension">
            <HypertensionForm
              clinicId={clinicId}
              encounterId={encounterId}
              initialData={hypertension ?? undefined}
              onSaved={fetchData}
              saveRef={hypertensionSaveRef}
            />
          </TabsContent>
        </Tabs>
      )}

      {isFinalized && (
        <Card className="rounded-[28px] border-border/80 bg-card/90 shadow-lg shadow-black/5">
          <CardContent className="pt-6">
            <EmptyStateCard
              title="Encounter finalized"
              description="This encounter is complete and no further edits are allowed on the clinic chart."
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
