'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type { AllergySummary } from '@/lib/medical-history';
import { AllergySummaryBanner } from './AllergySummaryBanner';
import { PrescriptionForm } from '@/components/PrescriptionForm';
import { PrescriptionList } from '@/components/PrescriptionList';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

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
    <Card className="rounded-[28px] border-border/80 bg-card/90 shadow-lg shadow-black/5">
      <CardHeader>
        <h2 className="text-lg font-semibold">Prescriptions</h2>
        <p className="text-sm text-muted-foreground">
          Medication decisions remain linked to this encounter and patient chart.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
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
      </CardContent>
    </Card>
  );
}
