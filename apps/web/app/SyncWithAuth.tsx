"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useBootstrap } from "@/lib/bootstrap-context";
import { useKeycloak } from "@/app/KeycloakProvider";
import { AppLayout } from "@/components/AppLayout";
import { PortalLayout } from "@/components/PortalLayout";
import { Button } from "@/components/ui/button";
import { ServiceWorkerAndSyncProvider } from "./ServiceWorkerAndSyncProvider";

export function SyncWithAuth({ children }: { children: React.ReactNode }) {
  const getToken = useAuth();
  const bootstrapCtx = useBootstrap();
  const { isAuthenticated, logout } = useKeycloak() ?? {
    isAuthenticated: false,
    logout: () => undefined,
  };
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated && pathname !== "/") {
      router.replace("/");
    }
  }, [isAuthenticated, pathname, router]);

  if (!isAuthenticated) {
    if (pathname !== "/") {
      return (
        <div className="flex min-h-screen items-center justify-center">
          <p className="text-muted-foreground">Redirecting…</p>
        </div>
      );
    }
    return <>{children}</>;
  }

  const isPortal = pathname?.startsWith("/portal");
  const isDisabledAccount = bootstrapCtx?.errorCode === "USER_DISABLED";

  return (
    <ServiceWorkerAndSyncProvider getAccessToken={getToken}>
      {isDisabledAccount ? (
        <div className="flex min-h-screen items-center justify-center bg-clinical-grid p-6">
          <div className="w-full max-w-lg rounded-[28px] border border-destructive/20 bg-card/95 p-8 shadow-2xl shadow-black/5">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-destructive/80">
              Account Status
            </p>
            <h1 className="mt-3 font-heading text-3xl font-semibold tracking-tight text-foreground">
              Access has been disabled
            </h1>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              This account has been deactivated by an administrator. Clinical and
              portal access are blocked until the clinic restores the account.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Button onClick={logout}>Sign out</Button>
              <Button variant="outline" onClick={() => window.location.reload()}>
                Check again
              </Button>
            </div>
          </div>
        </div>
      ) : isPortal ? (
        <PortalLayout>{children}</PortalLayout>
      ) : (
        <AppLayout>{children}</AppLayout>
      )}
    </ServiceWorkerAndSyncProvider>
  );
}
