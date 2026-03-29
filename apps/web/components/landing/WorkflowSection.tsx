'use client';

import { useRef, useEffect } from 'react';
import { gsap } from '@/lib/gsap';
import { landingCardHover } from '@/lib/landing-card-hover';

const STEPS = [
  {
    phase: '01 · Intake',
    title: 'Register & triage',
    body: 'Fast patient capture with codes, demographics, and clinic context—optimized for high-volume screening days.',
  },
  {
    phase: '02 · Encounter',
    title: 'Document the visit',
    body: 'Vitals, chronic-disease forms, drafts, and peer review in one coordinated flow.',
  },
  {
    phase: '03 · Prescribe',
    title: 'Mediate safely',
    body: 'Prescriptions tied to encounters and roles, so medication history stays anchored to the clinical record.',
  },
  {
    phase: '04 · Sync',
    title: 'Reconcile everywhere',
    body: 'Push and pull across clinics with an outbox model—built for intermittent connectivity.',
  },
];

export function WorkflowSection() {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const ctx = gsap.context(() => {
      const items = ref.current?.querySelectorAll('[data-step]');
      if (!items?.length) return;
      gsap.fromTo(
        items,
        { opacity: 0, y: 28 },
        {
          opacity: 1,
          y: 0,
          duration: 0.5,
          stagger: 0.12,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: ref.current,
            start: 'top 85%',
            toggleActions: 'play none none reverse',
          },
        },
      );
    }, ref);
    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={ref}
      id="workflow"
      className="scroll-mt-28 border-t border-border bg-muted/30 py-20 md:py-28"
    >
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-4">
            <p className="font-landing-nav text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              Clinical journey
            </p>
            <h2 className="mt-3 font-landing-heading text-3xl font-black lowercase text-foreground md:text-4xl">
              from waiting room to longitudinal care
            </h2>
            <p className="mt-4 font-landing-body text-muted-foreground">
              Nkwapa connects the moments that matter: intake, encounter documentation, prescribing,
              and reliable sync—so teams measure outcomes, not tool friction.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:col-span-8">
            {STEPS.map((s) => (
              <article
                key={s.phase}
                data-step
                className={`group rounded-2xl border border-border/70 bg-background p-6 shadow-sm ${landingCardHover}`}
              >
                <p className="font-landing-nav text-xs font-semibold uppercase tracking-wide text-primary">
                  {s.phase}
                </p>
                <h3 className="mt-2 font-landing-heading text-xl font-bold lowercase text-foreground">
                  {s.title}
                </h3>
                <p className="mt-2 font-landing-body text-sm text-muted-foreground">{s.body}</p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
