"use client";

import Link from "next/link";
import { useBootstrap } from "@/lib/bootstrap-context";
import { Button } from "@/components/ui/button";

function hasPermission(permissions: string[], perm: string): boolean {
  return permissions.includes("*") || permissions.includes(perm);
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
  const allowed = hasPermission(perms, requiredPermission);

  if (isLoading) {
    return <div className="flex items-center justify-center p-8">Loading…</div>;
  }

  if (allowed) {
    return <>{children}</>;
  }

  const memberships = bootstrap?.memberships ?? [];
  const hasMultipleClinics = memberships.length > 1;

  return (
    <div className="flex flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-xl font-semibold">No access</h1>
      <p className="text-muted-foreground max-w-md">
        You don&apos;t have permission to view this page. Contact your clinic
        administrator if you believe this is an error.
      </p>
      {hasMultipleClinics && (
        <p className="text-muted-foreground max-w-md text-sm">
          If you have access in another clinic, try switching clinics in the
          header dropdown.
        </p>
      )}
      <Button asChild variant="outline">
        <Link href="/queues">Back to Queues</Link>
      </Button>
    </div>
  );
}
