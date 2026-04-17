'use client';

import { useBootstrap } from '@/lib/bootstrap-context';
import { useAuth } from '@/lib/auth-context';
import { RouteGuard } from '@/components/RouteGuard';
import { RegisterPatientScreen } from '@/components/patients/RegisterPatientScreen';

export default function NewPatientPage() {
  const bootstrapContext = useBootstrap();
  const bootstrap = bootstrapContext?.bootstrap ?? null;
  const getToken = useAuth();
  const clinicId =
    bootstrapContext?.activeClinicId ??
    bootstrap?.activeClinicId ??
    bootstrap?.memberships?.[0]?.clinicId ??
    null;

  if (!clinicId) {
    return (
      <RouteGuard requiredPermission="PATIENT.CREATE">
        <div className="p-4">
          <p className="text-muted-foreground">Select a clinic to create a patient.</p>
        </div>
      </RouteGuard>
    );
  }

  return (
    <RegisterPatientScreen
      clinicId={clinicId}
      getToken={getToken}
      backHref={`/clinics/${clinicId}/patients`}
      backLabel="Back to Patients"
    />
  );
}
