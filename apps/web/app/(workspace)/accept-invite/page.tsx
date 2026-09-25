'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { MailQuestion, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useBootstrap } from '@/lib/bootstrap-context';
import { ApiError, getErrorMessage } from '@/lib/api';
import { AUTH_CONTINUE_PARAM } from '@/lib/auth-routing';
import { describeInviteExpiry } from '@/lib/portal-invite';
import { acceptStaffInvite, formatStaffRole, type PendingStaffInvite } from '@/lib/staff-invite';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, InlineErrorState, SectionSkeleton } from '@/components/feedback/AppState';
import { InlineNotice } from '@/components/ops/OpsShared';

interface AcceptFailure {
  message: string;
  recoveryAction: string | null;
}

function toAcceptFailure(error: unknown): AcceptFailure {
  if (error instanceof ApiError) {
    return { message: error.message, recoveryAction: error.recoveryAction };
  }
  return {
    message: getErrorMessage(error, 'The invitation could not be accepted. Try again.'),
    recoveryAction: null,
  };
}

/*
  Accept a staff invitation.

  No RouteGuard, for the reason /claim-record has none: the person here does not hold the role yet,
  so any permission check would refuse exactly the people the page is for. The API keys every read
  and write on the caller's verified email, and SyncWithAuth decides who is held here.

  Accepting is an explicit click, never automatic on arrival. It grants access to other people's
  records, and the one thing the invitee must do is look at which clinic and which role first.
*/
export default function AcceptInvitePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const getToken = useAuth();
  const bootstrapCtx = useBootstrap();
  const bootstrap = bootstrapCtx?.bootstrap ?? null;
  const isLoading = bootstrapCtx?.isLoading ?? true;
  const bootstrapError = bootstrapCtx?.error ?? null;
  const invites = bootstrap?.pendingStaffInvites ?? [];
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [failure, setFailure] = useState<AcceptFailure | null>(null);
  const [accepted, setAccepted] = useState<string | null>(null);

  const arrivedFromAccountSetup = searchParams.get(AUTH_CONTINUE_PARAM) === '1';

  const accept = async (invite: PendingStaffInvite) => {
    if (!getToken) return;
    setAcceptingId(invite.id);
    setFailure(null);
    try {
      const result = await acceptStaffInvite(invite, getToken);
      setAccepted(
        `You are now ${formatStaffRole(result.role)} at ${result.clinicName}. Opening your workspace…`,
      );
      bootstrapCtx?.setActiveClinicId(result.clinicId);
      await bootstrapCtx?.refetch();
      router.replace('/dashboard');
    } catch (error) {
      setFailure(toAcceptFailure(error));
      // A refusal usually means the invitation changed under us; show the current list.
      void bootstrapCtx?.refetch();
    } finally {
      setAcceptingId(null);
    }
  };

  return (
    <div className="bg-clinical-grid min-h-screen px-4 py-10 md:px-6">
      <a
        href="#main-content"
        className="sr-only focus-visible:not-sr-only focus-visible:absolute focus-visible:left-4 focus-visible:top-4 focus-visible:z-50 focus-visible:rounded-lg focus-visible:bg-background focus-visible:px-4 focus-visible:py-3 focus-visible:text-sm focus-visible:font-medium focus-visible:shadow-sm focus-visible:ring-2 focus-visible:ring-ring"
      >
        Skip to main content
      </a>
      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto flex max-w-3xl flex-col gap-6 focus-visible:outline-none"
      >
        <Card className="rounded-xl border-border bg-card shadow-sm">
          <CardHeader className="space-y-3 px-6 pt-8 md:px-10">
            <p className="text-eyebrow text-primary">Staff invitation</p>
            <CardTitle className="font-heading text-3xl font-semibold tracking-tight md:text-4xl">
              Join your clinic team
            </CardTitle>
            <CardDescription className="max-w-2xl text-sm leading-6 md:text-base">
              {arrivedFromAccountSetup
                ? 'Your account is ready. One last step: check the clinic and role below, and accept.'
                : 'Check the clinic and role below before you accept. You get access to that clinic’s records in line with the role, and nothing before you accept.'}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-5 px-6 pb-8 md:px-10">
            {arrivedFromAccountSetup && !accepted ? (
              <InlineNotice tone="success">
                <span className="font-medium">Password saved.</span> You are signed in.
              </InlineNotice>
            ) : null}
            {accepted ? <InlineNotice tone="success">{accepted}</InlineNotice> : null}
            {failure ? (
              <InlineNotice tone="error">
                <span className="font-medium">{failure.message}</span>
                {failure.recoveryAction ? ` ${failure.recoveryAction}` : null}
              </InlineNotice>
            ) : null}

            {/* Loading first, so someone with an invitation is never told they have none. */}
            {isLoading ? (
              <div role="status" aria-live="polite" aria-busy="true">
                <span className="sr-only">Looking for your invitation</span>
                <SectionSkeleton lines={3} />
              </div>
            ) : bootstrapError ? (
              <InlineErrorState
                title="We couldn't check for your invitation"
                description={bootstrapError}
                onRetry={() => bootstrapCtx?.retry()}
                retryLabel="Check again"
              />
            ) : invites.length === 0 && !accepted ? (
              /*
                Matching is on the address Keycloak has confirmed, so the commonest reason to land
                here empty is an unfinished email verification, not a missing invitation.
              */
              <EmptyState
                icon={MailQuestion}
                title="No open invitation found"
                description="If you have just set up your account, check your inbox for a message asking you to confirm your email address; your invitation appears once that is done. Invitations also lapse after a few days. If yours has, ask the person who invited you to send a new one."
                action={
                  <Button variant="outline" onClick={() => void bootstrapCtx?.refetch()}>
                    Check again
                  </Button>
                }
              />
            ) : (
              <ul className="space-y-3" aria-label="Your invitations">
                {invites.map((invite) => {
                  const expiry = describeInviteExpiry(invite.expiresAt);
                  return (
                    <li
                      key={invite.id}
                      className="rounded-lg border border-border/70 bg-background p-5"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-lg font-semibold text-foreground">{invite.clinicName}</p>
                        <Badge variant="secondary" className="rounded-full">
                          {formatStaffRole(invite.role)}
                        </Badge>
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {invite.invitedBy ? `Invited by ${invite.invitedBy}. ` : ''}
                        {expiry.label}.
                      </p>
                      <div className="mt-4">
                        <Button
                          onClick={() => void accept(invite)}
                          disabled={acceptingId !== null || accepted !== null}
                        >
                          <ShieldCheck className="mr-2 h-4 w-4" aria-hidden="true" />
                          {acceptingId === invite.id
                            ? 'Accepting…'
                            : `Accept ${formatStaffRole(invite.role)} at ${invite.clinicName}`}
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            <p className="text-xs leading-5 text-muted-foreground">
              Not expecting this? Do nothing. The invitation lapses on its own, and nothing changes
              unless it is accepted.
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
