'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useBootstrap } from '@/lib/bootstrap-context';
import { getPostAuthPath, getSafeNextPath } from '@/lib/auth-routing';
import { useKeycloak } from '@/app/KeycloakProvider';
import { FullscreenStatus, PageSkeleton } from '@/components/feedback/AppState';
import { Button } from '@/components/ui/button';

export default function LoginPage() {
  const searchParams = useSearchParams();
  const bootstrapCtx = useBootstrap();
  const bootstrap = bootstrapCtx?.bootstrap ?? null;
  const isBootstrapLoading = bootstrapCtx?.isLoading ?? false;
  const { isAuthenticated, login, error } = useKeycloak() ?? {
    isAuthenticated: false,
    login: () => undefined,
    error: null as string | null,
  };

  const nextPath = getSafeNextPath(searchParams.get('next'));

  useEffect(() => {
    if (!isAuthenticated || isBootstrapLoading) {
      return;
    }

    const destination = getPostAuthPath(bootstrap, nextPath);
    if (typeof window !== 'undefined' && window.location.pathname !== destination) {
      window.location.replace(destination);
    }
  }, [bootstrap, isAuthenticated, isBootstrapLoading, nextPath]);

  if (isAuthenticated) {
    return (
      <PageSkeleton
        title="Opening your workspace"
        description="Your session is active. We are selecting the right clinic context and opening your workspace."
        steps={['Session restored', 'Clinic selected', 'Dashboard loading']}
        className="min-h-screen"
      />
    );
  }

  return (
    <FullscreenStatus
      eyebrow="Secure sign in"
      title={error ? "We couldn't reach secure sign in" : 'Sign in to continue'}
      description={
        error
          ? `${error} Reload this page or try secure sign in again.`
          : nextPath
            ? 'Use secure sign in to continue where you left off in the app.'
            : 'Use secure sign in to open your Nkwapa workspace.'
      }
      primaryAction={
        <Button onClick={login} className="rounded-2xl">
          {error ? 'Try secure sign in again' : 'Continue to secure sign in'}
        </Button>
      }
      secondaryAction={
        <Button asChild variant="outline" className="rounded-2xl">
          <Link href="/">Back to home</Link>
        </Button>
      }
    />
  );
}
