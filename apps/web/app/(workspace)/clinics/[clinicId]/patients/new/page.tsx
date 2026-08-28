'use client';

import { useParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { RouteGuard } from '@/components/RouteGuard';
import { RegisterPatientScreen } from '@/components/patients/RegisterPatientScreen';

export default function ClinicNewPatientPage() {
  const params = useParams();
  const clinicId = params.clinicId as string;
  const getToken = useAuth();

  return (
    <RouteGuard requiredPermission="PATIENT.CREATE">
      <RegisterPatientScreen clinicId={clinicId} getToken={getToken} />
    </RouteGuard>
  );
}
