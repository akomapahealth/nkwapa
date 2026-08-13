'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  DIABETES_GLUCOSE_MAX_MG_DL,
  DIABETES_GLUCOSE_MIN_MG_DL,
  DIABETES_HBA1C_MAX_PERCENT,
  DIABETES_HBA1C_MIN_PERCENT,
  DIABETES_SYMPTOMS,
  DIABETES_SYMPTOM_LABELS,
  parseLegacyDiabetesSymptoms,
  type DiabetesGlucoseType,
  type DiabetesSymptom,
} from '@nkwapa/db';
import { AlertTriangle, CalendarClock, CheckCircle2, CloudOff, Droplets } from 'lucide-react';
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
import { Textarea } from '@/components/ui/textarea';
import { InlineNotice } from '@/components/ops/OpsShared';
import { db, type DiabetesScreeningRecord } from '@/lib/db';
import { enqueueOutboxMutation, SYNC_OPERATION } from '@/lib/outbox';

const GLUCOSE_CONTEXTS: Array<{ value: DiabetesGlucoseType; label: string }> = [
  { value: 'FASTING', label: 'Fasting' },
  { value: 'RANDOM', label: 'Random' },
  { value: 'UNKNOWN', label: 'Unknown / not documented' },
];

function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = (Math.random() * 16) | 0;
    const value = character === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function toLocalDateTime(value: string | null | undefined): string {
  const date = value ? new Date(value) : new Date();
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

function initialSymptoms(data?: DiabetesScreeningRecord | null): DiabetesSymptom[] {
  if (data?.symptoms) return data.symptoms;
  return parseLegacyDiabetesSymptoms(data?.symptomsJson).symptoms;
}

export interface DiabetesScreeningFormProps {
  clinicId: string;
  encounterId: string;
  recordedByUserId: string;
  initialData?: DiabetesScreeningRecord | null;
  canEdit?: boolean;
  onSaved?: () => void;
  saveRef?: React.MutableRefObject<(() => Promise<void>) | null>;
}

export function DiabetesScreeningForm({
  clinicId,
  encounterId,
  recordedByUserId,
  initialData,
  canEdit = true,
  onSaved,
  saveRef,
}: DiabetesScreeningFormProps) {
  const idPrefix = useId();
  const screeningId = useRef(initialData?.id ?? generateId());
  const [glucoseMgDl, setGlucoseMgDl] = useState(String(initialData?.glucoseMgDl ?? ''));
  const [glucoseType, setGlucoseType] = useState<DiabetesGlucoseType>(
    (initialData?.glucoseType as DiabetesGlucoseType) ?? 'UNKNOWN',
  );
  const [hba1cPercent, setHba1cPercent] = useState(String(initialData?.hba1cPercent ?? ''));
  const [symptoms, setSymptoms] = useState<Set<DiabetesSymptom>>(
    () => new Set(initialSymptoms(initialData)),
  );
  const [notes, setNotes] = useState(initialData?.notes ?? '');
  const [collectedAt, setCollectedAt] = useState(toLocalDateTime(initialData?.collectedAt));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    tone: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  useEffect(() => {
    if (!initialData) return;
    screeningId.current = initialData.id;
    setGlucoseMgDl(String(initialData.glucoseMgDl ?? ''));
    setGlucoseType((initialData.glucoseType as DiabetesGlucoseType) ?? 'UNKNOWN');
    setHba1cPercent(String(initialData.hba1cPercent ?? ''));
    setSymptoms(new Set(initialSymptoms(initialData)));
    setNotes(initialData.notes ?? '');
    setCollectedAt(toLocalDateTime(initialData.collectedAt));
  }, [initialData]);

  const validateForm = useCallback((): string | null => {
    const glucose = glucoseMgDl === '' ? null : Number(glucoseMgDl);
    const hba1c = hba1cPercent === '' ? null : Number(hba1cPercent);
    if (
      glucose != null &&
      (!Number.isInteger(glucose) ||
        glucose < DIABETES_GLUCOSE_MIN_MG_DL ||
        glucose > DIABETES_GLUCOSE_MAX_MG_DL)
    ) {
      return `Glucose must be a whole number from ${DIABETES_GLUCOSE_MIN_MG_DL} to ${DIABETES_GLUCOSE_MAX_MG_DL} mg/dL.`;
    }
    if (
      hba1c != null &&
      (hba1c < DIABETES_HBA1C_MIN_PERCENT || hba1c > DIABETES_HBA1C_MAX_PERCENT)
    ) {
      return `HbA1c must be from ${DIABETES_HBA1C_MIN_PERCENT} to ${DIABETES_HBA1C_MAX_PERCENT}%.`;
    }
    const timestamp = new Date(collectedAt);
    if (!Number.isFinite(timestamp.getTime())) return 'Enter a valid collection date and time.';
    if (timestamp.getTime() > Date.now() + 5 * 60 * 1000) {
      return 'Collection time cannot be more than five minutes in the future.';
    }
    return null;
  }, [collectedAt, glucoseMgDl, hba1cPercent]);

  const toggleSymptom = useCallback((symptom: DiabetesSymptom) => {
    setSymptoms((current) => {
      const next = new Set(current);
      if (next.has(symptom)) next.delete(symptom);
      else next.add(symptom);
      return next;
    });
  }, []);

  const handleSave = useCallback(async () => {
    if (!canEdit || saving) return;
    const validationError = validateForm();
    if (validationError) {
      setMessage({ tone: 'error', text: validationError });
      throw new Error(validationError);
    }

    setSaving(true);
    setMessage(null);
    const now = new Date().toISOString();
    const payload = {
      encounterId,
      glucoseMgDl: glucoseMgDl === '' ? null : Number(glucoseMgDl),
      glucoseType,
      hba1cPercent: hba1cPercent === '' ? null : Number(hba1cPercent),
      symptoms: Array.from(symptoms),
      notes: notes.trim() || null,
      collectedAt: new Date(collectedAt).toISOString(),
    };
    const record: DiabetesScreeningRecord = {
      id: screeningId.current,
      clinicId,
      encounterId,
      glucoseMgDl: payload.glucoseMgDl ?? undefined,
      glucoseType: payload.glucoseType,
      hba1cPercent: payload.hba1cPercent ?? undefined,
      symptoms: payload.symptoms,
      notes: payload.notes ?? undefined,
      collectedAt: payload.collectedAt,
      authoredByUserId: recordedByUserId,
      legacySymptomsUnmapped: false,
      createdAt: initialData?.createdAt ?? now,
      updatedAt: now,
    };

    try {
      await db.transaction('rw', db.diabetes_screenings, db.outbox, async () => {
        await db.diabetes_screenings.put(record);
        await enqueueOutboxMutation(db, {
          clinicId,
          entityType: 'diabetes_screening',
          entityId: screeningId.current,
          operation: SYNC_OPERATION.UPSERT,
          payloadJson: payload,
        });
      });
      setMessage({
        tone: 'success',
        text: navigator.onLine
          ? 'Diabetes screening saved and queued for sync.'
          : 'Diabetes screening saved on this device and pending sync.',
      });
      onSaved?.();
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Unable to save diabetes screening.';
      setMessage({ tone: 'error', text });
      throw error;
    } finally {
      setSaving(false);
    }
  }, [
    canEdit,
    clinicId,
    collectedAt,
    encounterId,
    glucoseMgDl,
    glucoseType,
    hba1cPercent,
    initialData?.createdAt,
    notes,
    onSaved,
    recordedByUserId,
    saving,
    symptoms,
    validateForm,
  ]);

  useEffect(() => {
    if (!saveRef) return;
    saveRef.current = handleSave;
    return () => {
      saveRef.current = null;
    };
  }, [handleSave, saveRef]);

  const contextHelp = useMemo(
    () =>
      glucoseType === 'UNKNOWN'
        ? 'Unknown context remains distinct and is not interpreted as fasting or random.'
        : `${glucoseType === 'FASTING' ? 'Fasting' : 'Random'} context is recorded exactly as selected.`,
    [glucoseType],
  );

  return (
    <Card className="rounded-[28px] border-border/80 bg-card/90 shadow-lg shadow-black/5">
      <CardHeader className="space-y-2">
        <div className="flex items-start gap-3">
          <span className="rounded-2xl bg-primary/10 p-2 text-primary" aria-hidden="true">
            <Droplets className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-heading text-xl font-semibold">Current diabetes screening</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Record the measurement context and collection time without inferring a diagnosis.
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {initialData?.legacySymptomsUnmapped ? (
          <InlineNotice tone="info">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            Some legacy symptom content could not be mapped. The original value remains preserved
            for audit review.
          </InlineNotice>
        ) : null}

        <fieldset disabled={!canEdit || saving} className="space-y-6 disabled:opacity-75">
          <legend className="sr-only">Diabetes screening measurements</legend>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor={`${idPrefix}-glucose`}>Glucose (mg/dL)</Label>
              <Input
                id={`${idPrefix}-glucose`}
                type="number"
                inputMode="numeric"
                min={DIABETES_GLUCOSE_MIN_MG_DL}
                max={DIABETES_GLUCOSE_MAX_MG_DL}
                step="1"
                value={glucoseMgDl}
                onChange={(event) => setGlucoseMgDl(event.target.value)}
                placeholder="100"
                className="min-h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${idPrefix}-context`}>Glucose context</Label>
              <Select
                value={glucoseType}
                onValueChange={(value) => setGlucoseType(value as DiabetesGlucoseType)}
                disabled={!canEdit || saving}
              >
                <SelectTrigger id={`${idPrefix}-context`} className="min-h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GLUCOSE_CONTEXTS.map((context) => (
                    <SelectItem key={context.value} value={context.value}>
                      {context.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs leading-5 text-muted-foreground">{contextHelp}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${idPrefix}-hba1c`}>HbA1c (%)</Label>
              <Input
                id={`${idPrefix}-hba1c`}
                type="number"
                inputMode="decimal"
                min={DIABETES_HBA1C_MIN_PERCENT}
                max={DIABETES_HBA1C_MAX_PERCENT}
                step="0.1"
                value={hba1cPercent}
                onChange={(event) => setHba1cPercent(event.target.value)}
                placeholder="5.7"
                className="min-h-11"
              />
            </div>
            <div className="space-y-2 md:col-span-2 xl:col-span-3">
              <Label htmlFor={`${idPrefix}-collected-at`}>Measurement collection time</Label>
              <div className="relative max-w-md">
                <CalendarClock
                  className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  id={`${idPrefix}-collected-at`}
                  type="datetime-local"
                  value={collectedAt}
                  onChange={(event) => setCollectedAt(event.target.value)}
                  className="min-h-11 pl-10"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Use when the sample was collected, which may differ from when this record is saved.
              </p>
            </div>
          </div>

          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">Symptoms reported or observed</legend>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {DIABETES_SYMPTOMS.map((symptom) => {
                const checkboxId = `${idPrefix}-symptom-${symptom.toLowerCase()}`;
                return (
                  <label
                    key={symptom}
                    htmlFor={checkboxId}
                    className="flex min-h-11 cursor-pointer items-center gap-3 rounded-2xl border border-border/80 bg-background/70 px-4 py-2.5 transition-colors hover:bg-accent/60 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2"
                  >
                    <Checkbox
                      id={checkboxId}
                      checked={symptoms.has(symptom)}
                      onCheckedChange={() => toggleSymptom(symptom)}
                    />
                    <span className="text-sm">{DIABETES_SYMPTOM_LABELS[symptom]}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-notes`}>Clinical notes</Label>
            <Textarea
              id={`${idPrefix}-notes`}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Optional context for interpreting this screening"
              maxLength={2000}
              rows={4}
            />
            <p className="text-right text-xs text-muted-foreground">{notes.length}/2000</p>
          </div>
        </fieldset>

        {message ? (
          <InlineNotice tone={message.tone}>
            {message.tone === 'success' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            ) : message.tone === 'info' ? (
              <CloudOff className="h-4 w-4 shrink-0" aria-hidden="true" />
            ) : (
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            )}
            {message.text}
          </InlineNotice>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-5">
          <p className="text-sm text-muted-foreground">
            {canEdit
              ? 'Changes save locally first and sync automatically.'
              : 'This screening is read-only.'}
          </p>
          {canEdit ? (
            <Button onClick={handleSave} disabled={saving} className="min-h-11 rounded-2xl">
              {saving ? 'Saving…' : 'Save diabetes screening'}
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
