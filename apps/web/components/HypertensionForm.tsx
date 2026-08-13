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

const CLASSIFICATIONS = ['NORMAL', 'ELEVATED', 'STAGE1', 'STAGE2', 'CRISIS', 'UNKNOWN'] as const;

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

  const handleSave = useCallback(async () => {
    if (!canEdit || saving) return;
    setSaving(true);
    setError(null);
    const assessmentId = generateId();
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
      id: assessmentId,
      clinicId,
      encounterId,
      classification: payload.classification,
      suspected: payload.suspected,
      confirmed: payload.confirmed,
      notes: payload.notes ?? undefined,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await db.hypertension_assessments.put(record);
      await enqueueOutboxMutation(db, {
        clinicId,
        entityType: 'hypertension_assessment',
        entityId: assessmentId,
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
            <Select value={classification} onValueChange={setClassification}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CLASSIFICATIONS.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
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
        {error && <p className="text-sm text-destructive">{error}</p>}
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
