'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';

interface PrescriptionItem {
  id: string;
  dosage: string;
  frequency: string;
  duration?: string | null;
  quantity?: number | null;
  instructions?: string | null;
  drug: { id: string; name: string; genericName?: string | null };
  prescribedBy: { displayName: string };
}

interface PrescriptionListProps {
  clinicId: string;
  encounterId: string;
  canWrite: boolean;
  isFinalized: boolean;
  refreshKey?: number;
}

export function PrescriptionList({
  clinicId,
  encounterId,
  canWrite,
  isFinalized,
  refreshKey,
}: PrescriptionListProps) {
  const getToken = useAuth();
  const [items, setItems] = useState<PrescriptionItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(
        `/clinics/${encodeURIComponent(clinicId)}/encounters/${encodeURIComponent(encounterId)}/prescriptions`,
        { getToken, activeClinicId: clinicId },
      );
      if (res.ok) {
        setItems((await res.json()) as PrescriptionItem[]);
      }
    } catch {
      // Silently fail; can fall back to offline data if needed
    } finally {
      setLoading(false);
    }
  }, [clinicId, encounterId, getToken]);

  useEffect(() => {
    fetchList();
  }, [fetchList, refreshKey]);

  const handleDelete = async (id: string) => {
    try {
      const res = await apiFetch(
        `/clinics/${encodeURIComponent(clinicId)}/encounters/${encodeURIComponent(encounterId)}/prescriptions/${id}`,
        { method: 'DELETE', getToken, activeClinicId: clinicId },
      );
      if (res.ok) {
        setItems((prev) => prev.filter((p) => p.id !== id));
      }
    } catch {
      // Silently fail
    }
  };

  if (loading) return <p className="text-sm text-muted-foreground">Loading prescriptions...</p>;
  if (items.length === 0)
    return <p className="text-sm text-muted-foreground">No prescriptions yet.</p>;

  return (
    <ul className="space-y-2">
      {items.map((p) => (
        <li key={p.id} className="flex items-start justify-between rounded-md border p-3">
          <div>
            <p className="font-medium">
              {p.drug.name}
              {p.drug.genericName && (
                <span className="ml-1 text-muted-foreground">({p.drug.genericName})</span>
              )}
            </p>
            <p className="text-sm">
              {p.dosage} &middot; {p.frequency}
              {p.duration && ` &middot; ${p.duration}`}
              {p.quantity != null && ` &middot; Qty: ${p.quantity}`}
            </p>
            {p.instructions && <p className="text-sm text-muted-foreground">{p.instructions}</p>}
            <p className="text-xs text-muted-foreground">
              Prescribed by {p.prescribedBy.displayName}
            </p>
          </div>
          {canWrite && !isFinalized && (
            <Button variant="ghost" size="icon" onClick={() => handleDelete(p.id)}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}
