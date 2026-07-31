'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/lib/auth-context';
import { apiFetch } from '@/lib/api';
import { db } from '@/lib/db';
import { enqueueOutboxMutation, SYNC_OPERATION } from '@/lib/outbox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  requiresPrescriptionAllergyAcknowledgement,
  type AllergySummaryState,
} from '@/lib/medical-history';

interface Drug {
  id: string;
  name: string;
  genericName?: string;
  category: string;
}

interface PrescriptionFormProps {
  clinicId: string;
  encounterId: string;
  userId: string;
  onSaved?: () => void;
  allergyState?: AllergySummaryState;
}

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

export function PrescriptionForm({
  clinicId,
  encounterId,
  userId,
  onSaved,
  allergyState,
}: PrescriptionFormProps) {
  const getToken = useAuth();
  const [drugQuery, setDrugQuery] = useState('');
  const [drugs, setDrugs] = useState<Drug[]>([]);
  const [selectedDrug, setSelectedDrug] = useState<Drug | null>(null);
  const [dosage, setDosage] = useState('');
  const [frequency, setFrequency] = useState('');
  const [duration, setDuration] = useState('');
  const [quantity, setQuantity] = useState('');
  const [instructions, setInstructions] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allergyAcknowledged, setAllergyAcknowledged] = useState(false);
  const searchTimeout = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (drugQuery.length < 2) {
      setDrugs([]);
      return;
    }
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(async () => {
      try {
        const res = await apiFetch(
          `/clinics/${encodeURIComponent(clinicId)}/drugs?q=${encodeURIComponent(drugQuery)}`,
          { getToken, activeClinicId: clinicId },
        );
        if (res.ok) {
          setDrugs((await res.json()) as Drug[]);
        }
      } catch {
        // Ignore errors during search
      }
    }, 300);
  }, [drugQuery, clinicId, getToken]);

  const handleSave = async () => {
    const acknowledgementRequired = requiresPrescriptionAllergyAcknowledgement(allergyState);
    if (!selectedDrug || !dosage || !frequency || (acknowledgementRequired && !allergyAcknowledged))
      return;
    setSaving(true);
    setError(null);

    const body = {
      drugId: selectedDrug.id,
      dosage,
      frequency,
      duration: duration || undefined,
      quantity: quantity ? parseInt(quantity, 10) : undefined,
      instructions: instructions || undefined,
      allergyReviewed: acknowledgementRequired ? allergyAcknowledged : undefined,
    };

    try {
      const res = await apiFetch(
        `/clinics/${encodeURIComponent(clinicId)}/encounters/${encodeURIComponent(encounterId)}/prescriptions`,
        {
          method: 'POST',
          body: JSON.stringify(body),
          getToken,
          activeClinicId: clinicId,
        },
      );
      if (!res.ok) throw new Error(await res.text());
      resetForm();
      onSaved?.();
    } catch {
      try {
        const prescriptionId = generateId();
        const now = new Date().toISOString();
        await db.prescriptions.put({
          id: prescriptionId,
          clinicId,
          encounterId,
          drugId: selectedDrug.id,
          dosage,
          frequency,
          duration: duration || undefined,
          quantity: quantity ? parseInt(quantity, 10) : undefined,
          instructions: instructions || undefined,
          prescribedByUserId: userId,
          createdAt: now,
          updatedAt: now,
        });
        await enqueueOutboxMutation(db, {
          clinicId,
          entityType: 'prescription',
          entityId: prescriptionId,
          operation: SYNC_OPERATION.UPSERT,
          payloadJson: {
            encounterId,
            drugId: selectedDrug.id,
            dosage,
            frequency,
            duration: duration || null,
            quantity: quantity ? parseInt(quantity, 10) : null,
            instructions: instructions || null,
            allergyReviewed: acknowledgementRequired ? allergyAcknowledged : undefined,
            prescribedByUserId: userId,
          },
        });
        resetForm();
        onSaved?.();
      } catch (offlineErr) {
        setError(offlineErr instanceof Error ? offlineErr.message : 'Failed to save');
      }
    } finally {
      setSaving(false);
    }
  };

  function resetForm() {
    setSelectedDrug(null);
    setDrugQuery('');
    setDosage('');
    setFrequency('');
    setDuration('');
    setQuantity('');
    setInstructions('');
    setAllergyAcknowledged(false);
  }

  const acknowledgementRequired = requiresPrescriptionAllergyAcknowledgement(allergyState);

  return (
    <div className="space-y-4 rounded-3xl border border-border/80 bg-background/70 p-4 sm:p-5">
      <h3 className="text-base font-semibold">Add prescription</h3>
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="space-y-2">
        <Label htmlFor="prescription-drug-search">Drug</Label>
        {selectedDrug ? (
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{selectedDrug.name}</span>
            <Button variant="ghost" size="sm" onClick={() => setSelectedDrug(null)}>
              Change
            </Button>
          </div>
        ) : (
          <div>
            <Input
              id="prescription-drug-search"
              placeholder="Search drugs..."
              value={drugQuery}
              onChange={(e) => setDrugQuery(e.target.value)}
            />
            {drugs.length > 0 && (
              <ul className="mt-1 max-h-40 overflow-y-auto rounded-md border">
                {drugs.map((d) => (
                  <li key={d.id}>
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-left text-sm hover:bg-accent"
                      onClick={() => {
                        setSelectedDrug(d);
                        setDrugQuery('');
                        setDrugs([]);
                      }}
                    >
                      {d.name}{' '}
                      {d.genericName && (
                        <span className="text-muted-foreground">({d.genericName})</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="prescription-dosage">Dosage</Label>
          <Input
            id="prescription-dosage"
            value={dosage}
            onChange={(e) => setDosage(e.target.value)}
            placeholder="e.g. 10mg"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="prescription-frequency">Frequency</Label>
          <Input
            id="prescription-frequency"
            value={frequency}
            onChange={(e) => setFrequency(e.target.value)}
            placeholder="e.g. twice daily"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="prescription-duration">Duration</Label>
          <Input
            id="prescription-duration"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            placeholder="e.g. 30 days"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="prescription-quantity">Quantity</Label>
          <Input
            id="prescription-quantity"
            type="number"
            min="1"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="prescription-instructions">Instructions</Label>
        <Textarea
          id="prescription-instructions"
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder="Additional instructions..."
        />
      </div>
      {acknowledgementRequired ? (
        <div className="flex min-h-11 items-start gap-3 rounded-2xl border border-amber-500/35 bg-amber-500/10 p-3">
          <Checkbox
            id="prescription-allergy-acknowledgement"
            checked={allergyAcknowledged}
            onCheckedChange={(checked) => setAllergyAcknowledged(checked === true)}
            className="mt-0.5 h-5 w-5"
          />
          <Label
            htmlFor="prescription-allergy-acknowledgement"
            className="cursor-pointer text-sm leading-5"
          >
            I reviewed the patient&apos;s allergy status before prescribing.
          </Label>
        </div>
      ) : null}
      <Button
        className="min-h-11 w-full sm:w-auto"
        onClick={handleSave}
        disabled={
          saving ||
          !selectedDrug ||
          !dosage ||
          !frequency ||
          (acknowledgementRequired && !allergyAcknowledged)
        }
      >
        {saving ? 'Saving...' : 'Add Prescription'}
      </Button>
    </div>
  );
}
