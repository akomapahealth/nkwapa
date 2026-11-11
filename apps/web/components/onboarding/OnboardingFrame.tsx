'use client';

import Image from 'next/image';
import { useState, type ReactNode } from 'react';
import { Check, LogOut } from 'lucide-react';
import { useKeycloak } from '@/app/KeycloakProvider';
import { useBootstrap } from '@/lib/bootstrap-context';
import { getErrorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { requestInvitationRenewal } from '@/lib/invite-renewal';
import {
  JOURNEY_TITLES,
  journeyProgress,
  journeySteps,
  type JourneyStepState,
  type OnboardingJourney,
} from '@/lib/onboarding-journey';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const STATE_WORDS: Record<JourneyStepState, string> = {
  done: 'Done',
  current: 'You are here',
  next: 'Still to do',
};

/** The Nkwapa mark and name. The pages it sits on have no sidebar to carry it. */
export function OnboardingBrand() {
  return (
    <span className="flex items-center gap-2.5">
      <span className="relative h-8 w-8">
        <Image src="/images/nkwapa-mark.png" alt="" fill sizes="32px" className="object-contain" />
      </span>
      <span className="font-heading text-xl font-semibold tracking-tight text-foreground">
        Nkwapa
      </span>
    </span>
  );
}

/** The whole journey as a ruled list: each step says in words whether it is done, now or later. */
export function JourneySteps({
  journey,
  current,
  needsName,
}: {
  journey: OnboardingJourney;
  current: string;
  needsName?: boolean;
}) {
  const steps = journeySteps(journey, { needsName });
  const { states } = journeyProgress(steps, current);
  return (
    <section aria-labelledby="journey-title" className="border-t-2 border-rule-strong">
      <h2 id="journey-title" className="type-section-title pb-2 pt-4">
        {JOURNEY_TITLES[journey]}
      </h2>
      <ol>
        {steps.map((step, index) => {
          const state = states[index];
          return (
            <li
              key={step.id}
              aria-current={state === 'current' ? 'step' : undefined}
              className="flex gap-3 border-t border-rule py-3 first:border-t-0"
            >
              <span
                aria-hidden="true"
                className={cn(
                  'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums',
                  state === 'done' && 'bg-success-surface text-success-ink',
                  state === 'current' && 'bg-primary text-primary-foreground',
                  state === 'next' && 'border border-input text-muted-foreground',
                )}
              >
                {state === 'done' ? <Check className="h-4 w-4" /> : index + 1}
              </span>
              <span className="min-w-0">
                <span
                  className={cn(
                    'block text-sm',
                    state === 'current' ? 'font-semibold text-foreground' : 'text-foreground',
                  )}
                >
                  {step.label}
                </span>
                <span className="block text-xs leading-5 text-muted-foreground">
                  <span
                    className={cn(
                      'font-medium',
                      state === 'done' && 'text-success-ink',
                      state === 'current' && 'text-foreground',
                    )}
                  >
                    {STATE_WORDS[state]}
                  </span>
                  {state === 'done' ? null : `. ${step.detail}`}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/*
  No invitation to show. Matching is on the address Keycloak has confirmed, so the commonest cause
  is an unfinished email confirmation, then a lapsed invitation, then one already used or
  withdrawn. Each cause gets its own row with the one thing that fixes it, because a single
  paragraph listing all three is what sent every such person to phone the clinic.
*/
export function InvitationNotFound({
  journey,
  onCheckAgain,
  checking,
}: {
  journey: OnboardingJourney;
  onCheckAgain: () => void;
  checking?: boolean;
}) {
  const asker = journey === 'staff' ? 'the person who invited you' : 'your clinic';
  const getToken = useAuth();
  const [renewal, setRenewal] = useState<{
    sending: boolean;
    message: string | null;
    error: string | null;
  }>({ sending: false, message: null, error: null });
  const askForRenewal = async () => {
    if (!getToken) return;
    setRenewal({ sending: true, message: null, error: null });
    try {
      setRenewal({
        sending: false,
        message: await requestInvitationRenewal(getToken),
        error: null,
      });
    } catch (error) {
      setRenewal({ sending: false, message: null, error: getErrorMessage(error) });
    }
  };
  const causes = [
    {
      title: 'Your email address is not confirmed yet',
      fix: 'Look for an email from Nkwapa asking you to confirm your address and open its link. Then check again here.',
    },
    {
      title: 'The invitation has expired',
      fix: `Invitations last a few days. Ask for a new one below, or ask ${asker}; the new email has a fresh link.`,
    },
    {
      title:
        journey === 'staff'
          ? 'It was already accepted, or withdrawn'
          : 'It was already used, or withdrawn',
      fix:
        journey === 'staff'
          ? 'If you accepted it on another device, sign out and sign in again. Otherwise ask the person who invited you.'
          : 'If you have already opened your record, sign out and sign in again. Otherwise ask your clinic.',
    },
  ];
  return (
    <section aria-labelledby="no-invite-title" className="border-t-2 border-rule-strong">
      <h2 id="no-invite-title" className="type-section-title pb-1 pt-4">
        {journey === 'staff' ? 'No open invitation found' : 'No pending invitation found'}
      </h2>
      <p className="pb-3 text-sm leading-6 text-muted-foreground">
        We could not find an invitation for this account. It is usually one of these:
      </p>
      <ul>
        {causes.map((cause) => (
          <li key={cause.title} className="border-t border-rule py-3">
            <p className="text-sm font-medium text-foreground">{cause.title}</p>
            <p className="mt-0.5 text-sm leading-6 text-muted-foreground">{cause.fix}</p>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-3 border-t border-rule pt-4">
        <Button variant="outline" onClick={onCheckAgain} loading={checking}>
          Check again
        </Button>
        <Button
          variant="outline"
          onClick={() => void askForRenewal()}
          loading={renewal.sending}
          disabled={!getToken || Boolean(renewal.message)}
        >
          {renewal.message ? 'Asked for a new invitation' : 'Ask for a new invitation'}
        </Button>
      </div>
      {renewal.message || renewal.error ? (
        <p role="status" className="pt-3 text-sm leading-6 text-muted-foreground">
          {renewal.message ?? renewal.error}
        </p>
      ) : null}
    </section>
  );
}

/*
  The page around every account-setup step (#277).

  These routes render outside both shells: the person here holds no role yet, so neither the
  staff sidebar nor the portal applies. The frame gives them what the shells would have: a skip
  link, one `main`, the brand, who is signed in and a way out. Holding someone on a step is the
  existing behaviour; trapping them was never meant to be, so Sign out is always one click away.
*/
export function OnboardingFrame({
  journey,
  current,
  needsName,
  eyebrow,
  title,
  lede,
  children,
}: {
  journey: OnboardingJourney;
  current: string;
  needsName?: boolean;
  /** Overrides the "Step n of m" line, for a page that is not itself a numbered step. */
  eyebrow?: string;
  title: ReactNode;
  lede: ReactNode;
  children: ReactNode;
}) {
  const { logout } = useKeycloak() ?? { logout: () => undefined };
  const bootstrap = useBootstrap()?.bootstrap ?? null;
  const signedInAs = bootstrap?.profile?.email ?? bootstrap?.displayName ?? null;
  const steps = journeySteps(journey, { needsName });
  const { current: index } = journeyProgress(steps, current);

  return (
    <div className="min-h-dvh bg-background">
      <div className="flex min-h-dvh flex-col bg-card compact:m-2 compact:min-h-[calc(100dvh-1rem)] compact:rounded-xl compact:border compact:border-border">
        <a
          href="#main-content"
          className="sr-only focus-visible:not-sr-only focus-visible:absolute focus-visible:left-4 focus-visible:top-4 focus-visible:z-50 focus-visible:rounded-lg focus-visible:bg-background focus-visible:px-4 focus-visible:py-3 focus-visible:text-sm focus-visible:font-medium focus-visible:shadow-sm"
        >
          Skip to main content
        </a>
        <header className="border-b border-rule">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-2 md:px-6">
            <OnboardingBrand />
            <div className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
              {signedInAs ? (
                <span className="hidden min-w-0 truncate sm:inline">Signed in as {signedInAs}</span>
              ) : null}
              <Button variant="ghost" size="sm" onClick={logout}>
                <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
                Sign out
              </Button>
            </div>
          </div>
        </header>
        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto grid w-full max-w-5xl gap-10 px-4 pb-12 pt-8 focus-visible:outline-none md:px-6 lg:grid-cols-[minmax(0,1fr)_17rem] lg:gap-14 lg:pt-12"
        >
          <div className="min-w-0 space-y-6">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                {eyebrow ?? `Step ${index + 1} of ${steps.length}`}
              </p>
              <h1 className="type-page-title text-foreground">{title}</h1>
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">
                {lede}
              </p>
            </div>
            {children}
          </div>
          <aside className="min-w-0">
            <JourneySteps journey={journey} current={current} needsName={needsName} />
          </aside>
        </main>
      </div>
    </div>
  );
}
