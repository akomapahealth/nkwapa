'use client';

import { useRef } from 'react';
import Image from 'next/image';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import { UserPlus, Stethoscope, Pill, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { landingCardHover } from '@/lib/landing-card-hover';

const STEPS = [
  {
    phase: '01',
    label: 'Intake',
    title: 'Register & triage',
    body: 'Fast patient capture with codes, demographics, and clinic context—optimized for high-volume screening days.',
    icon: UserPlus,
  },
  {
    phase: '02',
    label: 'Encounter',
    title: 'Document the visit',
    body: 'Vitals, chronic-disease forms, drafts, and peer review in one coordinated flow.',
    icon: Stethoscope,
  },
  {
    phase: '03',
    label: 'Prescribe',
    title: 'Medicate safely',
    body: 'Prescriptions tied to encounters and roles, so medication history stays anchored to the clinical record.',
    icon: Pill,
  },
  {
    phase: '04',
    label: 'Sync',
    title: 'Reconcile everywhere',
    body: 'Push and pull across clinics with an outbox model—built for intermittent connectivity.',
    icon: RefreshCw,
  },
];

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, ease: [0.25, 0.4, 0.25, 1] as const },
  },
};

export function WorkflowSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const isInView = useInView(sectionRef, { once: true, margin: '-80px' });
  const prefersReducedMotion = useReducedMotion();

  return (
    <section
      ref={sectionRef}
      id="workflow"
      className="scroll-mt-28 border-t border-border bg-muted/30 py-0"
    >
      {/* Wide photo strip */}
      <div className="relative h-48 w-full overflow-hidden sm:h-64 md:h-80">
        <Image
          src="/images/Akomapa-18.jpg"
          alt="Close-up of blood pressure measurement with a digital monitor at a community health screening"
          fill
          sizes="100vw"
          className="object-cover object-center"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-muted/95" />
      </div>

      <div className="mx-auto max-w-7xl px-6 pb-20 pt-12 md:pb-28 md:pt-16 lg:px-8">
        {/* Header */}
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="mb-12 max-w-2xl"
        >
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
        </motion.div>

        {/* Timeline */}
        <motion.div
          className="relative"
          initial={prefersReducedMotion ? false : 'hidden'}
          animate={isInView ? 'visible' : 'hidden'}
          variants={stagger}
        >
          {/* Horizontal connecting line (desktop) */}
          <div
            className="absolute left-0 right-0 top-10 hidden h-px bg-border md:block"
            aria-hidden
          />

          {/* Vertical connecting line (mobile) */}
          <div className="absolute bottom-0 left-6 top-0 w-px bg-border md:hidden" aria-hidden />

          <div className="grid gap-6 md:grid-cols-4 md:gap-4">
            {STEPS.map((step) => {
              const Icon = step.icon;
              return (
                <motion.div key={step.phase} variants={fadeUp}>
                  {/* Timeline dot */}
                  <div className="relative mb-4 flex items-center gap-4 md:mb-6 md:flex-col md:items-start md:gap-0">
                    <div className="relative z-10 flex h-10 w-10 items-center justify-center rounded-full border-2 border-primary bg-background shadow-sm md:mb-4">
                      <Icon className="h-4 w-4 text-primary" aria-hidden />
                    </div>
                    <Badge
                      variant="outline"
                      className="rounded-full border-primary/20 bg-primary/5 px-2 py-0.5 font-landing-nav text-[10px] font-semibold text-primary md:hidden"
                    >
                      {step.phase} · {step.label}
                    </Badge>
                  </div>

                  <Card
                    className={`ml-14 border-border/70 bg-background shadow-sm md:ml-0 ${landingCardHover}`}
                  >
                    <CardContent className="p-5">
                      <Badge
                        variant="outline"
                        className="mb-3 hidden rounded-full border-primary/20 bg-primary/5 px-2 py-0.5 font-landing-nav text-[10px] font-semibold text-primary md:inline-flex"
                      >
                        {step.phase} · {step.label}
                      </Badge>
                      <h3 className="font-landing-heading text-lg font-bold lowercase text-foreground">
                        {step.title}
                      </h3>
                      <p className="mt-2 font-landing-body text-sm text-muted-foreground">
                        {step.body}
                      </p>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
