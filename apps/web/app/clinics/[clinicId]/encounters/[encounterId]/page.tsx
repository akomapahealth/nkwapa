"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useBootstrap } from "@/lib/bootstrap-context";
import { useSync } from "@/app/ServiceWorkerAndSyncProvider";
import { apiFetch } from "@/lib/api";
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
import { ArrowLeft } from "lucide-react";

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
      <div className="flex items-center justify-between">
        <Button asChild variant="ghost" size="sm">
          <Link href={`/clinics/${clinicId}/patients/${encounter.patientId}`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Patient
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          <Badge
            variant={
              isFinalized ? "default" : encounter.status === "IN_REVIEW" ? "secondary" : "outline"
            }
          >
            {encounter.status}
          </Badge>
          {canTransitionToReview && (
            <Button
              size="sm"
              onClick={() => handleStatusTransition("IN_REVIEW")}
              disabled={transitioning}
            >
              Submit for Review
            </Button>
          )}
          {canTransitionToFinalized && (
            <Button
              size="sm"
              onClick={() => handleStatusTransition("FINALIZED")}
              disabled={transitioning}
            >
              Finalize
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <h1 className="text-xl font-semibold">Encounter</h1>
          <p className="text-sm text-muted-foreground">
            Created: {new Date(encounter.createdAt).toLocaleString()}
          </p>
        </CardHeader>
      </Card>

      {!isFinalized && (
        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
          <TabsList>
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
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground">
              This encounter is finalized. No further edits allowed.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
