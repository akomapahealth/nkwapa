'use client';

/* eslint-disable @next/next/no-img-element -- Marketing static assets */
import { useRef, useEffect } from 'react';
import { MoveRight, ShieldCheck } from 'lucide-react';
import { gsap } from '@/lib/gsap';
import { useKeycloak } from '@/app/KeycloakProvider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { trackEvent } from '@/lib/analytics';
import { landingCardHover } from '@/lib/landing-card-hover';

export function HeroSection() {
  const rootRef = useRef<HTMLElement>(null);
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const { login } = useKeycloak() ?? {};

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const ctx = gsap.context(() => {
      gsap.fromTo(
        leftRef.current,
        { opacity: 0, y: 28 },
        { opacity: 1, y: 0, duration: 0.75, ease: 'power3.out' },
      );
      gsap.fromTo(
        rightRef.current,
        { opacity: 0, y: 36 },
        { opacity: 1, y: 0, duration: 0.8, delay: 0.12, ease: 'power3.out' },
      );
    }, rootRef);
    return () => ctx.revert();
  }, []);

  const scrollToProduct = () => {
    document.getElementById('product')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section
      ref={rootRef}
      className="landing-hero-mesh relative overflow-hidden pt-28 pb-16 md:pt-36 md:pb-24"
    >
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,hsl(var(--border))_1px,transparent_0)] [background-size:24px_24px] opacity-[0.35]"
        aria-hidden
      />

      <div className="relative mx-auto max-w-7xl px-6 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <div ref={leftRef}>
            <Badge
              variant="outline"
              className="mb-6 rounded-full border-primary/30 bg-primary/5 px-3 py-1 font-landing-nav text-xs font-medium text-primary"
            >
              Offline-first · Audit-ready
            </Badge>
            <h1 className="font-landing-heading text-4xl font-black lowercase leading-[1.08] tracking-tight text-foreground sm:text-5xl md:text-6xl">
              Patient management built for <span className="text-primary">hypertension</span> &{' '}
              <span className="text-secondary">diabetes</span> programs
            </h1>
            <p className="mt-6 max-w-xl font-landing-body text-base leading-relaxed text-muted-foreground sm:text-lg">
              Nkwapa is a contemporary EMR for multi-clinic teams: structured encounters,
              prescriptions, RBAC, and sync that works when the network does not—so clinicians stay
              focused on outcomes, not infrastructure.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button
                size="lg"
                className="cursor-pointer gap-2 rounded-full px-8 font-landing-nav font-semibold"
                onClick={() => {
                  trackEvent({
                    name: 'landing_cta_sign_in',
                    properties: { source: 'hero_primary' },
                  });
                  login?.();
                }}
              >
                Sign in
                <MoveRight className="h-4 w-4" aria-hidden />
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="cursor-pointer rounded-full border-2 px-8 font-landing-nav font-medium"
                onClick={() => {
                  trackEvent({ name: 'landing_scroll_product', properties: {} });
                  scrollToProduct();
                }}
              >
                Explore the product
              </Button>
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-2 font-landing-body">
                <ShieldCheck className="h-4 w-4 text-primary" aria-hidden />
                Clinic-scoped data · Immutable audit trail
              </span>
            </div>
          </div>

          <div ref={rightRef} className="relative">
            <div
              className={`relative overflow-hidden rounded-3xl border border-border bg-muted/40 shadow-2xl ring-1 ring-black/5 ${landingCardHover}`}
            >
              <div
                className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-secondary/15"
                aria-hidden
              />
              <img
                src="https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=1200&q=85"
                alt="Clinical team using technology for patient care"
                className="aspect-[4/3] w-full object-cover opacity-90 mix-blend-multiply sm:aspect-auto sm:h-[420px] lg:h-[460px]"
                loading="eager"
              />
              <div className="absolute inset-4 flex items-end sm:inset-6">
                <div
                  className={`w-full max-w-md rounded-2xl border border-white/60 bg-background/95 p-4 shadow-xl backdrop-blur-md sm:p-5 ${landingCardHover}`}
                >
                  <p className="font-landing-nav text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    Live workspace preview
                  </p>
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center justify-between rounded-lg bg-muted/80 px-3 py-2">
                      <span className="font-landing-body text-xs font-medium text-foreground">
                        Today&apos;s queue
                      </span>
                      <span className="rounded-full bg-primary/15 px-2 py-0.5 font-landing-nav text-[10px] font-semibold text-primary">
                        12 active
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-muted" />
                    <div className="h-2 w-4/5 rounded-full bg-primary/25" />
                    <div className="flex gap-2 pt-1">
                      <span className="h-6 flex-1 rounded-md bg-primary/10" />
                      <span className="h-6 w-14 rounded-md bg-secondary/30" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
