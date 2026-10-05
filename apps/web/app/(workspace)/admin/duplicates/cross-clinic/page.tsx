'use client';

import Link from 'next/link';
import { useBootstrap } from '@/lib/bootstrap-context';
import { RouteGuard } from '@/components/RouteGuard';
import { Button } from '@/components/ui/button';
import { NoAccessState } from '@/components/feedback/AppState';
import { CrossClinicInvestigationScreen } from '@/components/admin/CrossClinicInvestigationScreen';

/**
 * The cross-clinic duplicate investigation.
 *
 * Two gates, both needed. `RouteGuard` turns away anyone without duplicate review at all, and the
 * system-admin check turns away the directors and managers who do hold it -- at their own clinic,
 * which is not what this page shows. The API refuses them independently; this check is so they
 * meet an explanation and a way back rather than a failed request.
 */
export default function CrossClinicDuplicatesPage() {
  const bootstrap = useBootstrap()?.bootstrap ?? null;
  const isSystemAdmin = bootstrap?.globalRoles?.includes('SYSTEM_ADMIN') ?? false;

  return (
    <RouteGuard requiredPermission="PATIENT.DUPLICATE.REVIEW">
      {isSystemAdmin ? (
        <CrossClinicInvestigationScreen />
      ) : (
        <NoAccessState
          title="You don't have access to the cross-clinic investigation"
          description="Comparing patient charts across clinics is limited to System Admins while the policy for consolidating them is decided. Your own clinic's suspected duplicates are in Duplicate review."
          action={
            <Button asChild variant="outline">
              <Link href="/admin/duplicates">Go to Duplicate review</Link>
            </Button>
          }
        />
      )}
    </RouteGuard>
  );
}
