"use client";

import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { db } from "@/lib/db";
import { enqueueOutboxMutation } from "@/lib/outbox";
import { SYNC_OPERATION } from "@/lib/outbox";

function generateId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function computeBmi(weightKg?: number, heightCm?: number): number | null {
  if (
    weightKg != null &&
    weightKg > 0 &&
    heightCm != null &&
    heightCm > 0
  ) {
    const heightM = heightCm / 100;
    return Math.round((weightKg / (heightM * heightM)) * 10) / 10;
  }
  return null;
}

interface VitalsFormProps {
  clinicId: string;
  encounterId: string;
  recordedByUserId: string;
  initialData?: {
    systolicBp?: number | null;
    diastolicBp?: number | null;
    heartRate?: number | null;
    weightKg?: number | null;
    heightCm?: number | null;
    bmi?: number | null;
    notes?: string | null;
  };
  onSaved?: () => void;
  /** Optional ref to expose save for parent-driven save (e.g. on tab change) */
  saveRef?: React.MutableRefObject<(() => Promise<void>) | null>;
}

export function VitalsForm({
  clinicId,
  encounterId,
  recordedByUserId,
  initialData,
  onSaved,
  saveRef,
}: VitalsFormProps) {
  const [systolicBp, setSystolicBp] = useState<string>(
    String(initialData?.systolicBp ?? "")
  );
  const [diastolicBp, setDiastolicBp] = useState<string>(
    String(initialData?.diastolicBp ?? "")
  );
  const [heartRate, setHeartRate] = useState<string>(
    String(initialData?.heartRate ?? "")
  );
  const [weightKg, setWeightKg] = useState<string>(
    String(initialData?.weightKg ?? "")
  );
  const [heightCm, setHeightCm] = useState<string>(
    String(initialData?.heightCm ?? "")
  );
  const [notes, setNotes] = useState<string>(initialData?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const weightNum = weightKg ? parseFloat(weightKg) : undefined;
  const heightNum = heightCm ? parseFloat(heightCm) : undefined;
  const bmi = computeBmi(weightNum, heightNum);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    const vitalsId = generateId();
    const now = new Date().toISOString();

    const payload = {
      encounterId,
      clinicId,
      systolicBp: systolicBp ? parseInt(systolicBp, 10) : null,
      diastolicBp: diastolicBp ? parseInt(diastolicBp, 10) : null,
      heartRate: heartRate ? parseInt(heartRate, 10) : null,
      weightKg: weightNum ?? null,
      heightCm: heightNum ?? null,
      bmi: bmi ?? null,
      notes: notes.trim() || null,
    };

    const record = {
      id: vitalsId,
      clinicId,
      encounterId,
      systolicBp: payload.systolicBp ?? undefined,
      diastolicBp: payload.diastolicBp ?? undefined,
      heartRate: payload.heartRate ?? undefined,
      weightKg: payload.weightKg ?? undefined,
      heightCm: payload.heightCm ?? undefined,
      bmi: payload.bmi ?? undefined,
      notes: payload.notes ?? undefined,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await db.vitals.put(record);
      await enqueueOutboxMutation(db, {
        clinicId,
        entityType: "vitals",
        entityId: vitalsId,
        operation: SYNC_OPERATION.UPSERT,
        payloadJson: payload,
      });
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save vitals");
    } finally {
      setSaving(false);
    }
  }, [
    clinicId,
    encounterId,
    systolicBp,
    diastolicBp,
    heartRate,
    weightKg,
    heightCm,
    notes,
    weightNum,
    bmi,
    onSaved,
  ]);

  useEffect(() => {
    if (saveRef) saveRef.current = handleSave;
    return () => {
      if (saveRef) saveRef.current = null;
    };
  }, [saveRef, handleSave]);

  return (
    <Card>
      <CardHeader>
        <h2 className="text-lg font-semibold">Vitals</h2>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="systolicBp">Systolic BP (mmHg)</Label>
            <Input
              id="systolicBp"
              type="number"
              value={systolicBp}
              onChange={(e) => setSystolicBp(e.target.value)}
              placeholder="120"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="diastolicBp">Diastolic BP (mmHg)</Label>
            <Input
              id="diastolicBp"
              type="number"
              value={diastolicBp}
              onChange={(e) => setDiastolicBp(e.target.value)}
              placeholder="80"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="heartRate">Heart Rate (bpm)</Label>
            <Input
              id="heartRate"
              type="number"
              value={heartRate}
              onChange={(e) => setHeartRate(e.target.value)}
              placeholder="72"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="weightKg">Weight (kg)</Label>
            <Input
              id="weightKg"
              type="number"
              step="0.1"
              value={weightKg}
              onChange={(e) => setWeightKg(e.target.value)}
              placeholder="70"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="heightCm">Height (cm)</Label>
            <Input
              id="heightCm"
              type="number"
              step="0.1"
              value={heightCm}
              onChange={(e) => setHeightCm(e.target.value)}
              placeholder="170"
            />
          </div>
          <div className="space-y-2">
            <Label>BMI</Label>
            <div className="flex h-9 items-center rounded-md border px-3 py-2 text-sm">
              {bmi != null ? bmi : "—"}
            </div>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="notes">Notes</Label>
          <Input
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional notes"
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save Vitals"}
        </Button>
      </CardContent>
    </Card>
  );
}
