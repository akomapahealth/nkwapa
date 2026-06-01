'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useBootstrap } from '@/lib/bootstrap-context';
import { getPostAuthPath, getSafeNextPath } from '@/lib/auth-routing';
import { useKeycloak } from '@/app/KeycloakProvider';
import { PageSkeleton } from '@/components/feedback/AppState';
import { Button } from '@/components/ui/button';
import { AlertTriangle, ArrowRight, CheckCircle2, ShieldCheck, Wifi } from 'lucide-react';

export default function LoginPage() {
  const searchParams = useSearchParams();
  const bootstrapCtx = useBootstrap();
  const bootstrap = bootstrapCtx?.bootstrap ?? null;
  const isBootstrapLoading = bootstrapCtx?.isLoading ?? false;
  const { isAuthenticated, login, error } = useKeycloak() ?? {
    isAuthenticated: false,
    login: () => undefined,
    error: null as string | null,
  };

  const nextPath = getSafeNextPath(searchParams.get('next'));

  useEffect(() => {
    if (!isAuthenticated || isBootstrapLoading) {
      return;
    }

    const destination = getPostAuthPath(bootstrap, nextPath);
    if (typeof window !== 'undefined' && window.location.pathname !== destination) {
      window.location.replace(destination);
    }
  }, [bootstrap, isAuthenticated, isBootstrapLoading, nextPath]);

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

  const destinationCopy = nextPath
    ? 'Continue where you left off after secure sign-in.'
    : 'Open your Nkwapa clinic workspace after secure sign-in.';

  return (
    <main className="min-h-dvh bg-clinical-grid px-4 py-5 sm:px-6 lg:flex lg:h-dvh lg:items-center lg:overflow-hidden lg:py-6">
      <section className="mx-auto grid w-full max-w-6xl overflow-hidden rounded-[30px] border border-border/70 bg-card/95 shadow-2xl shadow-black/10 lg:max-h-[calc(100dvh-3rem)] lg:grid-cols-[0.9fr_1.1fr]">
        <aside className="relative hidden overflow-hidden bg-primary text-primary-foreground lg:block">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,hsl(var(--secondary)/0.28),transparent_34%),radial-gradient(circle_at_80%_72%,hsl(var(--background)/0.18),transparent_30%)]" />
          <div className="relative flex h-full min-h-[560px] flex-col justify-between gap-8 p-8 xl:p-10">
            <div className="relative h-14 w-64">
              <Image
                src="/images/nkwapa_logo-2.png"
                alt="Nkwapa"
                fill
                priority
                sizes="256px"
                className="object-contain object-left"
              />
            </div>

            <div className="max-w-md space-y-5">
              <p className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-white/90">
                <ShieldCheck className="h-3.5 w-3.5" />
                Protected workspace
              </p>
              <div className="space-y-3">
                <h1 className="font-heading text-4xl font-semibold leading-tight tracking-tight xl:text-5xl">
                  Secure access for patient-safe clinic work.
                </h1>
                <p className="text-base leading-7 text-white/82">
                  Sign in once to reach clinic-scoped records, queues, follow-up, and dashboard
                  context without exposing sensitive patient data on this page.
                </p>
              </div>
            </div>

            <div className="grid gap-3 text-sm text-white/86">
              {[
                'Keycloak verifies your identity before records load.',
                'Clinic permissions decide what you can view and update.',
                'Offline sync keeps available tools clear when networks change.',
              ].map((item) => (
                <div key={item} className="flex items-start gap-3 rounded-2xl bg-white/10 p-3">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-secondary" />
                  <span className="leading-6">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </aside>

        <section className="flex min-h-[100dvh] flex-col justify-center px-5 py-8 sm:px-8 lg:min-h-0 lg:px-12 lg:py-10">
          <div className="mx-auto w-full max-w-md space-y-7">
            <div className="space-y-5">
              <div className="relative h-12 w-56 lg:hidden">
                <Image
                  src="/images/nkwapa_logo-2.png"
                  alt="Nkwapa"
                  fill
                  priority
                  sizes="224px"
                  className="object-contain object-left"
                />
              </div>

              <div className="space-y-3">
                <p className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-primary">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Secure sign in
                </p>
                <div className="space-y-2">
                  <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                    {error
                      ? "We couldn't start secure sign-in"
                      : nextPath
                        ? 'Sign in to continue'
                        : 'Sign in to Nkwapa'}
                  </h1>
                  <p className="text-sm leading-6 text-muted-foreground sm:text-base">
                    {error
                      ? 'The secure sign-in service did not respond. Your workspace data has not loaded, and you can retry without losing your place.'
                      : destinationCopy}
                  </p>
                </div>
              </div>
            </div>

            {error ? (
              <div
                className="rounded-2xl border border-destructive/25 bg-destructive/10 p-4"
                role="alert"
              >
                <div className="flex gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-foreground">
                      Secure sign-in is affected
                    </p>
                    <p className="text-sm leading-6 text-muted-foreground">
                      {error} The public home page is still available, but clinic records stay
                      protected until sign-in reconnects.
                    </p>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="grid gap-3 rounded-[26px] border border-border/70 bg-background/80 p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Wifi className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-foreground">What happens next</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    Nkwapa sends you to secure sign-in, then returns you to the right clinic
                    workspace after your session is verified.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button onClick={login} className="h-12 flex-1 rounded-2xl">
                {error ? 'Try secure sign in again' : 'Continue to secure sign in'}
                <ArrowRight className="h-4 w-4" />
              </Button>
              <Button asChild variant="outline" className="h-12 rounded-2xl">
                <Link href="/">Back to home</Link>
              </Button>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
