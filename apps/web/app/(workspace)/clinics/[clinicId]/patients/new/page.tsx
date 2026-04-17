'use client';

import { useParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { RegisterPatientScreen } from '@/components/patients/RegisterPatientScreen';

export default function ClinicNewPatientPage() {
  const params = useParams();
  const clinicId = params.clinicId as string;
  const getToken = useAuth();

  return (
    <RegisterPatientScreen
      clinicId={clinicId}
      getToken={getToken}
      backHref={`/clinics/${clinicId}/patients`}
      backLabel="Back to Patient Search"
    />
  );
}
