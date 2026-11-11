'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type { AllergySummary } from '@/lib/medical-history';
import { AllergySummaryBanner } from './AllergySummaryBanner';
import { PrescriptionForm } from '@/components/PrescriptionForm';
import { PrescriptionList } from '@/components/PrescriptionList';

const unavailable: AllergySummary = { state: 'UNAVAILABLE', activeAllergies: [] };

export function PrescriptionPanel({
  clinicId,
  patientId,
  encounterId,
  userId,
  canWrite,
  isFinalized,
  showAllergySafety,
}: {
  clinicId: string;
  patientId: string;
  encounterId: string;
  userId: string;
  canWrite: boolean;
  isFinalized: boolean;
  showAllergySafety: boolean;
}) {
  const getToken = useAuth();
  const [summary, setSummary] = useState<AllergySummary>(unavailable);
  const [refreshKey, setRefreshKey] = useState(0);

  const loadAllergies = useCallback(async () => {
    if (!showAllergySafety) return;
    try {
      const response = await apiFetch(
        `/clinics/${encodeURIComponent(clinicId)}/patients/${encodeURIComponent(patientId)}/allergy-summary`,
        { getToken, activeClinicId: clinicId },
      );
      if (response.ok) setSummary((await response.json()) as AllergySummary);
      else setSummary(unavailable);
    } catch {
      setSummary(unavailable);
    }
  }, [clinicId, getToken, patientId, showAllergySafety]);

  useEffect(() => {
    void loadAllergies();
  }, [loadAllergies]);

  return (
    // A ruled section on the sheet, like the clinical note above it (R4.1), not a card.
    <section
      aria-labelledby="prescriptions-title"
      className="space-y-5 border-t-2 border-rule-strong pt-4"
    >
      <div>
        <h2 id="prescriptions-title" className="type-section-title text-foreground">
          Prescriptions
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Medication decisions remain linked to this encounter and patient chart.
        </p>
      </div>
      {showAllergySafety ? <AllergySummaryBanner summary={summary} compact /> : null}
      <PrescriptionList
        clinicId={clinicId}
        encounterId={encounterId}
        canWrite={canWrite}
        isFinalized={isFinalized}
        refreshKey={refreshKey}
      />
      {canWrite && !isFinalized ? (
        <PrescriptionForm
          clinicId={clinicId}
          encounterId={encounterId}
          userId={userId}
          allergyState={showAllergySafety ? summary.state : undefined}
          onSaved={() => setRefreshKey((value) => value + 1)}
        />
      ) : null}
    </section>
  );
}
