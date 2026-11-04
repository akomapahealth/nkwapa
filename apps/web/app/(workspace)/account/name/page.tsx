'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useBootstrap } from '@/lib/bootstrap-context';
import { getSafeNextPath } from '@/lib/auth-routing';
import { toStaffNameInput, updateMyName, type StaffNameInput } from '@/lib/account-name';
import { StaffNameForm } from '@/components/account/StaffNameForm';
import { OnboardingFrame } from '@/components/onboarding/OnboardingFrame';
import { InlineErrorState, SectionSkeleton } from '@/components/feedback/AppState';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { showToast } from '@/components/ui/toast';

/*
  Your name (#225).

  Two jobs, one form. While the account has no name this is a required step: SyncWithAuth holds
  staff here, after accepting an invitation and before anything else, and renders it without the
  workspace around it. Afterwards it is where the profile menu sends someone to change it.

  No RouteGuard: the step has to be reachable by exactly the people who cannot reach anything
  else yet. The API writes only the caller's own record, with the id taken from the token.
*/
export default function AccountNamePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const getToken = useAuth();
  const bootstrapCtx = useBootstrap();
  const bootstrap = bootstrapCtx?.bootstrap ?? null;
  const isRequired = bootstrap?.onboarding?.state === 'NAME_REQUIRED';
  const next = getSafeNextPath(searchParams.get('next'));

  const save = async (value: StaffNameInput) => {
    if (!getToken) return;
    await updateMyName(value, getToken);
    showToast({ title: 'Saved', description: 'Your name is updated.', tone: 'success' });
    // The header, station boards and staff lists all read the name from bootstrap.
    await bootstrapCtx?.refetch();
    router.replace(next ?? '/dashboard');
  };

  const body =
    bootstrapCtx?.isLoading && !bootstrap ? (
      <div role="status" aria-live="polite" aria-busy="true">
        <span className="sr-only">Loading your account</span>
        <SectionSkeleton lines={3} />
      </div>
    ) : !bootstrap ? (
      <InlineErrorState
        title="We couldn't load your account"
        description={
          bootstrapCtx?.error ?? 'Check your connection, then try again. Signing in needs one.'
        }
        onRetry={() => bootstrapCtx?.retry()}
        retryLabel="Try again"
      />
    ) : (
      <StaffNameForm
        // Re-mount on a different account so the prefill is never someone else's.
        key={bootstrap.userId}
        idPrefix="account-name"
        initial={toStaffNameInput(bootstrap.profile)}
        email={bootstrap.profile?.email}
        onSubmit={save}
        submitLabel={isRequired ? 'Save and continue' : 'Save name'}
        secondaryAction={
          isRequired ? null : (
            <Button
              type="button"
              variant="ghost"
              size="lg"
              className="w-full sm:w-auto"
              onClick={() => router.replace(next ?? '/dashboard')}
            >
              Cancel
            </Button>
          )
        }
      />
    );

  /*
    The required step is the staff journey's last one before work, so it shares the journey frame
    with /accept-invite: the step list, who is signed in, and Sign out, because the step blocks
    the workspace, never the way out.
  */
  if (isRequired) {
    return (
      <OnboardingFrame
        journey="staff"
        current="name"
        title="Your name"
        lede="Your name appears on the records you work on, so colleagues and auditors can see who did what. Add it once and you’re in."
      >
        <section className="border-t-2 border-rule-strong pt-4">{body}</section>
      </OnboardingFrame>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      <Card className="rounded-xl border-border bg-card shadow-sm">
        <CardHeader className="space-y-3 px-6 pt-8 md:px-10">
          <p className="text-eyebrow text-primary">Your account</p>
          <CardTitle className="font-heading text-3xl font-semibold tracking-tight md:text-4xl">
            Your name
          </CardTitle>
          <CardDescription className="max-w-2xl text-sm leading-6 md:text-base">
            Your name appears on the records you work on, so colleagues and auditors can see who did
            what.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-6 pb-8 md:px-10">{body}</CardContent>
      </Card>
    </div>
  );
}
