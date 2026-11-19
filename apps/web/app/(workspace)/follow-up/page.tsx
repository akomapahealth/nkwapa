'use client';

import { RouteGuard } from '@/components/RouteGuard';
import { FollowUpWorklist } from '@/components/follow-up/FollowUpWorklist';
import { getBootstrapActiveClinicId } from '@/lib/bootstrap-clinics';
import { useBootstrap } from '@/lib/bootstrap-context';
import { FOLLOW_UP_MANAGE } from '@/lib/follow-up';

export default function FollowUpPage() {
  const bootstrap = useBootstrap()?.bootstrap ?? null;
  const clinicId = getBootstrapActiveClinicId(bootstrap);
  return (
    <RouteGuard requiredPermission={FOLLOW_UP_MANAGE} requiresClinic clinicSurface="Follow-up">
      {clinicId ? <FollowUpWorklist key={clinicId} clinicId={clinicId} /> : null}
    </RouteGuard>
  );
}
