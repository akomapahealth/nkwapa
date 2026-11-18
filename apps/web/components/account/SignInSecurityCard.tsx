'use client';

import { useEffect, useState } from 'react';
import { Fingerprint, KeyRound } from 'lucide-react';
import { useSync } from '@/app/ServiceWorkerAndSyncProvider';
import { useKeycloak } from '@/app/KeycloakProvider';
import { Button } from '@/components/ui/button';
import {
  RecordSection,
  RecordSectionContent,
  RecordSectionDescription,
  RecordSectionHeader,
  RecordSectionTitle,
} from '@/components/patients/RecordSection';
import {
  clearSignInSetupResult,
  peekSignInSetupResult,
  startSignInSetup,
  type SignInSetupResult,
} from '@/lib/keycloak';

function resultMessage(result: SignInSetupResult): string {
  const passkey = result.action === 'webauthn-register';
  if (result.status === 'success') {
    return passkey
      ? 'Passkey added. Nkwapa will ask for it when you sign in.'
      : 'Authenticator app set up. Nkwapa will ask for a code from it when you sign in.';
  }
  if (result.status === 'cancelled') return 'Setup was cancelled. Nothing changed.';
  return 'Setup did not finish. Nothing changed; try again.';
}

/**
 * A second sign-in step, set up without leaving Nkwapa for Keycloak's account pages: each button
 * opens Keycloak's setup page and comes back here. Administrators are required to have one; for
 * everyone else it is a choice.
 */
export function SignInSecurityCard() {
  const { isOnline } = useSync();
  const offlineSession = useKeycloak()?.authMode === 'offline-session';
  const canReachSignIn = isOnline && !offlineSession;
  const [result] = useState(peekSignInSetupResult);
  const [passkeySupported, setPasskeySupported] = useState(false);

  // Shown once: leaving Settings and coming back should not repeat it.
  useEffect(() => clearSignInSetupResult, []);
  useEffect(() => {
    setPasskeySupported(typeof window.PublicKeyCredential !== 'undefined');
  }, []);

  return (
    <RecordSection>
      <RecordSectionHeader>
        <RecordSectionTitle className="text-lg">Sign-in security</RecordSectionTitle>
        <RecordSectionDescription>
          Add a second step when you sign in: a code from an authenticator app, or a passkey. To
          remove one, ask an administrator.
        </RecordSectionDescription>
      </RecordSectionHeader>
      <RecordSectionContent className="space-y-3">
        {result ? (
          <p role="status" className="text-sm">
            {resultMessage(result)}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={!canReachSignIn}
            onClick={() => startSignInSetup('CONFIGURE_TOTP')}
          >
            <KeyRound className="mr-2 h-4 w-4" aria-hidden="true" />
            Set up authenticator app
          </Button>
          {passkeySupported ? (
            <Button
              type="button"
              variant="outline"
              disabled={!canReachSignIn}
              onClick={() => startSignInSetup('webauthn-register')}
            >
              <Fingerprint className="mr-2 h-4 w-4" aria-hidden="true" />
              Add a passkey
            </Button>
          ) : null}
        </div>
        {canReachSignIn ? null : (
          <p className="text-sm text-muted-foreground">Needs a connection.</p>
        )}
      </RecordSectionContent>
    </RecordSection>
  );
}
