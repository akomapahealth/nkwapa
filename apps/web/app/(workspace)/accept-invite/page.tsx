'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useBootstrap } from '@/lib/bootstrap-context';
import { ApiError, getErrorMessage } from '@/lib/api';
import { AUTH_CONTINUE_PARAM } from '@/lib/auth-routing';
import { describeInviteExpiry } from '@/lib/portal-invite';
import { acceptStaffInvite, formatStaffRole, type PendingStaffInvite } from '@/lib/staff-invite';
import { Button } from '@/components/ui/button';
import { InlineErrorState, SectionSkeleton } from '@/components/feedback/AppState';
import { InvitationNotFound, OnboardingFrame } from '@/components/onboarding/OnboardingFrame';
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
      // Also re-fetches whoami, so the new role is in hand before the dashboard opens.
      await bootstrapCtx?.setActiveClinicId(result.clinicId);
      router.replace('/dashboard');
    } catch (error) {
      setFailure(toAcceptFailure(error));
      // A refusal usually means the invitation changed under us; show the current list.
      void bootstrapCtx?.refetch();
    } finally {
      setAcceptingId(null);
    }
  };

  // `needsName` is only raised once the account holds a staff role, so before accepting it says
  // false for someone who will be asked next. Whether a name is on file is what decides it.
  const needsName = !(bootstrap?.profile?.firstName && bootstrap?.profile?.lastName);

  return (
    <OnboardingFrame
      journey="staff"
      current={accepted ? 'name' : 'accept'}
      needsName={needsName}
      title="Join your clinic team"
      lede={
        arrivedFromAccountSetup
          ? 'Your account is ready. Check the clinic and role below, then accept.'
          : 'Check the clinic and role below before you accept. You get access to that clinic’s records in line with the role, and nothing before you accept.'
      }
    >
      {arrivedFromAccountSetup && !accepted ? (
        <InlineNotice tone="success">
          <span className="font-medium">Password saved.</span> You are signed in.
        </InlineNotice>
      ) : null}
      {accepted ? <InlineNotice tone="success">{accepted}</InlineNotice> : null}
      {failure ? (
        <InlineNotice tone="error">
          <span className="block font-medium">{failure.message}</span>
          {failure.recoveryAction ? (
            <span className="mt-1 block text-xs leading-5">{failure.recoveryAction}</span>
          ) : null}
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
        <InvitationNotFound
          journey="staff"
          onCheckAgain={() => void bootstrapCtx?.refetch()}
          checking={bootstrapCtx?.isRefreshing}
        />
      ) : (
        <section aria-labelledby="invites-title" className="border-t-2 border-rule-strong">
          <h2 id="invites-title" className="type-section-title pb-2 pt-4">
            {invites.length > 1 ? 'Your invitations' : 'Your invitation'}
          </h2>
          <ul aria-label="Your invitations">
            {invites.map((invite) => {
              const expiry = describeInviteExpiry(invite.expiresAt);
              const role = formatStaffRole(invite.role);
              return (
                <li key={invite.id} className="space-y-3 border-t border-rule py-4">
                  <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[8rem_minmax(0,1fr)]">
                    <dt className="text-muted-foreground">Clinic</dt>
                    <dd className="text-base font-semibold text-foreground">{invite.clinicName}</dd>
                    <dt className="text-muted-foreground">Role</dt>
                    <dd className="text-foreground">{role}</dd>
                    {invite.invitedBy ? (
                      <>
                        <dt className="text-muted-foreground">Invited by</dt>
                        <dd className="text-foreground">{invite.invitedBy}</dd>
                      </>
                    ) : null}
                    <dt className="text-muted-foreground">Invitation</dt>
                    <dd
                      className={
                        expiry.tone === 'neutral'
                          ? 'text-foreground'
                          : 'font-medium text-warning-ink'
                      }
                    >
                      {expiry.label}
                    </dd>
                  </dl>
                  <p className="text-sm leading-6 text-muted-foreground">
                    Accepting lets you open {invite.clinicName}&rsquo;s records as a {role}. It
                    gives you nothing at any other clinic.
                  </p>
                  <Button
                    onClick={() => void accept(invite)}
                    disabled={acceptingId !== null || accepted !== null}
                    className="w-full sm:w-auto"
                  >
                    <ShieldCheck className="mr-2 h-4 w-4" aria-hidden="true" />
                    {acceptingId === invite.id
                      ? 'Accepting…'
                      : `Accept ${role} at ${invite.clinicName}`}
                  </Button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <p className="border-t border-rule pt-4 text-xs leading-5 text-muted-foreground">
        Not expecting this? Do nothing. The invitation lapses on its own, and nothing changes unless
        it is accepted.
      </p>
    </OnboardingFrame>
  );
}
