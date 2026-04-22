'use client';

import Image from 'next/image';
import { motion, useReducedMotion } from 'framer-motion';
import { useInView } from 'framer-motion';
import { useRef } from 'react';
import { landingCardHover } from '@/lib/landing-card-hover';

const flowSteps = [
  { label: 'Draft', color: 'bg-muted text-muted-foreground' },
  { label: 'Review', color: 'bg-secondary/20 text-secondary' },
  { label: 'Finalize', color: 'bg-primary/15 text-primary' },
];

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.15 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 40 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.25, 0.4, 0.25, 1] as const },
  },
};

export function ProblemSolutionSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const isInView = useInView(sectionRef, { once: true, margin: '-80px' });
  const prefersReducedMotion = useReducedMotion();

  return (
    <section ref={sectionRef} className="py-16 md:py-24">
      <motion.div
        className="mx-auto grid max-w-7xl gap-6 px-6 md:grid-cols-2 lg:px-8"
        initial={prefersReducedMotion ? false : 'hidden'}
        animate={isInView ? 'visible' : 'hidden'}
        variants={stagger}
      >
        {/* The gap — with Akomapa-19 background */}
        <motion.div
          variants={fadeUp}
          className="relative overflow-hidden rounded-3xl shadow-lg ring-1 ring-primary/20"
        >
          <Image
            src="/images/Akomapa-19.jpg"
            alt=""
            fill
            sizes="(max-width: 768px) 100vw, 50vw"
            className="object-cover"
            aria-hidden="true"
          />
          <div className="absolute inset-0 bg-primary/88" />
          <div className="relative z-10 px-8 py-12 md:px-12 md:py-16">
            <p className="font-landing-nav text-xs font-semibold uppercase tracking-[0.2em] text-primary-foreground/80">
              The gap
            </p>
            <h2 className="mt-4 font-landing-heading text-3xl font-black lowercase leading-tight text-primary-foreground md:text-4xl">
              chronic programs stall when tools ignore reality
            </h2>
            <p className="mt-5 font-landing-body text-base leading-relaxed text-primary-foreground/90">
              Spotty connectivity, fragmented paper, and generic EMRs that were never designed for{' '}
              <strong className="font-semibold text-primary-foreground">HTN and DM programs</strong>{' '}
              mean teams spend energy fighting software instead of closing care gaps.
            </p>
          </div>
        </motion.div>

        {/* The shift — with animated encounter flow */}
        <motion.div
          variants={fadeUp}
          className={`relative overflow-hidden rounded-3xl border border-border bg-card px-8 py-12 shadow-sm ring-1 ring-black/[0.03] md:px-12 md:py-16 ${landingCardHover}`}
        >
          <p className="font-landing-nav text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            The shift
          </p>
          <h2 className="mt-4 font-landing-heading text-3xl font-black lowercase leading-tight text-foreground md:text-4xl">
            an emr that fits field conditions
          </h2>
          <p className="mt-5 font-landing-body text-base leading-relaxed text-muted-foreground">
            Nkwapa pairs{' '}
            <strong className="font-semibold text-foreground">offline resilience</strong> with{' '}
            <strong className="font-semibold text-foreground">audit-grade controls</strong>—so
            directors, clinicians, and volunteers share one truthful record across clinics.
          </p>

          {/* Animated encounter flow mockup */}
          <div className="mt-8 flex items-center gap-2">
            {flowSteps.map((step, i) => (
              <motion.div
                key={step.label}
                initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.8 }}
                animate={isInView ? { opacity: 1, scale: 1 } : {}}
                transition={{ delay: 0.6 + i * 0.2, duration: 0.4, ease: 'easeOut' }}
                className="flex items-center gap-2"
              >
                <span
                  className={`rounded-full px-3 py-1.5 font-landing-nav text-xs font-semibold ${step.color}`}
                >
                  {step.label}
                </span>
                {i < flowSteps.length - 1 && (
                  <motion.span
                    initial={prefersReducedMotion ? false : { width: 0 }}
                    animate={isInView ? { width: 24 } : {}}
                    transition={{ delay: 0.8 + i * 0.2, duration: 0.3 }}
                    className="block h-px bg-border"
                  />
                )}
              </motion.div>
            ))}
          </div>
        </motion.div>
      </motion.div>
    </section>
  );
}
