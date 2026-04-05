'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useBootstrap } from '@/lib/bootstrap-context';
import { useKeycloak } from '@/app/KeycloakProvider';
import { FullscreenStatus } from '@/components/feedback/AppState';
import { LandingPage } from '@/components/landing/LandingPage';

export default function Home() {
  const router = useRouter();
  const { isAuthenticated } = useKeycloak() ?? { isAuthenticated: false };
  const bootstrapCtx = useBootstrap();
  const bootstrap = bootstrapCtx?.bootstrap ?? null;
  const isLoading = bootstrapCtx?.isLoading ?? false;
  const roles = bootstrap?.effectiveRolesForActiveClinic ?? bootstrap?.globalRoles ?? [];
  const isPatientOnly = roles.length === 1 && roles[0] === 'PATIENT';
  const requiresPatientClaim = bootstrap?.onboarding?.state === 'PATIENT_CLAIM_REQUIRED';

  useEffect(() => {
    if (!isAuthenticated || isLoading) return;
    router.replace(
      requiresPatientClaim ? '/claim-record' : isPatientOnly ? '/portal' : '/dashboard',
    );
  }, [isAuthenticated, isLoading, isPatientOnly, requiresPatientClaim, router]);

  if (isAuthenticated) {
    return (
      <FullscreenStatus
        eyebrow="Session active"
        title="Opening your workspace"
        description="We are restoring your clinic context and sending you to the right workspace for your role."
      />
    );
  }

  return <LandingPage />;
}
