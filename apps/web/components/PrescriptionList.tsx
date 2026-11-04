'use client';

import { useAuth } from '@/lib/auth-context';
import { apiFetch } from '@/lib/api';
import { useAsyncResource } from '@/lib/use-async-resource';
import { ResourceState } from '@/components/feedback/ResourceState';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import { confirmAction } from '@/components/ui/confirm-dialog';

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
  const resource = useAsyncResource<PrescriptionItem[]>({
    resourceKey: `${clinicId}:${encounterId}:${refreshKey ?? 0}`,
    requiresOnline: true,
    errorMessage: 'Prescriptions could not be loaded.',
    fetcher: async (getToken, signal) => {
      const res = await apiFetch(
        `/clinics/${encodeURIComponent(clinicId)}/encounters/${encodeURIComponent(encounterId)}/prescriptions`,
        { getToken, activeClinicId: clinicId, signal },
      );
      if (!res.ok) throw new Error('Prescriptions could not be loaded.');
      return (await res.json()) as PrescriptionItem[];
    },
  });

  const handleDelete = async (item: PrescriptionItem) => {
    const confirmed = await confirmAction({
      title: `Remove ${item.drug.name}?`,
      description:
        'This prescription is removed from the encounter before it is finalized. Re-enter it if it is still needed.',
      confirmLabel: 'Remove prescription',
    });
    if (!confirmed) return;
    const id = item.id;
    try {
      const res = await apiFetch(
        `/clinics/${encodeURIComponent(clinicId)}/encounters/${encodeURIComponent(encounterId)}/prescriptions/${id}`,
        { method: 'DELETE', getToken, activeClinicId: clinicId },
      );
      if (res.ok) {
        resource.setData((previous) => (previous ?? []).filter((p) => p.id !== id));
      }
    } catch {
      // Silently fail
    }
  };

  return (
    <ResourceState
      state={resource}
      empty={{
        title: 'No prescriptions yet.',
        description: 'Prescriptions recorded for this visit appear here.',
      }}
      isEmpty={(items) => items.length === 0}
    >
      {(items) => (
        <ul className="space-y-2">
          {items.map((p) => (
            <li
              key={p.id}
              className="flex items-start justify-between gap-3 rounded-md border p-3 [overflow-wrap:anywhere]"
            >
              <div>
                <p className="font-medium">
                  {p.drug.name}
                  {p.drug.genericName && (
                    <span className="ml-1 text-muted-foreground">({p.drug.genericName})</span>
                  )}
                </p>
                {/*
              These separators were `&middot;` inside template strings, so they reached the page
              as the literal seven characters rather than a bullet. Only the first one, which is
              real JSX, ever rendered.
            */}
                <p className="text-sm">
                  {[
                    p.dosage,
                    p.frequency,
                    p.duration || null,
                    p.quantity != null ? `Qty: ${p.quantity}` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                {p.instructions && (
                  <p className="text-sm text-muted-foreground">{p.instructions}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  Prescribed by {p.prescribedBy.displayName}
                </p>
              </div>
              {canWrite && !isFinalized && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${p.drug.name}`}
                  onClick={() => void handleDelete(p)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </ResourceState>
  );
}
