'use client';

import { useRef, useEffect } from 'react';
import { gsap } from '@/lib/gsap';
import { Card, CardContent } from '@/components/ui/card';
import { landingCardHover } from '@/lib/landing-card-hover';
import { cn } from '@/lib/utils';

const QUOTES = [
  {
    quote:
      'We finally have one record that survives clinic Wi‑Fi dropping out. That alone changed how honest our hypertension data is.',
    name: 'Dr. Amara K.',
    role: 'Program lead, urban outpost clinics',
  },
  {
    quote:
      'Review queues for preceptors are clear, and audit tells us who touched what. For scale, that discipline matters.',
    name: 'James Mensah',
    role: 'Clinical operations director',
  },
  {
    quote:
      'Multi-clinic isolation was non-negotiable. Nkwapa keeps patients scoped per site without us running three parallel systems.',
    name: 'Elena Duarte',
    role: 'Health system PMO',
  },
];

export function TestimonialsSection() {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const ctx = gsap.context(() => {
      const cards = ref.current?.querySelectorAll('[data-quote]');
      if (!cards?.length) return;
      gsap.fromTo(
        cards,
        { opacity: 0, y: 32 },
        {
          opacity: 1,
          y: 0,
          duration: 0.55,
          stagger: 0.1,
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
    <section ref={ref} className="py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="font-landing-nav text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            Proof, not hype
          </p>
          <h2 className="mt-3 font-landing-heading text-3xl font-black lowercase text-foreground sm:text-4xl">
            what teams say when the emr finally matches the mission
          </h2>
        </div>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {QUOTES.map((t) => (
            <Card
              key={t.name}
              data-quote
              className={cn(
                'group border-border/80 bg-card/80 shadow-sm backdrop-blur-sm',
                landingCardHover,
              )}
            >
              <CardContent className="pt-8">
                <p className="font-landing-body text-sm leading-relaxed text-foreground">
                  &ldquo;{t.quote}&rdquo;
                </p>
                <div className="mt-6 border-t border-border pt-4">
                  <p className="font-landing-heading text-sm font-semibold text-foreground">
                    {t.name}
                  </p>
                  <p className="mt-1 font-landing-body text-xs text-muted-foreground">{t.role}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
