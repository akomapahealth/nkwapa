'use client';

import { useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import {
  STAFF_INVITE_ACCEPT_PATH,
  buildLoginHref,
  getDefaultWorkspacePath,
  getOnboardingPath,
} from '@/lib/auth-routing';
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
  const searchParams = useSearchParams();
  const bootstrap = bootstrapCtx?.bootstrap ?? null;
  const search = searchParams.toString();
  const currentPath = pathname ? `${pathname}${search ? `?${search}` : ''}` : null;
  const isLoginRoute = pathname === '/login';

  useEffect(() => {
    if (!isAuthenticated && !isLoginRoute) {
      router.replace(buildLoginHref(currentPath));
    }
  }, [currentPath, isAuthenticated, isLoginRoute, router]);

  const onboardingPath = getOnboardingPath(bootstrap);
  const hasStaffInvites = (bootstrap?.pendingStaffInvites?.length ?? 0) > 0;

  useEffect(() => {
    if (!isAuthenticated || bootstrapCtx?.isLoading || isLoginRoute) {
      return;
    }

    // An account with nothing else it can do is held on the page that moves it forward.
    if (onboardingPath && pathname !== onboardingPath) {
      router.replace(onboardingPath);
      return;
    }

    if (!onboardingPath && pathname === '/claim-record') {
      router.replace(getDefaultWorkspacePath(bootstrap));
      return;
    }

    /*
      Someone who already works in a clinic may open the acceptance page while an invitation is
      waiting; it is offered, not imposed. With nothing to accept there is nothing to show.
    */
    if (!onboardingPath && pathname === STAFF_INVITE_ACCEPT_PATH && !hasStaffInvites) {
      router.replace(getDefaultWorkspacePath(bootstrap));
    }
  }, [
    bootstrap,
    bootstrapCtx?.isLoading,
    hasStaffInvites,
    isAuthenticated,
    isLoginRoute,
    onboardingPath,
    pathname,
    router,
  ]);

  if (!isAuthenticated) {
    if (!isLoginRoute) {
      return (
        <FullscreenStatus
          eyebrow="Session check"
          title="Secure sign in required"
          description="Your session is no longer active, so we are sending you to secure sign in before anything sensitive loads."
        />
      );
    }
    return <>{children}</>;
  }

  const isPortal = pathname?.startsWith('/portal');
  // Both onboarding pages stand alone, without workspace navigation the account cannot use yet.
  const isOnboardingRoute = pathname === '/claim-record' || pathname === STAFF_INVITE_ACCEPT_PATH;
  const isDisabledAccount = bootstrapCtx?.errorCode === 'USER_DISABLED';

  if (isLoginRoute) {
    return <>{children}</>;
  }

  return (
    <ServiceWorkerAndSyncProvider
      getAccessToken={getToken}
      activeClinicId={bootstrapCtx?.activeClinicId}
    >
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
      ) : isOnboardingRoute ? (
        <>{children}</>
      ) : isPortal ? (
        <PortalLayout>{children}</PortalLayout>
      ) : (
        <AppLayout>{children}</AppLayout>
      )}
    </ServiceWorkerAndSyncProvider>
  );
}
