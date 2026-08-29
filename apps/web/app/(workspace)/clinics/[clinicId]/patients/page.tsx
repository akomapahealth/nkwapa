'use client';

import { useParams } from 'next/navigation';
import { RouteGuard } from '@/components/RouteGuard';
import { PatientRegistryScreen } from '@/components/patients/PatientRegistryScreen';

/**
 * The registry for the clinic named in the URL. No `requiresClinic`: the route carries its own
 * clinic, so an unset active clinic is not a reason to refuse it.
 */
export default function ClinicPatientsPage() {
  const params = useParams();
  const clinicId = params.clinicId as string;

  return (
    <RouteGuard requiredPermission="PATIENT.SEARCH">
      <PatientRegistryScreen clinicId={clinicId} />
    </RouteGuard>
  );
}
