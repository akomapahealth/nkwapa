'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useBootstrap } from '@/lib/bootstrap-context';
import { getPostAuthPath, getSafeNextPath, shouldAutoContinue } from '@/lib/auth-routing';
import { useKeycloak } from '@/app/KeycloakProvider';
import { PageSkeleton } from '@/components/feedback/AppState';
import { Button } from '@/components/ui/button';
import { AlertTriangle, ArrowRight } from 'lucide-react';

export default function LoginPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const bootstrapCtx = useBootstrap();
  const bootstrap = bootstrapCtx?.bootstrap ?? null;
  const isBootstrapLoading = bootstrapCtx?.isLoading ?? false;
  const { isAuthenticated, login, error } = useKeycloak() ?? {
    isAuthenticated: false,
    login: () => undefined,
    error: null as string | null,
  };

  const nextPath = getSafeNextPath(searchParams.get('next'));

  /*
    A patient returning from Keycloak, having just chosen their password, arrives here
    holding a live SSO session -- and is shown a page asking them to sign in.

    The silent check-sso that would have noticed the session runs in an iframe, which the
    third-party cookie defaults in Safari and Firefox block outright, so for most patients
    this is not a redundant click but the only way through, on a screen that gives no hint
    that clicking is safe. A top-level redirect is not subject to those cookie rules.

    Started once, from a ref rather than state, so a re-render cannot fire a second
    navigation. When sign-in itself is failing we fall through to the normal page, because
    an automatic retry loop is worse than a button.
  */
  const autoContinue = shouldAutoContinue(searchParams.get('next')) && !error;
  const autoContinueStarted = useRef(false);

  useEffect(() => {
    if (isAuthenticated || !autoContinue || autoContinueStarted.current) {
      return;
    }
    autoContinueStarted.current = true;
    login();
  }, [autoContinue, isAuthenticated, login]);

  useEffect(() => {
    if (!isAuthenticated || isBootstrapLoading) {
      return;
    }

    /*
      A client-side navigation, not a page load (#172). Keycloak hands back to this page, which
      has already initialised Keycloak, exchanged the code for tokens and fetched whoami.
      `window.location.replace` threw all of that away and ran it again on the destination: a
      second Keycloak start-up, token exchange, whoami and first sync on every sign-in.
    */
    const destination = getPostAuthPath(bootstrap, nextPath);
    if (typeof window !== 'undefined' && window.location.pathname !== destination) {
      router.replace(destination);
    }
  }, [bootstrap, isAuthenticated, isBootstrapLoading, nextPath, router]);

  if (isAuthenticated) {
    return (
      <PageSkeleton
        title="Opening your workspace"
        description="Your session is active. We are selecting the right clinic context and opening your workspace."
        steps={['Session restored', 'Clinic selected', 'Dashboard loading']}
        className="min-h-screen"
      />
    );
  }

  // Showing the sign-in page for the instant before the redirect fires would flash a
  // screen the patient is not meant to act on, and invite a click that cancels nothing.
  if (autoContinue) {
    return (
      <PageSkeleton
        title="Finishing your account setup"
        description="Your password is saved. Taking you to secure sign-in, so you can confirm your details and open your record."
        steps={['Password saved', 'Secure sign-in', 'Confirming your details']}
        className="min-h-screen"
      />
    );
  }

  const destinationCopy = nextPath
    ? 'Continue where you left off after secure sign-in.'
    : 'Open your Nkwapa clinic workspace or your patient record after secure sign-in.';

  const nextSteps = [
    {
      title: 'A secure sign-in page opens',
      detail: 'It is separate from this page, so your password never passes through it.',
    },
    {
      title: 'Enter your email and password',
      detail:
        'The password you chose from your invitation email. Forgot it? Choose “Forgot password” there.',
    },
    {
      title: nextPath ? 'You return to where you were' : 'Your work opens',
      detail: nextPath
        ? 'Nkwapa brings you back to the page you were on.'
        : 'Staff land in their clinic workspace. Patients land on their own record.',
    },
  ];

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="border-b border-rule">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-2 md:px-6">
          <span className="flex items-center gap-2.5">
            <span className="relative h-8 w-8">
              <Image
                src="/images/nkwapa-mark.png"
                alt=""
                fill
                priority
                sizes="32px"
                className="object-contain"
              />
            </span>
            <span className="font-heading text-xl font-semibold tracking-tight text-foreground">
              Nkwapa
            </span>
          </span>
          <Button asChild variant="ghost" size="sm">
            <Link href="/">Back to home</Link>
          </Button>
        </div>
      </header>

      <main
        id="main-content"
        className="mx-auto grid w-full max-w-5xl flex-1 content-start gap-10 px-4 pb-12 pt-8 md:px-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-14 lg:pt-16"
      >
        <div className="min-w-0 max-w-xl space-y-6">
          <div className="space-y-2">
            <p className="text-eyebrow text-muted-foreground">Secure sign in</p>
            <h1 className="type-page-title text-foreground">
              {error
                ? "We couldn't start secure sign-in"
                : nextPath
                  ? 'Sign in to continue'
                  : 'Sign in to Nkwapa'}
            </h1>
            <p className="text-sm leading-6 text-muted-foreground md:text-base">
              {error
                ? 'The secure sign-in service did not respond. Your workspace data has not loaded, and you can retry without losing your place.'
                : destinationCopy}
            </p>
          </div>

          {error ? (
            <div
              role="alert"
              className="flex gap-3 border-t-2 border-destructive pt-4 text-sm leading-6"
            >
              <AlertTriangle
                className="mt-0.5 h-5 w-5 shrink-0 text-destructive-ink"
                aria-hidden="true"
              />
              <div className="space-y-1">
                <p className="font-semibold text-foreground">Secure sign-in is affected</p>
                <p className="text-muted-foreground">
                  {error} The public home page is still available, but clinic records stay protected
                  until sign-in reconnects.
                </p>
              </div>
            </div>
          ) : null}

          <Button onClick={login} size="lg" className="w-full px-6 sm:w-auto">
            {error ? 'Try secure sign in again' : 'Continue to secure sign in'}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Button>

          <section aria-labelledby="login-next-title" className="border-t-2 border-rule-strong">
            <h2 id="login-next-title" className="type-section-title pb-1 pt-4">
              What happens next
            </h2>
            <ol>
              {nextSteps.map((step, index) => (
                <li
                  key={step.title}
                  className="flex gap-3 border-t border-rule py-3 first:border-t-0"
                >
                  <span
                    aria-hidden="true"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-input text-xs font-semibold tabular-nums text-muted-foreground"
                  >
                    {index + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-foreground">{step.title}</span>
                    <span className="block text-sm leading-6 text-muted-foreground">
                      {step.detail}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside aria-labelledby="login-first-time-title" className="min-w-0">
          <section className="border-t-2 border-rule-strong">
            <h2 id="login-first-time-title" className="type-section-title pb-1 pt-4">
              First time here?
            </h2>
            <p className="pb-3 text-sm leading-6 text-muted-foreground">
              Nkwapa accounts start with an invitation. There is no sign-up form.
            </p>
            <dl className="text-sm leading-6">
              <div className="border-t border-rule py-3">
                <dt className="font-medium text-foreground">Joining a clinic team</dt>
                <dd className="text-muted-foreground">
                  Your clinic sends you an email. Open its link to choose a password, then accept
                  the clinic and role.
                </dd>
              </div>
              <div className="border-t border-rule py-3">
                <dt className="font-medium text-foreground">Opening your patient record</dt>
                <dd className="text-muted-foreground">
                  Your clinic sends an email when you ask for portal access. Keep your clinic card
                  nearby: you confirm its patient code once.
                </dd>
              </div>
              <div className="border-t border-rule py-3">
                <dt className="font-medium text-foreground">Link not working?</dt>
                <dd className="text-muted-foreground">
                  Invitation links expire after a few days. Ask whoever invited you to send a new
                  one; the new email has a fresh link.
                </dd>
              </div>
            </dl>
          </section>
        </aside>
      </main>
    </div>
  );
}
