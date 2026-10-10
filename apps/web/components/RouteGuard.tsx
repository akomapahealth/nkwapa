'use client';

import Link from 'next/link';
import { useBootstrap } from '@/lib/bootstrap-context';
import { resolveRouteAccess } from '@/lib/route-access';
import {
  InlineErrorState,
  NoAccessState,
  PageSkeleton,
  SelectClinicState,
} from '@/components/feedback/AppState';
import { Button } from '@/components/ui/button';

export function RouteGuard({
  children,
  requiredPermission,
  requiresClinic = false,
  clinicSurface,
}: {
  children: React.ReactNode;
  requiredPermission: string;
  /**
   * The route cannot render anything meaningful without an active clinic.
   *
   * Ten routes used to answer this themselves with a bare paragraph, in ten different wordings,
   * after their own guard had already passed. Answering it here means the sequence is always the
   * same: are you still loading, may you be here at all, and only then, which clinic.
   */
  requiresClinic?: boolean;
  /** Plain-language name of the surface, e.g. "The Today Board". Required when requiresClinic. */
  clinicSurface?: string;
}) {
  const ctx = useBootstrap();
  const bootstrap = ctx?.bootstrap ?? null;
  const state = resolveRouteAccess({
    bootstrap,
    isLoading: ctx?.isLoading ?? true,
    error: ctx?.error ?? null,
    errorStatus: ctx?.errorStatus ?? null,
    requiredPermission,
  });

  if (state === 'resolving') {
    return (
      <PageSkeleton
        title="Checking your access"
        description="Confirming clinic membership, active permissions, and the safest route into this page."
      />
    );
  }

  // Identity could not be loaded. This is not a permission decision, so it must not read
  // like one: say what actually happened and offer a way forward.
  if (state === 'unavailable' || state === 'session-expired') {
    const isSessionIssue = state === 'session-expired';
    return (
      <div className="space-y-4">
        <InlineErrorState
          title={
            isSessionIssue ? 'Your session needs to be renewed' : "We couldn't confirm your access"
          }
          description={
            isSessionIssue
              ? 'Sign in again to reload your clinic membership and permissions.'
              : (ctx?.error ??
                'Your permissions could not be loaded. This is usually a connection problem rather than a change to your access.')
          }
          onRetry={isSessionIssue ? undefined : ctx?.retry}
          retryLabel="Try again"
        />
        {isSessionIssue ? (
          <div className="flex justify-center">
            <Button asChild variant="outline">
              <Link href="/login">Go to secure sign in</Link>
            </Button>
          </div>
        ) : null}
      </div>
    );
  }

  if (state === 'denied') {
    const memberships = bootstrap?.memberships ?? [];
    const hasMultipleClinics = memberships.length > 1;

    return (
      <NoAccessState
        title="You don't have access to this page"
        description={
          hasMultipleClinics
            ? 'Try switching clinics in the header. If you still cannot open this page, ask a clinic administrator to review your role assignment.'
            : 'Contact a clinic administrator if you believe you should have access.'
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
            {/* Deliberately "Check again", not "Try again". Nothing failed here, so offering the
                retry label would teach staff to hammer a wall they cannot pass. It exists only
                because an administrator may have just changed this user's role, and re-reading
                identity should be enough to pick that up without a hard refresh. */}
            {ctx?.retry ? (
              <Button variant="outline" onClick={ctx.retry}>
                Check again
              </Button>
            ) : null}
            <Button asChild variant="outline">
              <Link href="/queues">Back to Queues</Link>
            </Button>
          </div>
        }
      />
    );
  }

  // Allowed, but the route is clinic-scoped and no clinic is active.
  if (requiresClinic && !(ctx?.activeClinicId ?? null)) {
    return <SelectClinicState surface={clinicSurface ?? 'This page'} />;
  }

  return <>{children}</>;
}
