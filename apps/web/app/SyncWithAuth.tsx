"use client";

import { useAuth } from "@/lib/auth-context";
import { AppLayout } from "@/components/AppLayout";
import { ServiceWorkerAndSyncProvider } from "./ServiceWorkerAndSyncProvider";

export function SyncWithAuth({ children }: { children: React.ReactNode }) {
  const getToken = useAuth();
  return (
    <ServiceWorkerAndSyncProvider getAccessToken={getToken}>
      <AppLayout>{children}</AppLayout>
    </ServiceWorkerAndSyncProvider>
  );
}
