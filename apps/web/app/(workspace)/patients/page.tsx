'use client';

import { useBootstrap } from '@/lib/bootstrap-context';
import { RouteGuard } from '@/components/RouteGuard';
import { PatientRegistryScreen } from '@/components/patients/PatientRegistryScreen';

/**
 * The registry for whichever clinic is currently active. `/clinics/:clinicId/patients` is the
 * same screen for a clinic named in the URL; both render `PatientRegistryScreen`.
 */
export default function PatientsPage() {
  const clinicId = useBootstrap()?.activeClinicId ?? null;

  return (
    <RouteGuard
      requiredPermission="PATIENT.SEARCH"
      requiresClinic
      clinicSurface="The patient registry"
    >
      {/* The guard has already refused this render when no clinic is active; the check only
          states that guarantee in a way the type system can see. */}
      {clinicId ? <PatientRegistryScreen clinicId={clinicId} /> : null}
    </RouteGuard>
  );
}
