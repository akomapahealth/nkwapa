'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useBootstrap } from '@/lib/bootstrap-context';
import {
  getPostAuthPath,
  getSafeNextPath,
  parseSignInAudience,
  shouldAutoContinue,
  SIGN_IN_AUDIENCE_PARAM,
  type SignInAudience,
} from '@/lib/auth-routing';
import { useKeycloak } from '@/app/KeycloakProvider';
import { PageSkeleton } from '@/components/feedback/AppState';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AlertTriangle, ArrowRight, HeartPulse, Lock, Stethoscope } from 'lucide-react';

const AUDIENCE_STORAGE_KEY = 'nkwapa.signInAudience';

const AUDIENCE_OPTIONS = [
  { value: 'patient', label: 'Patient', icon: HeartPulse },
  { value: 'staff', label: 'Clinic staff', icon: Stethoscope },
] as const;

// Each block rises in a beat after the one above it; the global reduced-motion rule flattens it.
const RISE = 'motion-safe:animate-rise-in';
const riseDelay = (step: number) => ({ animationDelay: `${step * 40}ms` });

const GUIDANCE: Record<
  SignInAudience,
  { destination: string; landing: string; help: { title: string; detail: string }[] }
> = {
  patient: {
    destination: 'Open your patient record after secure sign-in.',
    landing:
      'Your own record opens. The first time, you confirm the patient code on your clinic card.',
    help: [
      {
        title: 'Getting access',
        detail:
          'Ask your clinic for portal access. They send an email with a link to choose your password.',
      },
      {
        title: 'Keep your clinic card nearby',
        detail: 'You confirm its patient code once, the first time you sign in.',
      },
      {
        title: 'Link not working?',
        detail:
          'Invitation links expire after a few days. Ask the clinic front desk to send a new one.',
      },
    ],
  },
  staff: {
    destination: 'Open your clinic workspace after secure sign-in.',
    landing: 'Your clinic workspace opens. If you work at more than one clinic, you choose which.',
    help: [
      {
        title: 'Joining a clinic team',
        detail:
          'Your clinic administrator invites you from the staff page. Open the email link to choose a password, then accept the clinic and role.',
      },
      {
        title: 'Link not working?',
        detail:
          'Invitation links expire after a few days. Ask your clinic administrator to send a new one.',
      },
    ],
  },
};

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
    Patient or clinic staff. It tailors the guidance on this page only: where sign-in lands is
    decided by the account's roles, so a staff member who picks "Patient" still reaches their
    workspace. A `?as=` link wins, then the choice remembered on this device, then patient.
  */
  const linkedAudience = parseSignInAudience(searchParams.get(SIGN_IN_AUDIENCE_PARAM));
  const [audience, setAudience] = useState<SignInAudience>(linkedAudience ?? 'patient');

  useEffect(() => {
    if (linkedAudience) return;
    try {
      const stored = parseSignInAudience(localStorage.getItem(AUDIENCE_STORAGE_KEY));
      if (stored) setAudience(stored);
    } catch {
      // Storage blocked (private mode): the default stands.
    }
  }, [linkedAudience]);

  const chooseAudience = (next: SignInAudience) => {
    setAudience(next);
    try {
      localStorage.setItem(AUDIENCE_STORAGE_KEY, next);
    } catch {
      // Not remembered this time; the choice still applies.
    }
    const url = new URL(window.location.href);
    url.searchParams.set(SIGN_IN_AUDIENCE_PARAM, next);
    window.history.replaceState(null, '', url);
  };

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

  const guidance = GUIDANCE[audience];
  const destinationCopy = nextPath
    ? 'Continue where you left off after secure sign-in.'
    : guidance.destination;

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
      detail: nextPath ? 'Nkwapa brings you back to the page you were on.' : guidance.landing,
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
          <div className={RISE} style={riseDelay(0)}>
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
          </div>

          <fieldset className={RISE} style={riseDelay(1)}>
            <legend className="type-label text-foreground">I am signing in as</legend>
            <div className="relative mt-2 grid grid-cols-2 rounded-lg border border-input bg-background p-1">
              <span
                aria-hidden="true"
                className={cn(
                  'absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-md bg-primary shadow-sm transition-transform duration-base ease-out-strong',
                  audience === 'staff' && 'translate-x-full',
                )}
              />
              {AUDIENCE_OPTIONS.map(({ value, label, icon: Icon }) => (
                <label
                  key={value}
                  className={cn(
                    'relative flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-md px-3 text-sm font-medium transition-colors duration-fast ease-out-strong has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2',
                    audience === value
                      ? 'text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <input
                    type="radio"
                    name="sign-in-audience"
                    value={value}
                    checked={audience === value}
                    onChange={() => chooseAudience(value)}
                    className="sr-only"
                  />
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>

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

          <div className={cn(RISE, 'space-y-3')} style={riseDelay(2)}>
            <Button onClick={login} size="lg" className="w-full px-6 sm:w-auto">
              {error ? 'Try secure sign in again' : 'Continue to secure sign in'}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
            <p className="flex items-start gap-2 text-sm leading-6 text-muted-foreground">
              <Lock className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                <span className="font-medium text-foreground">Invitation only.</span> There is no
                sign-up: every account starts with an email from a clinic.
              </span>
            </p>
          </div>

          <section
            aria-labelledby="login-next-title"
            className={cn(RISE, 'border-t-2 border-rule-strong')}
            style={riseDelay(3)}
          >
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
                    {/* Keyed by audience so a changed choice cross-fades in rather than snapping. */}
                    <span
                      key={index === 2 ? audience : undefined}
                      className="block text-sm leading-6 text-muted-foreground motion-safe:animate-page-in"
                    >
                      {step.detail}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside
          aria-labelledby="login-first-time-title"
          className={cn(RISE, 'min-w-0')}
          style={riseDelay(4)}
        >
          <section className="border-t-2 border-rule-strong">
            <h2 id="login-first-time-title" className="type-section-title pb-1 pt-4">
              First time here?
            </h2>
            <dl key={audience} className="text-sm leading-6 motion-safe:animate-page-in">
              {guidance.help.map((item) => (
                <div key={item.title} className="border-t border-rule py-3">
                  <dt className="font-medium text-foreground">{item.title}</dt>
                  <dd className="text-muted-foreground">{item.detail}</dd>
                </div>
              ))}
            </dl>
          </section>
        </aside>
      </main>
    </div>
  );
}
