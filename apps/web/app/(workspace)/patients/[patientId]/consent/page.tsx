'use client';

import { useParams } from 'next/navigation';
import { useBootstrap } from '@/lib/bootstrap-context';
import { RouteGuard } from '@/components/RouteGuard';
import { RecordConsentScreen } from '@/components/patients/RecordConsentScreen';

/**
 * Consent for a patient in the active clinic. `/clinics/:clinicId/patients/:patientId/consent` is
 * the same screen for a clinic named in the URL; both render `RecordConsentScreen`.
 */
export default function ConsentPage() {
  const params = useParams();
  const patientId = params.patientId as string;
  const clinicId = useBootstrap()?.activeClinicId ?? null;

  return (
    <RouteGuard
      requiredPermission="CONSENT.RECORD"
      requiresClinic
      clinicSurface="Recording research consent"
    >
      {clinicId ? <RecordConsentScreen clinicId={clinicId} patientId={patientId} /> : null}
    </RouteGuard>
  );
}
