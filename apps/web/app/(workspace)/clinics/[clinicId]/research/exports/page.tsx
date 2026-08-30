'use client';

import { useParams } from 'next/navigation';
import { RouteGuard } from '@/components/RouteGuard';
import { ResearchExportsScreen } from '@/components/research/ResearchExportsScreen';

export default function ResearchExportsPage() {
  const params = useParams();
  const clinicId = params.clinicId as string;

  // No requiresClinic: the clinic is in the URL, not in the active-clinic context.
  return (
    <RouteGuard requiredPermission="RESEARCH.EXPORT.REQUEST">
      <ResearchExportsScreen clinicId={clinicId} />
    </RouteGuard>
  );
}
