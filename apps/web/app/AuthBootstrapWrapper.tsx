"use client";

import { AuthProvider } from "@/lib/auth-context";
import { BootstrapProvider } from "@/lib/bootstrap-context";
import type { GetToken } from "@/lib/api";

export function AuthBootstrapWrapper({
  children,
  getToken,
}: {
  children: React.ReactNode;
  getToken?: GetToken;
}) {
  return (
    <AuthProvider getToken={getToken}>
      <BootstrapProvider getToken={getToken}>
        {children}
      </BootstrapProvider>
    </AuthProvider>
  );
}
