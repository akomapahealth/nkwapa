'use client';

import { useBootstrap } from '@/lib/bootstrap-context';
import { getBootstrapActiveClinicId } from '@/lib/bootstrap-clinics';
import { RouteGuard } from '@/components/RouteGuard';
import { ResearchExportsScreen } from '@/components/research/ResearchExportsScreen';

/** The active clinic's research exports, reached from the nav and from clinic settings. */
export default function ResearchPage() {
  const clinicId = getBootstrapActiveClinicId(useBootstrap()?.bootstrap ?? null);

  return (
    <RouteGuard
      requiredPermission="RESEARCH.EXPORT.REQUEST"
      requiresClinic
      clinicSurface="Research exports"
    >
      {clinicId ? <ResearchExportsScreen clinicId={clinicId} /> : null}
    </RouteGuard>
  );
}
