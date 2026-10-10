'use client';

import { useBootstrap } from '@/lib/bootstrap-context';
import { useAuth } from '@/lib/auth-context';
import { RouteGuard } from '@/components/RouteGuard';
import { RegisterPatientScreen } from '@/components/patients/RegisterPatientScreen';

export default function NewPatientPage() {
  const getToken = useAuth();
  const clinicId = useBootstrap()?.activeClinicId ?? null;

  return (
    // The guard used to wrap only the no-clinic branch, so the branch that actually renders the
    // form was reached without any permission check at all.
    <RouteGuard
      requiredPermission="PATIENT.CREATE"
      requiresClinic
      clinicSurface="Patient registration"
    >
      {clinicId ? <RegisterPatientScreen clinicId={clinicId} getToken={getToken} /> : null}
    </RouteGuard>
  );
}
