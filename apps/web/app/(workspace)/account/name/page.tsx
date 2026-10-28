'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useBootstrap } from '@/lib/bootstrap-context';
import { getSafeNextPath } from '@/lib/auth-routing';
import { toStaffNameInput, updateMyName, type StaffNameInput } from '@/lib/account-name';
import { useKeycloak } from '@/app/KeycloakProvider';
import { StaffNameForm } from '@/components/account/StaffNameForm';
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
  const { logout } = useKeycloak() ?? { logout: () => undefined };
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

  const card = (
    <Card className="rounded-xl border-border bg-card shadow-sm">
      <CardHeader className="space-y-3 px-6 pt-8 md:px-10">
        <p className="text-eyebrow text-primary">{isRequired ? 'One last step' : 'Your account'}</p>
        <CardTitle className="font-heading text-3xl font-semibold tracking-tight md:text-4xl">
          Your name
        </CardTitle>
        <CardDescription className="max-w-2xl text-sm leading-6 md:text-base">
          Your name appears on the records you work on, so colleagues and auditors can see who did
          what.
          {isRequired ? ' Add it once and you’re in.' : ''}
        </CardDescription>
      </CardHeader>
      <CardContent className="px-6 pb-8 md:px-10">
        {bootstrapCtx?.isLoading && !bootstrap ? (
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
        )}
      </CardContent>
    </Card>
  );

  if (!isRequired) {
    return <div className="mx-auto w-full max-w-2xl">{card}</div>;
  }

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
        className="mx-auto flex max-w-2xl flex-col gap-4 focus-visible:outline-none"
      >
        {card}
        {/* The step blocks the workspace, never the way out. */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-sm text-muted-foreground">
          <span className="min-w-0 truncate">
            Signed in as {bootstrap?.profile?.email ?? bootstrap?.displayName}
          </span>
          <Button variant="ghost" size="sm" onClick={logout}>
            <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
            Sign out
          </Button>
        </div>
      </main>
    </div>
  );
}
