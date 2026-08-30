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
import { HYPERTENSION_CLASSIFICATIONS, HYPERTENSION_LABELS } from '@/lib/hypertension';
import { InlineNotice } from '@/components/ops/OpsShared';
import { claimEncounterRecord } from '@/lib/encounter-record';

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

const CLASSIFICATIONS = HYPERTENSION_CLASSIFICATIONS;

interface HypertensionFormProps {
  clinicId: string;
  encounterId: string;
  initialData?: {
    classification?: string | null;
    suspected?: boolean | null;
    confirmed?: boolean | null;
    notes?: string | null;
  };
  onSaved?: () => void;
  canEdit?: boolean;
  /** Optional ref to expose save for parent-driven save (e.g. on tab change) */
  saveRef?: React.MutableRefObject<(() => Promise<void>) | null>;
}

export function HypertensionForm({
  clinicId,
  encounterId,
  initialData,
  onSaved,
  canEdit = true,
  saveRef,
}: HypertensionFormProps) {
  const [classification, setClassification] = useState<string>(
    initialData?.classification ?? 'UNKNOWN',
  );
  const [suspected, setSuspected] = useState(initialData?.suspected ?? false);
  const [confirmed, setConfirmed] = useState(initialData?.confirmed ?? false);
  const [notes, setNotes] = useState<string>(initialData?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /*
    Re-seed when the assessment arrives.

    `useState(initialData?.…)` only reads its argument on the first render, and the encounter page
    loads this record asynchronously -- from the API, then from the local cache. The form
    therefore mounted before the data existed and never caught up, so reopening an encounter that
    had a saved assessment showed "Not classified" regardless of what was stored. Same shape as
    DiabetesScreeningForm, which already does this.
  */
  useEffect(() => {
    if (!initialData) return;
    setClassification(initialData.classification ?? 'UNKNOWN');
    setSuspected(initialData.suspected ?? false);
    setConfirmed(initialData.confirmed ?? false);
    setNotes(initialData.notes ?? '');
  }, [initialData]);

  const handleSave = useCallback(async () => {
    if (!canEdit || saving) return;
    setSaving(true);
    setError(null);
    /*
      Reuse the encounter's existing row rather than minting a new id on every save.

      This handler used to call generateId() unconditionally, so each save inserted another row
      for the same encounter and the encounter page -- which reads with `.first()`, ordering
      duplicate index keys by primary key -- could hand back an older classification. See #91.
    */
    const claimed = await claimEncounterRecord(
      db.hypertension_assessments,
      encounterId,
      generateId,
    );
    const now = new Date().toISOString();

    const payload = {
      encounterId,
      clinicId,
      classification: CLASSIFICATIONS.includes(classification as (typeof CLASSIFICATIONS)[number])
        ? classification
        : 'UNKNOWN',
      suspected,
      confirmed,
      notes: notes.trim() || null,
    };

    const record = {
      id: claimed.id,
      clinicId,
      encounterId,
      classification: payload.classification,
      suspected: payload.suspected,
      confirmed: payload.confirmed,
      notes: payload.notes ?? undefined,
      // Preserved, not restamped: an update is not a creation.
      createdAt: claimed.createdAt ?? now,
      updatedAt: now,
    };

    try {
      await db.hypertension_assessments.put(record);
      await enqueueOutboxMutation(db, {
        clinicId,
        entityType: 'hypertension_assessment',
        entityId: claimed.id,
        operation: SYNC_OPERATION.UPSERT,
        payloadJson: payload,
      });
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save assessment');
    } finally {
      setSaving(false);
    }
  }, [
    canEdit,
    saving,
    clinicId,
    encounterId,
    classification,
    suspected,
    confirmed,
    notes,
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
        <h2 className="text-lg font-semibold">Hypertension Assessment</h2>
      </CardHeader>
      <CardContent className="space-y-4">
        <fieldset disabled={!canEdit || saving} className="space-y-4 disabled:opacity-75">
          <legend className="sr-only">Hypertension assessment details</legend>
          <div className="space-y-2">
            <Label htmlFor="classification">Classification</Label>
            {/*
              The id belongs on the trigger, and `disabled` has to be repeated here.

              `htmlFor="classification"` pointed at nothing, so the one control carrying the
              clinical finding had no accessible name at all -- a screen reader announced an
              unlabelled combobox. And Radix's Select is not a native control, so it does not
              inherit the surrounding `fieldset disabled`: a finalized assessment's classification
              was still changeable. MASTER.md section 10 calls out both; DiabetesScreeningForm
              already does it this way.
            */}
            <Select
              value={classification}
              onValueChange={setClassification}
              disabled={!canEdit || saving}
            >
              <SelectTrigger id="classification">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CLASSIFICATIONS.map((c) => (
                  <SelectItem key={c} value={c}>
                    {HYPERTENSION_LABELS[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap gap-6">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="suspected"
                checked={suspected}
                onCheckedChange={(v) => setSuspected(!!v)}
              />
              <Label htmlFor="suspected" className="cursor-pointer text-sm font-normal">
                Suspected
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="confirmed"
                checked={confirmed}
                onCheckedChange={(v) => setConfirmed(!!v)}
              />
              <Label htmlFor="confirmed" className="cursor-pointer text-sm font-normal">
                Confirmed
              </Label>
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
        </fieldset>
        {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}
        {canEdit ? (
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save Assessment'}
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">This assessment is read-only.</p>
        )}
      </CardContent>
    </Card>
  );
}
