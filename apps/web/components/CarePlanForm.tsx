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
import { Textarea } from '@/components/ui/textarea';
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
    // Already reused its id, which is why it never had #91's bug. Sharing the helper keeps it
    // that way, and adds the duplicate collapse and createdAt preservation it did not have.
    const claimed = await claimEncounterRecord(db.care_plans, encounterId, generateId);
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
      id: claimed.id,
      clinicId,
      encounterId,
      counselingGiven,
      medicationPrescribed,
      followUpDate: payload.followUpDate ?? undefined,
      notes: payload.notes ?? undefined,
      createdAt: claimed.createdAt ?? now,
      updatedAt: now,
    };

    try {
      await db.care_plans.put(record);
      await enqueueOutboxMutation(db, {
        clinicId,
        entityType: 'care_plan',
        entityId: claimed.id,
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
            <Label htmlFor="notes">Notes (optional)</Label>
            {/* Free clinical text, so a textarea: this was a single-line Input, alone among every
                Notes field in the product. */}
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Anything the next clinician should know about this plan"
            />
          </div>
        </fieldset>
        {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}
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
