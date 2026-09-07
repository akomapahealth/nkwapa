'use client';

import Link from 'next/link';
import { useBootstrap } from '@/lib/bootstrap-context';
import { RouteGuard } from '@/components/RouteGuard';
import { Button } from '@/components/ui/button';
import { NoAccessState } from '@/components/feedback/AppState';
import { ClinicRegistryScreen } from '@/components/admin/ClinicRegistryScreen';

export default function AdminClinicsPage() {
  const bootstrap = useBootstrap()?.bootstrap ?? null;
  const isSystemAdmin = bootstrap?.globalRoles?.includes('SYSTEM_ADMIN') ?? false;
  const canAccessClinicsAdmin =
    isSystemAdmin ||
    (bootstrap?.memberships ?? []).some((membership) => membership.roles.includes('DIRECTOR'));

  /*
    A second denial UI used to live here: a centred card with its own <h1>No access</h1>, rendered
    inside RouteGuard, which already had a denial state of its own. Two components said the same
    thing in two different shapes, and only one of them told the user what to do next.

    The check itself stays -- CLINIC.MANAGE is held by Managers, and clinic administration is
    Director and System Admin only, so this is a genuine second gate rather than a duplicate of
    the permission above it.
  */
  if (!canAccessClinicsAdmin) {
    return (
      <RouteGuard requiredPermission="CLINIC.MANAGE">
        <NoAccessState
          title="You don't have access to clinic administration"
          description="Creating and deactivating clinics is limited to Directors and System Admins. Staff and role changes are available to you under Staff."
          action={
            <Button asChild variant="outline">
              <Link href="/admin/users">Go to Staff</Link>
            </Button>
          }
        />
      </RouteGuard>
    );
  }

  return (
    <RouteGuard requiredPermission="CLINIC.MANAGE">
      <ClinicRegistryScreen />
    </RouteGuard>
  );
}
