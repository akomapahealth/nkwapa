'use client';

import { AuthProvider } from '@/lib/auth-context';
import { BootstrapProvider } from '@/lib/bootstrap-context';
import type { GetToken } from '@/lib/api';
import type { OfflineGrantClaims } from '@nkwapa/db/offline-grant';

export function AuthBootstrapWrapper({
  children,
  getToken,
  offlineGrant,
}: {
  children: React.ReactNode;
  getToken?: GetToken;
  offlineGrant?: OfflineGrantClaims | null;
}) {
  return (
    <AuthProvider getToken={getToken}>
      <BootstrapProvider getToken={getToken} offlineGrant={offlineGrant}>
        {children}
      </BootstrapProvider>
    </AuthProvider>
  );
}
