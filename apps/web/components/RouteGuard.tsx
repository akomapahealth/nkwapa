'use client';

import Link from 'next/link';
import { useBootstrap } from '@/lib/bootstrap-context';
import { resolveRouteAccess } from '@/lib/route-access';
import { InlineErrorState, PageSkeleton } from '@/components/feedback/AppState';
import { Button } from '@/components/ui/button';
import { Lock } from 'lucide-react';

export function RouteGuard({
  children,
  requiredPermission,
}: {
  children: React.ReactNode;
  requiredPermission: string;
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

  if (state === 'allowed') {
    return <>{children}</>;
  }

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
            <Button asChild variant="outline" className="rounded-2xl">
              <Link href="/login">Go to secure sign in</Link>
            </Button>
          </div>
        ) : null}
      </div>
    );
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
        <div className="flex flex-wrap items-center justify-center gap-2">
          {/* If an administrator has just changed this user's role, re-reading identity is
              enough; they should not have to hard-refresh to pick it up. */}
          {ctx?.retry ? (
            <Button variant="outline" className="rounded-2xl" onClick={ctx.retry}>
              Check again
            </Button>
          ) : null}
          <Button asChild variant="outline" className="rounded-2xl">
            <Link href="/queues">Back to Queues</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
