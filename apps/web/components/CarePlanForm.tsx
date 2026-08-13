'use client';

import { useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
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

interface CarePlanFormProps {
  clinicId: string;
  encounterId: string;
  initialData?: {
    counselingGiven?: boolean | null;
    medicationPrescribed?: boolean | null;
    followUpDate?: string | null;
    notes?: string | null;
  };
  onSaved?: () => void;
  canEdit?: boolean;
  /** Optional ref to expose save for parent-driven save (e.g. on tab change) */
  saveRef?: React.MutableRefObject<(() => Promise<void>) | null>;
}

export function CarePlanForm({
  clinicId,
  encounterId,
  initialData,
  onSaved,
  canEdit = true,
  saveRef,
}: CarePlanFormProps) {
  const [counselingGiven, setCounselingGiven] = useState(initialData?.counselingGiven ?? false);
  const [medicationPrescribed, setMedicationPrescribed] = useState(
    initialData?.medicationPrescribed ?? false,
  );
  const [followUpDate, setFollowUpDate] = useState<string>(
    initialData?.followUpDate ? new Date(initialData.followUpDate).toISOString().slice(0, 10) : '',
  );
  const [notes, setNotes] = useState<string>(initialData?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = useCallback(async () => {
    if (!canEdit || saving) return;
    setSaving(true);
    setError(null);
    const existing = await db.care_plans.where('encounterId').equals(encounterId).first();
    const carePlanId = existing?.id ?? generateId();
    const now = new Date().toISOString();

    const payload = {
      encounterId,
      clinicId,
      counselingGiven,
      medicationPrescribed,
      followUpDate: followUpDate ? new Date(followUpDate).toISOString() : null,
      notes: notes.trim() || null,
    };

    const record = {
      id: carePlanId,
      clinicId,
      encounterId,
      counselingGiven,
      medicationPrescribed,
      followUpDate: payload.followUpDate ?? undefined,
      notes: payload.notes ?? undefined,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await db.care_plans.put(record);
      await enqueueOutboxMutation(db, {
        clinicId,
        entityType: 'care_plan',
        entityId: carePlanId,
        operation: SYNC_OPERATION.UPSERT,
        payloadJson: payload,
      });
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save care plan');
    } finally {
      setSaving(false);
    }
  }, [
    canEdit,
    saving,
    clinicId,
    encounterId,
    counselingGiven,
    medicationPrescribed,
    followUpDate,
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
        <h2 className="text-lg font-semibold">Care Plan</h2>
      </CardHeader>
      <CardContent className="space-y-4">
        <fieldset disabled={!canEdit || saving} className="space-y-4 disabled:opacity-75">
          <legend className="sr-only">Care plan details</legend>
          <div className="flex items-center gap-2">
            <Checkbox
              id="counselingGiven"
              checked={counselingGiven}
              onCheckedChange={(v) => setCounselingGiven(v === true)}
            />
            <Label htmlFor="counselingGiven">Counseling given</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="medicationPrescribed"
              checked={medicationPrescribed}
              onCheckedChange={(v) => setMedicationPrescribed(v === true)}
            />
            <Label htmlFor="medicationPrescribed">Medication prescribed</Label>
          </div>
          <div className="space-y-2">
            <Label htmlFor="followUpDate">Follow-up date</Label>
            <Input
              id="followUpDate"
              type="date"
              value={followUpDate}
              onChange={(e) => setFollowUpDate(e.target.value)}
            />
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
            {saving ? 'Saving…' : 'Save Care Plan'}
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">This care plan is read-only.</p>
        )}
      </CardContent>
    </Card>
  );
}
