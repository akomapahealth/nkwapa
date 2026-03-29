'use client';

/* eslint-disable @next/next/no-img-element -- Marketing static assets */
import { useRef, useEffect } from 'react';
import { gsap } from '@/lib/gsap';
import { landingCardHover, landingPrimaryPanelHover } from '@/lib/landing-card-hover';
import { cn } from '@/lib/utils';

const stats = [
  {
    value: '500+',
    label: 'Patients managed across pilot clinics',
    variant: 'blue' as const,
  },
  {
    value: '100%',
    label: 'Offline capability — no data lost without connectivity',
    variant: 'light' as const,
  },
  {
    value: '4',
    label: 'Role types with granular permissions and audit trails',
    variant: 'blue' as const,
  },
];

export function ImpactSection() {
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    const ctx = gsap.context(() => {
      const heading = sectionRef.current?.querySelector('[data-heading]');
      const cards = sectionRef.current?.querySelectorAll('[data-stat]');

      if (heading) {
        gsap.fromTo(
          heading,
          { opacity: 0, y: 30 },
          {
            opacity: 1,
            y: 0,
            duration: 0.6,
            ease: 'power3.out',
            scrollTrigger: {
              trigger: sectionRef.current,
              start: 'top 80%',
              toggleActions: 'play none none reverse',
            },
          },
        );
      }

      if (cards?.length) {
        gsap.fromTo(
          cards,
          { opacity: 0, y: 40 },
          {
            opacity: 1,
            y: 0,
            duration: 0.5,
            stagger: 0.15,
            ease: 'power3.out',
            scrollTrigger: {
              trigger: sectionRef.current,
              start: 'top 75%',
              toggleActions: 'play none none reverse',
            },
          },
        );
      }
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  return (
    <section ref={sectionRef} id="impact" className="scroll-mt-28 py-16 md:py-24">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="grid gap-8 md:grid-cols-[1fr_1.5fr] md:items-start">
          <h2
            data-heading
            className="font-landing-heading text-3xl font-black lowercase leading-tight text-foreground md:text-5xl"
          >
            our
            <br />
            impact
          </h2>
          <p className="font-landing-body text-base text-muted-foreground">
            We are building Nkwapa to make chronic disease management reliable and accessible for
            clinics that need it most. Here is where we stand today.
          </p>
        </div>

        <div className="mt-12 grid gap-5 sm:grid-cols-3">
          {stats.map((s) => (
            <div
              key={s.value}
              data-stat
              className={cn(
                'flex flex-col justify-center rounded-2xl px-8 py-10',
                s.variant === 'blue'
                  ? ['bg-primary text-primary-foreground', landingPrimaryPanelHover]
                  : [
                      'border border-border/70 bg-muted/40 text-foreground shadow-sm',
                      landingCardHover,
                    ],
              )}
              style={
                s.variant === 'blue'
                  ? {
                      backgroundImage: `radial-gradient(1px 1px at 20% 30%, rgba(255,255,255,0.12) 0%, transparent 100%), radial-gradient(1px 1px at 80% 70%, rgba(255,255,255,0.08) 0%, transparent 100%)`,
                    }
                  : undefined
              }
            >
              <span className="font-landing-heading text-4xl font-black md:text-5xl">
                {s.value}
              </span>
              <p
                className={`mt-3 font-landing-body text-sm ${
                  s.variant === 'blue' ? 'text-primary-foreground/90' : 'text-muted-foreground'
                }`}
              >
                {s.label}
              </p>
            </div>
          ))}
        </div>

        <div
          className={`mt-8 overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm ${landingCardHover}`}
        >
          <img
            src="https://images.unsplash.com/photo-1584982751601-97dcc096659c?w=1400&q=80"
            alt="Aerial view of a community health center"
            className="h-auto w-full object-cover"
            loading="lazy"
          />
        </div>
      </div>
    </section>
  );
}
