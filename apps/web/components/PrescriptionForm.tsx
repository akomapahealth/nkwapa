"use client";

import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";
import { db } from "@/lib/db";
import { enqueueOutboxMutation, SYNC_OPERATION } from "@/lib/outbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

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
}

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

export function PrescriptionForm({ clinicId, encounterId, userId, onSaved }: PrescriptionFormProps) {
  const getToken = useAuth();
  const [drugQuery, setDrugQuery] = useState("");
  const [drugs, setDrugs] = useState<Drug[]>([]);
  const [selectedDrug, setSelectedDrug] = useState<Drug | null>(null);
  const [dosage, setDosage] = useState("");
  const [frequency, setFrequency] = useState("");
  const [duration, setDuration] = useState("");
  const [quantity, setQuantity] = useState("");
  const [instructions, setInstructions] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
          { getToken, activeClinicId: clinicId }
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
    if (!selectedDrug || !dosage || !frequency) return;
    setSaving(true);
    setError(null);

    const body = {
      drugId: selectedDrug.id,
      dosage,
      frequency,
      duration: duration || undefined,
      quantity: quantity ? parseInt(quantity, 10) : undefined,
      instructions: instructions || undefined,
    };

    try {
      const res = await apiFetch(
        `/clinics/${encodeURIComponent(clinicId)}/encounters/${encodeURIComponent(encounterId)}/prescriptions`,
        {
          method: "POST",
          body: JSON.stringify(body),
          getToken,
          activeClinicId: clinicId,
        }
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
          entityType: "prescription",
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
            prescribedByUserId: userId,
          },
        });
        resetForm();
        onSaved?.();
      } catch (offlineErr) {
        setError(offlineErr instanceof Error ? offlineErr.message : "Failed to save");
      }
    } finally {
      setSaving(false);
    }
  };

  function resetForm() {
    setSelectedDrug(null);
    setDrugQuery("");
    setDosage("");
    setFrequency("");
    setDuration("");
    setQuantity("");
    setInstructions("");
  }

  return (
    <div className="space-y-4 rounded-md border p-4">
      <h3 className="text-sm font-semibold">Add Prescription</h3>
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="space-y-2">
        <Label>Drug</Label>
        {selectedDrug ? (
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{selectedDrug.name}</span>
            <Button variant="ghost" size="sm" onClick={() => setSelectedDrug(null)}>Change</Button>
          </div>
        ) : (
          <div>
            <Input
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
                      onClick={() => { setSelectedDrug(d); setDrugQuery(""); setDrugs([]); }}
                    >
                      {d.name} {d.genericName && <span className="text-muted-foreground">({d.genericName})</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Dosage</Label>
          <Input value={dosage} onChange={(e) => setDosage(e.target.value)} placeholder="e.g. 10mg" />
        </div>
        <div className="space-y-2">
          <Label>Frequency</Label>
          <Input value={frequency} onChange={(e) => setFrequency(e.target.value)} placeholder="e.g. twice daily" />
        </div>
        <div className="space-y-2">
          <Label>Duration</Label>
          <Input value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="e.g. 30 days" />
        </div>
        <div className="space-y-2">
          <Label>Quantity</Label>
          <Input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Instructions</Label>
        <Textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Additional instructions..." />
      </div>
      <Button onClick={handleSave} disabled={saving || !selectedDrug || !dosage || !frequency}>
        {saving ? "Saving..." : "Add Prescription"}
      </Button>
    </div>
  );
}
