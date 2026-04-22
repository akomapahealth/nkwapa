'use client';

import { useRef } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import { Stethoscope, GraduationCap, Heart, Building2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { ParallaxImage } from './shared/ParallaxImage';
import { landingCardHover } from '@/lib/landing-card-hover';

const roles = [
  {
    icon: Stethoscope,
    title: 'Doctors',
    description:
      'Finalize encounters, prescribe medications, and review longitudinal patient data.',
    color: 'text-primary bg-primary/10',
  },
  {
    icon: GraduationCap,
    title: 'Preceptors',
    description: 'Peer-review clinical encounters before finalization for quality assurance.',
    color: 'text-secondary bg-secondary/15',
  },
  {
    icon: Heart,
    title: 'Volunteers',
    description: 'Register patients, record vitals, and initiate intake at the point of care.',
    color: 'text-chart-3 bg-chart-3/15',
  },
  {
    icon: Building2,
    title: 'Directors',
    description: 'Oversee multi-clinic operations, approve research exports, and manage staff.',
    color: 'text-foreground bg-muted',
  },
];

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.25, 0.4, 0.25, 1] as const },
  },
};

export function ClinicalTeamSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const isInView = useInView(sectionRef, { once: true, margin: '-80px' });
  const prefersReducedMotion = useReducedMotion();

  return (
    <section ref={sectionRef} className="py-16 md:py-24">
      <div className="mx-auto grid max-w-7xl gap-12 px-6 md:grid-cols-2 md:items-center lg:px-8">
        {/* Left — role cards */}
        <div>
          <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6 }}
          >
            <p className="font-landing-nav text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              Built for every role
            </p>
            <h2 className="mt-3 font-landing-heading text-3xl font-black lowercase leading-tight text-foreground md:text-4xl">
              the right tools for every team member
            </h2>
            <p className="mt-3 font-landing-body text-muted-foreground">
              Seven distinct roles with clinic-scoped permissions ensure every team member sees
              exactly what they need — nothing more, nothing less.
            </p>
          </motion.div>

          <motion.div
            className="mt-8 grid gap-3 sm:grid-cols-2"
            initial={prefersReducedMotion ? false : 'hidden'}
            animate={isInView ? 'visible' : 'hidden'}
            variants={stagger}
          >
            {roles.map((role) => {
              const Icon = role.icon;
              return (
                <motion.div key={role.title} variants={fadeUp}>
                  <Card className={`h-full border-border/70 shadow-sm ${landingCardHover}`}>
                    <CardContent className="p-4">
                      <div
                        className={`mb-3 flex h-9 w-9 items-center justify-center rounded-lg ${role.color}`}
                      >
                        <Icon className="h-4 w-4" aria-hidden />
                      </div>
                      <h3 className="font-landing-heading text-sm font-bold lowercase text-foreground">
                        {role.title}
                      </h3>
                      <p className="mt-1 font-landing-body text-xs leading-relaxed text-muted-foreground">
                        {role.description}
                      </p>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </motion.div>
        </div>

        {/* Right — Akomapa-34 (vision screening) */}
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 32 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7, delay: 0.2 }}
          className="relative"
        >
          <ParallaxImage
            src="/images/Akomapa-34.jpg"
            alt="Akomapa volunteer conducting a vision screening with a Snellen eye chart"
            speed={0.1}
            className="aspect-[3/4] w-full rounded-2xl border border-border/70 shadow-lg sm:aspect-[4/5]"
          />

          {/* Glass caption overlay */}
          <div className="absolute inset-x-4 bottom-4 rounded-xl landing-glass px-4 py-3 sm:inset-x-6 sm:bottom-6">
            <p className="font-landing-heading text-sm font-bold lowercase text-foreground">
              Real screening. Real data. Real outcomes.
            </p>
            <p className="mt-0.5 font-landing-body text-xs text-muted-foreground">
              Akomapa student-run free clinic, Ghana
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
