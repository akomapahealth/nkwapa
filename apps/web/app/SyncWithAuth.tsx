'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useBootstrap } from '@/lib/bootstrap-context';
import { useKeycloak } from '@/app/KeycloakProvider';
import { AppLayout } from '@/components/AppLayout';
import { FullscreenStatus } from '@/components/feedback/AppState';
import { PortalLayout } from '@/components/PortalLayout';
import { Button } from '@/components/ui/button';
import { ServiceWorkerAndSyncProvider } from './ServiceWorkerAndSyncProvider';

export function SyncWithAuth({ children }: { children: React.ReactNode }) {
  const getToken = useAuth();
  const bootstrapCtx = useBootstrap();
  const { isAuthenticated, logout } = useKeycloak() ?? {
    isAuthenticated: false,
    logout: () => undefined,
  };
  const pathname = usePathname();
  const router = useRouter();
  const bootstrap = bootstrapCtx?.bootstrap ?? null;

  useEffect(() => {
    if (!isAuthenticated && pathname !== '/') {
      router.replace('/');
    }
  }, [isAuthenticated, pathname, router]);

  const requiresPatientClaim = bootstrap?.onboarding?.state === 'PATIENT_CLAIM_REQUIRED';

  useEffect(() => {
    if (!isAuthenticated || bootstrapCtx?.isLoading) {
      return;
    }

    if (requiresPatientClaim && pathname !== '/claim-record') {
      router.replace('/claim-record');
      return;
    }

    if (!requiresPatientClaim && pathname === '/claim-record') {
      const roles = bootstrap?.effectiveRolesForActiveClinic ?? bootstrap?.globalRoles ?? [];
      const isPatientOnly = roles.length === 1 && roles[0] === 'PATIENT';
      router.replace(isPatientOnly ? '/portal' : '/dashboard');
    }
  }, [bootstrap, bootstrapCtx?.isLoading, isAuthenticated, pathname, requiresPatientClaim, router]);

  if (!isAuthenticated) {
    if (pathname !== '/') {
      return (
        <FullscreenStatus
          eyebrow="Session check"
          title="Returning to sign in"
          description="Your secure session is no longer active, so we are sending you back to the landing page before anything sensitive loads."
        />
      );
    }
    return <>{children}</>;
  }

  const isPortal = pathname?.startsWith('/portal');
  const isClaimRoute = pathname === '/claim-record';
  const isDisabledAccount = bootstrapCtx?.errorCode === 'USER_DISABLED';

  return (
    <ServiceWorkerAndSyncProvider getAccessToken={getToken}>
      {isDisabledAccount ? (
        <FullscreenStatus
          eyebrow="Account status"
          title="Access has been disabled"
          description="This account has been deactivated by an administrator. Clinical and portal access stay blocked until the clinic restores the account."
          tone="danger"
          primaryAction={<Button onClick={logout}>Sign out</Button>}
          secondaryAction={
            <Button variant="outline" onClick={() => window.location.reload()}>
              Check again
            </Button>
          }
        />
      ) : isClaimRoute ? (
        <>{children}</>
      ) : isPortal ? (
        <PortalLayout>{children}</PortalLayout>
      ) : (
        <AppLayout>{children}</AppLayout>
      )}
    </ServiceWorkerAndSyncProvider>
  );
}
