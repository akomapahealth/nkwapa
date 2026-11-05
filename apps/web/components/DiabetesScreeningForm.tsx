'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
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
import { useSync } from '@/app/ServiceWorkerAndSyncProvider';
import type { GlucoseUnit } from '@nkwapa/db/measurement-units';
import { useClinicUnits } from '@/lib/bootstrap-context';
import {
  convertGlucoseText,
  glucoseEntryError,
  glucoseTextToMgDl,
  glucoseUnitLabel,
  hba1cEntryError,
  hba1cTextToPercent,
  hba1cUnitLabel,
  mgDlToGlucoseText,
  percentToHba1cText,
} from '@/lib/measurement-entry';
import { GlucoseUnitSelect } from '@/components/GlucoseUnitSelect';
import { isFullySynced } from '@/lib/sync';
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
  const { isOnline, syncNow } = useSync();
  const idPrefix = useId();
  const screeningId = useRef(initialData?.id ?? generateId());
  const units = useClinicUnits(clinicId);
  const hba1cUnit = units.hba1cUnit;
  const [glucoseUnit, setGlucoseUnit] = useState<GlucoseUnit>(units.glucoseUnit);
  // What the record held, so a value nobody edited is saved exactly as it was stored.
  const storedGlucoseMgDl = initialData?.glucoseMgDl ?? null;
  const storedHba1cPercent = initialData?.hba1cPercent ?? null;
  const [glucoseText, setGlucoseText] = useState(() =>
    mgDlToGlucoseText(storedGlucoseMgDl, units.glucoseUnit),
  );
  const [glucoseType, setGlucoseType] = useState<DiabetesGlucoseType>(
    (initialData?.glucoseType as DiabetesGlucoseType) ?? 'UNKNOWN',
  );
  const [hba1cText, setHba1cText] = useState(() =>
    percentToHba1cText(storedHba1cPercent, hba1cUnit),
  );
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
    setGlucoseText(mgDlToGlucoseText(initialData.glucoseMgDl, glucoseUnit));
    setGlucoseType((initialData.glucoseType as DiabetesGlucoseType) ?? 'UNKNOWN');
    setHba1cText(percentToHba1cText(initialData.hba1cPercent, hba1cUnit));
    setSymptoms(new Set(initialSymptoms(initialData)));
    setNotes(initialData.notes ?? '');
    setCollectedAt(toLocalDateTime(initialData.collectedAt));
    // Re-seeded only when the record changes; the units it is shown in are read, not watched.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialData]);

  const validateForm = useCallback((): string | null => {
    const glucoseError = glucoseEntryError(glucoseText, glucoseUnit);
    if (glucoseError) return `Glucose: ${glucoseError}`;
    const hba1cError = hba1cEntryError(hba1cText, hba1cUnit);
    if (hba1cError) return `HbA1c: ${hba1cError}`;
    const timestamp = new Date(collectedAt);
    if (!Number.isFinite(timestamp.getTime())) return 'Enter a valid collection date and time.';
    if (timestamp.getTime() > Date.now() + 5 * 60 * 1000) {
      return 'Collection time cannot be more than five minutes in the future.';
    }
    return null;
  }, [collectedAt, glucoseText, glucoseUnit, hba1cText, hba1cUnit]);

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
      // Stored units only: the unit on screen never reaches the outbox.
      glucoseMgDl: glucoseTextToMgDl(glucoseText, glucoseUnit, storedGlucoseMgDl),
      glucoseType,
      hba1cPercent: hba1cTextToPercent(hba1cText, hba1cUnit, storedHba1cPercent),
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
      const syncResult = isOnline ? await syncNow(clinicId) : null;
      setMessage({
        tone: 'success',
        text: isFullySynced(syncResult)
          ? 'Diabetes screening saved and synced.'
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
    glucoseText,
    glucoseType,
    glucoseUnit,
    hba1cText,
    hba1cUnit,
    initialData?.createdAt,
    storedGlucoseMgDl,
    storedHba1cPercent,
    isOnline,
    notes,
    onSaved,
    recordedByUserId,
    saving,
    symptoms,
    syncNow,
    validateForm,
  ]);

  const handleButtonSave = useCallback(() => {
    void handleSave().catch(() => undefined);
  }, [handleSave]);

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
    <Card>
      <CardHeader className="space-y-2">
        <div className="flex items-start gap-3">
          <span className="rounded-lg bg-primary/10 p-2 text-primary" aria-hidden="true">
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
              <Label htmlFor={`${idPrefix}-glucose`}>
                Glucose ({glucoseUnitLabel(glucoseUnit)})
              </Label>
              <div className="flex gap-2">
                <Input
                  id={`${idPrefix}-glucose`}
                  type="number"
                  inputMode={glucoseUnit === 'MMOL_L' ? 'decimal' : 'numeric'}
                  step={glucoseUnit === 'MMOL_L' ? '0.1' : '1'}
                  value={glucoseText}
                  onChange={(event) => setGlucoseText(event.target.value)}
                  placeholder={glucoseUnit === 'MMOL_L' ? '5.6' : '100'}
                  className="min-w-0"
                />
                <GlucoseUnitSelect
                  value={glucoseUnit}
                  onChange={(next) => {
                    setGlucoseText((current) =>
                      convertGlucoseText(current, glucoseUnit, next, storedGlucoseMgDl),
                    );
                    setGlucoseUnit(next);
                  }}
                  disabled={!canEdit || saving}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${idPrefix}-context`}>Glucose context</Label>
              <Select
                value={glucoseType}
                onValueChange={(value) => setGlucoseType(value as DiabetesGlucoseType)}
                disabled={!canEdit || saving}
              >
                <SelectTrigger id={`${idPrefix}-context`}>
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
              <Label htmlFor={`${idPrefix}-hba1c`}>HbA1c ({hba1cUnitLabel(hba1cUnit)})</Label>
              <Input
                id={`${idPrefix}-hba1c`}
                type="number"
                inputMode={hba1cUnit === 'MMOL_MOL' ? 'numeric' : 'decimal'}
                step={hba1cUnit === 'MMOL_MOL' ? '1' : '0.1'}
                value={hba1cText}
                onChange={(event) => setHba1cText(event.target.value)}
                placeholder={hba1cUnit === 'MMOL_MOL' ? '39' : '5.7'}
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
                  className="pl-10"
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
                    className="flex cursor-pointer items-center gap-3 rounded-lg border border-border bg-background px-4 py-2.5 transition-colors hover:bg-accent/60 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2"
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
            <p className="text-right text-xs tabular-nums text-muted-foreground">
              {notes.length}/2000
            </p>
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
            <Button onClick={handleButtonSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save diabetes screening'}
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
