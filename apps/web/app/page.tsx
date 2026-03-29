"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useBootstrap } from "@/lib/bootstrap-context";
import { useKeycloak } from "@/app/KeycloakProvider";
import { LandingPage } from "@/components/landing/LandingPage";

export default function Home() {
  const router = useRouter();
  const { isAuthenticated } = useKeycloak() ?? { isAuthenticated: false };
  const bootstrapCtx = useBootstrap();
  const bootstrap = bootstrapCtx?.bootstrap ?? null;
  const isLoading = bootstrapCtx?.isLoading ?? false;
  const roles = bootstrap?.effectiveRolesForActiveClinic ?? bootstrap?.globalRoles ?? [];
  const isPatientOnly =
    roles.length === 1 && roles[0] === "PATIENT";

  useEffect(() => {
    if (!isAuthenticated || isLoading) return;
    router.replace(isPatientOnly ? "/portal" : "/dashboard");
  }, [isAuthenticated, isLoading, isPatientOnly, router]);

  if (isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Redirecting to dashboard…</p>
      </div>
    );
  }

  return <LandingPage />;
}
