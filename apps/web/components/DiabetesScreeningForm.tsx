'use client';

import { useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { db } from '@/lib/db';
import { enqueueOutboxMutation } from '@/lib/outbox';
import { SYNC_OPERATION } from '@/lib/outbox';

function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const GLUCOSE_TYPES = ['FASTING', 'RANDOM', 'UNKNOWN'] as const;
const SYMPTOM_OPTIONS = [
  'Polyuria',
  'Polydipsia',
  'Weight loss',
  'Blurred vision',
  'Fatigue',
] as const;

interface DiabetesScreeningFormProps {
  clinicId: string;
  encounterId: string;
  initialData?: {
    glucoseMgDl?: number | null;
    glucoseType?: string | null;
    hba1cPercent?: number | null;
    symptomsJson?: string | null;
    notes?: string | null;
  };
  onSaved?: () => void;
  /** Optional ref to expose save for parent-driven save (e.g. on tab change) */
  saveRef?: React.MutableRefObject<(() => Promise<void>) | null>;
}

export function DiabetesScreeningForm({
  clinicId,
  encounterId,
  initialData,
  onSaved,
  saveRef,
}: DiabetesScreeningFormProps) {
  const [glucoseMgDl, setGlucoseMgDl] = useState<string>(String(initialData?.glucoseMgDl ?? ''));
  const [glucoseType, setGlucoseType] = useState<string>(initialData?.glucoseType ?? 'UNKNOWN');
  const [hba1cPercent, setHba1cPercent] = useState<string>(String(initialData?.hba1cPercent ?? ''));
  const [symptoms, setSymptoms] = useState<Set<string>>(() => {
    try {
      const parsed = initialData?.symptomsJson
        ? (JSON.parse(initialData.symptomsJson) as string[])
        : [];
      return new Set(Array.isArray(parsed) ? parsed : []);
    } catch {
      return new Set();
    }
  });
  const [notes, setNotes] = useState<string>(initialData?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleSymptom = useCallback((symptom: string) => {
    setSymptoms((prev) => {
      const next = new Set(prev);
      if (next.has(symptom)) {
        next.delete(symptom);
      } else {
        next.add(symptom);
      }
      return next;
    });
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    const screeningId = generateId();
    const now = new Date().toISOString();

    const symptomsArray = Array.from(symptoms);
    const symptomsJson = JSON.stringify(symptomsArray);

    const payload = {
      encounterId,
      clinicId,
      glucoseMgDl: glucoseMgDl ? parseInt(glucoseMgDl, 10) : null,
      glucoseType: GLUCOSE_TYPES.includes(glucoseType as (typeof GLUCOSE_TYPES)[number])
        ? (glucoseType as 'FASTING' | 'RANDOM' | 'UNKNOWN')
        : 'UNKNOWN',
      hba1cPercent: hba1cPercent ? parseFloat(hba1cPercent) : null,
      symptomsJson: symptomsArray.length > 0 ? symptomsJson : null,
      notes: notes.trim() || null,
    };

    const record = {
      id: screeningId,
      clinicId,
      encounterId,
      glucoseMgDl: payload.glucoseMgDl ?? undefined,
      glucoseType: payload.glucoseType,
      hba1cPercent: payload.hba1cPercent ?? undefined,
      symptomsJson: payload.symptomsJson ?? undefined,
      notes: payload.notes ?? undefined,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await db.diabetes_screenings.put(record);
      await enqueueOutboxMutation(db, {
        clinicId,
        entityType: 'diabetes_screening',
        entityId: screeningId,
        operation: SYNC_OPERATION.UPSERT,
        payloadJson: payload,
      });
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save screening');
    } finally {
      setSaving(false);
    }
  }, [clinicId, encounterId, glucoseMgDl, glucoseType, hba1cPercent, symptoms, notes, onSaved]);

  useEffect(() => {
    if (saveRef) saveRef.current = handleSave;
    return () => {
      if (saveRef) saveRef.current = null;
    };
  }, [saveRef, handleSave]);

  return (
    <Card>
      <CardHeader>
        <h2 className="text-lg font-semibold">Diabetes Screening</h2>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="glucoseMgDl">Glucose (mg/dL)</Label>
            <Input
              id="glucoseMgDl"
              type="number"
              value={glucoseMgDl}
              onChange={(e) => setGlucoseMgDl(e.target.value)}
              placeholder="100"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="glucoseType">Glucose Type</Label>
            <Select value={glucoseType} onValueChange={setGlucoseType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GLUCOSE_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="hba1cPercent">HbA1c (%)</Label>
            <Input
              id="hba1cPercent"
              type="number"
              step="0.1"
              value={hba1cPercent}
              onChange={(e) => setHba1cPercent(e.target.value)}
              placeholder="5.7"
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Symptoms</Label>
          <div className="flex flex-wrap gap-4">
            {SYMPTOM_OPTIONS.map((s) => (
              <div key={s} className="flex items-center space-x-2">
                <Checkbox
                  id={`symptom-${s}`}
                  checked={symptoms.has(s)}
                  onCheckedChange={() => toggleSymptom(s)}
                />
                <Label htmlFor={`symptom-${s}`} className="cursor-pointer text-sm font-normal">
                  {s}
                </Label>
              </div>
            ))}
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
          {saving ? 'Saving…' : 'Save Screening'}
        </Button>
      </CardContent>
    </Card>
  );
}
