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
import { cn } from '@/lib/utils';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { HERO_HEADLINE } from '@/components/landing/hero-content';

// Each block rises in a beat after the one above it; the global reduced-motion rule flattens it.
const RISE = 'motion-safe:animate-rise-in';
const riseDelay = (step: number) => ({ animationDelay: `${step * 40}ms` });

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
        description="Your session is active."
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
        description="Password saved. Next, sign in and confirm your details."
        className="min-h-screen"
      />
    );
  }

  return (
    // The same frame as the Keycloak page it hands over to: the form, and a clinic photograph
    // inset beside it from 768px or as a short band above it on a phone.
    <div className="min-h-dvh bg-background">
      <div className="grid min-h-dvh grid-rows-[auto_1fr] bg-card compact:m-2 compact:min-h-[calc(100dvh-1rem)] compact:overflow-hidden compact:rounded-xl compact:border compact:border-border md:grid-cols-[minmax(380px,5fr)_6fr] md:grid-rows-none">
        <a
          href="#main-content"
          className="sr-only focus-visible:not-sr-only focus-visible:absolute focus-visible:left-4 focus-visible:top-4 focus-visible:z-50 focus-visible:rounded-lg focus-visible:bg-background focus-visible:px-4 focus-visible:py-3 focus-visible:text-sm focus-visible:font-medium focus-visible:shadow-sm"
        >
          Skip to main content
        </a>
        <div className="flex min-w-0 flex-col px-5 pb-5 pt-6 compact:px-10 compact:pb-6 compact:pt-8 xl:px-16 xl:pb-7 xl:pt-10">
          <header className="mx-auto w-full max-w-[380px] md:mx-0">
            <Link href="/" aria-label="Nkwapa home" className="inline-block rounded-sm">
              <Image
                src="/images/nkwapa-logo.png"
                alt=""
                width={140}
                height={30}
                priority
                className="h-[30px] w-auto"
              />
            </Link>
          </header>

          <main
            id="main-content"
            tabIndex={-1}
            className="mx-auto flex w-full max-w-[380px] flex-1 flex-col py-7 focus-visible:outline-none md:mx-0 md:justify-center md:py-10"
          >
            <div className={cn(RISE, 'space-y-2')} style={riseDelay(0)}>
              <h1 className="font-heading text-[clamp(2rem,1.4rem+2vw,2.75rem)] font-semibold leading-[1.08] tracking-[-0.02em] text-foreground [text-wrap:balance]">
                {error
                  ? "We couldn't start secure sign-in"
                  : nextPath
                    ? 'Sign in to continue'
                    : 'Welcome back'}
              </h1>
              <p className="max-w-[40ch] leading-relaxed text-muted-foreground">
                {error
                  ? "The sign-in service didn't respond. Nothing is lost; try again."
                  : nextPath
                    ? "Sign in on Nkwapa's secure page to carry on where you left off."
                    : "Sign in on Nkwapa's secure page. Staff open their clinic, patients their record."}
              </p>
            </div>

            {error ? (
              <div
                role="alert"
                className="mt-6 flex gap-3 border-t-2 border-destructive pt-4 text-sm leading-6"
              >
                <AlertTriangle
                  className="mt-0.5 h-5 w-5 shrink-0 text-destructive-ink"
                  aria-hidden="true"
                />
                <p className="text-muted-foreground">
                  {error} Records stay locked until sign-in reconnects.
                </p>
              </div>
            ) : null}

            <div className={cn(RISE, 'mt-7')} style={riseDelay(1)}>
              <Button onClick={login} size="lg" className="h-12 w-full">
                {error ? 'Try secure sign in again' : 'Continue to secure sign in'}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </main>

          <footer className="mx-auto flex w-full max-w-[380px] flex-wrap items-center justify-between gap-x-5 gap-y-1.5 text-[0.8125rem] text-muted-foreground md:mx-0 md:max-w-none">
            <p>Invitation only. Ask your clinic for access.</p>
            <nav aria-label="Legal" className="flex gap-5">
              <Link
                href="/privacy"
                className="underline underline-offset-[3px] hover:text-foreground"
              >
                Privacy
              </Link>
              <Link
                href="/terms"
                className="underline underline-offset-[3px] hover:text-foreground"
              >
                Terms
              </Link>
            </nav>
          </footer>
        </div>

        <figure className="relative -order-1 m-0 h-[168px] overflow-hidden rounded-b-[20px] bg-[#0f3b43] compact:mx-2 compact:mt-2 compact:h-[200px] compact:rounded-lg md:order-none md:m-2 md:h-auto">
          {/* Two crops of one photo; each is lazy and hidden at the other size, so only one loads. */}
          <Image
            src="/images/auth-band.jpg"
            alt=""
            fill
            sizes="100vw"
            className="object-cover md:hidden"
          />
          <Image
            src="/images/auth-panel.jpg"
            alt=""
            fill
            sizes="55vw"
            className="hidden object-cover object-[15%_40%] md:block xl:object-[8%_40%] motion-safe:animate-photo-settle"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 hidden bg-[linear-gradient(180deg,rgb(10_30_34/0)_45%,rgb(10_30_34/0.72)_100%)] md:block"
          />
          <figcaption className="absolute inset-x-[clamp(20px,3vw,36px)] bottom-[clamp(20px,3vw,36px)] z-[1] hidden max-w-[16ch] font-heading text-[clamp(1.75rem,1rem+1.6vw,2.5rem)] font-semibold leading-[1.12] tracking-[-0.015em] text-white [text-wrap:balance] md:block">
            {HERO_HEADLINE}
          </figcaption>
        </figure>
      </div>
    </div>
  );
}
