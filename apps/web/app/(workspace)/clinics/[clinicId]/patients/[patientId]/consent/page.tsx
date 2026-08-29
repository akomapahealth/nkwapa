'use client';

import { useParams } from 'next/navigation';
import { RouteGuard } from '@/components/RouteGuard';
import { RecordConsentScreen } from '@/components/patients/RecordConsentScreen';

/**
 * Consent for the clinic named in the URL. The route carries its own clinic, so it does not ask
 * for an active one.
 */
export default function ClinicConsentPage() {
  const params = useParams();
  const clinicId = params.clinicId as string;
  const patientId = params.patientId as string;

  return (
    <RouteGuard requiredPermission="CONSENT.RECORD">
      <RecordConsentScreen clinicId={clinicId} patientId={patientId} />
    </RouteGuard>
  );
}
