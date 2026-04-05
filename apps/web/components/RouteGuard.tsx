'use client';

import Link from 'next/link';
import { useBootstrap } from '@/lib/bootstrap-context';
import { InlineErrorState, PageSkeleton } from '@/components/feedback/AppState';
import { Button } from '@/components/ui/button';
import { Lock } from 'lucide-react';

function hasPermission(permissions: string[], perm: string): boolean {
  return permissions.includes('*') || permissions.includes(perm);
}

export function RouteGuard({
  children,
  requiredPermission,
}: {
  children: React.ReactNode;
  requiredPermission: string;
}) {
  const { bootstrap, isLoading } = useBootstrap() ?? { bootstrap: null, isLoading: true };
  const perms = bootstrap?.effectivePermissionsForActiveClinic ?? [];
  const isSystemAdmin = bootstrap?.globalRoles?.includes('SYSTEM_ADMIN') ?? false;
  const allowed = isSystemAdmin || hasPermission(perms, requiredPermission);

  if (isLoading && !bootstrap) {
    return (
      <PageSkeleton
        title="Checking your access"
        description="Confirming clinic membership, active permissions, and the safest route into this page."
      />
    );
  }

  if (allowed) {
    return <>{children}</>;
  }

  const memberships = bootstrap?.memberships ?? [];
  const hasMultipleClinics = memberships.length > 1;

  return (
    <div className="space-y-4">
      <InlineErrorState
        title="You don't have access to this page"
        description={
          hasMultipleClinics
            ? 'Try switching clinics in the header. If you still cannot open this page, ask a clinic administrator to review your role assignment.'
            : 'Contact a clinic administrator if you believe you should have access.'
        }
      />
      <div className="flex flex-col items-center justify-center gap-4 p-8 text-center">
        <Lock className="h-8 w-8 text-primary" />
        <Button asChild variant="outline">
          <Link href="/queues">Back to Queues</Link>
        </Button>
      </div>
    </div>
  );
}
