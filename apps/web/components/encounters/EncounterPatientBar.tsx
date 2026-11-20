'use client';

import { useEffect, useState, type RefObject } from 'react';
import { PatientContextBar, sexAgeLabel } from '@/components/patients/PatientContextBar';
import { db } from '@/lib/db';
import { canSeeFollowUpTier, fetchFollowUp } from '@/lib/follow-up';
import { fetchPatientChartSummary } from '@/lib/patient-chart';
import { ageInYears } from '@/lib/stations';
import { useAsyncResource } from '@/lib/use-async-resource';

/**
 * The visit's pinned patient bar. Allergies and tier come from the chart's own reads; offline or
 * on an error they are left out and the name and code still show. Sex and age come from this
 * device's copy of the patient.
 */
export function EncounterPatientBar({
  anchor,
  clinicId,
  patientId,
  name,
  code,
  permissions,
}: {
  anchor: RefObject<HTMLElement | null>;
  clinicId: string;
  patientId: string;
  name: string;
  code: string;
  permissions: readonly string[];
}) {
  const canSeeTier = canSeeFollowUpTier(permissions);
  const key = `${clinicId}:${patientId}`;
  const summary = useAsyncResource({
    fetcher: (getToken) => fetchPatientChartSummary(clinicId, patientId, getToken),
    resourceKey: key,
    errorMessage: 'Could not load the allergy status.',
    enabled: Boolean(clinicId && patientId),
    requiresOnline: true,
  });
  const followUp = useAsyncResource({
    fetcher: (getToken, signal) => fetchFollowUp(clinicId, patientId, getToken, signal),
    resourceKey: key,
    errorMessage: 'Could not load the follow-up tier.',
    enabled: canSeeTier && Boolean(clinicId && patientId),
    requiresOnline: true,
  });
  const [sexAge, setSexAge] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void db.patients
      .get(patientId)
      .then((patient) => {
        if (live && patient) setSexAge(sexAgeLabel(patient.sex, ageInYears(patient.dob ?? null)));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [patientId]);

  return (
    <PatientContextBar
      anchor={anchor}
      name={name}
      code={code}
      sexAge={sexAge}
      allergies={summary.data?.allergies}
      tier={canSeeTier ? (followUp.data?.current?.tier ?? null) : undefined}
    />
  );
}
