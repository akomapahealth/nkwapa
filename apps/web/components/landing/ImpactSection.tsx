'use client';

import { useRef } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import { landingCardHover, landingPrimaryPanelHover } from '@/lib/landing-card-hover';
import { cn } from '@/lib/utils';
import { CountUp } from './shared/CountUp';
import { ParallaxImage } from './shared/ParallaxImage';

const stats = [
  {
    value: 2000,
    suffix: '+',
    label: 'Screenings conducted across pilot clinics',
    variant: 'blue' as const,
  },
  {
    value: 0,
    display: 'Zero',
    label: 'Data lost to connectivity failures',
    variant: 'light' as const,
  },
  {
    value: 7,
    label: 'Role types with granular permissions and audit trails',
    variant: 'blue' as const,
  },
  {
    value: 3,
    label: 'Clinic sites managed on a single platform',
    variant: 'light' as const,
  },
];

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 36 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, ease: [0.25, 0.4, 0.25, 1] as const },
  },
};

export function ImpactSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const isInView = useInView(sectionRef, { once: true, margin: '-80px' });
  const prefersReducedMotion = useReducedMotion();

  return (
    <section ref={sectionRef} id="impact" className="scroll-mt-28 py-16 md:py-24">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <motion.div
          className="grid gap-8 md:grid-cols-[1fr_1.5fr] md:items-start"
          initial={prefersReducedMotion ? false : { opacity: 0, y: 24 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
        >
          <h2 className="font-landing-heading text-3xl font-black lowercase leading-tight text-foreground md:text-5xl">
            our
            <br />
            impact
          </h2>
          <p className="font-landing-body text-base text-muted-foreground">
            We are building Nkwapa to make chronic disease management reliable and accessible for
            clinics that need it most. Here is where we stand today.
          </p>
        </motion.div>

        <motion.div
          className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4"
          initial={prefersReducedMotion ? false : 'hidden'}
          animate={isInView ? 'visible' : 'hidden'}
          variants={stagger}
        >
          {stats.map((s, i) => (
            <motion.div
              key={i}
              variants={fadeUp}
              className={cn(
                'flex flex-col justify-center rounded-2xl px-8 py-10',
                s.variant === 'blue'
                  ? ['bg-primary text-primary-foreground', landingPrimaryPanelHover]
                  : ['landing-glass text-foreground', landingCardHover],
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
                {s.display ? s.display : <CountUp to={s.value} suffix={s.suffix} />}
              </span>
              <p
                className={`mt-3 font-landing-body text-sm ${
                  s.variant === 'blue' ? 'text-primary-foreground/90' : 'text-muted-foreground'
                }`}
              >
                {s.label}
              </p>
            </motion.div>
          ))}
        </motion.div>

        {/* Photo - Akomapa-31 (glucose test) */}
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 24 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="mt-8"
        >
          <ParallaxImage
            src="/images/Akomapa-31.jpg"
            alt="Healthcare worker examining a patient's hand during a glucose screening at an Akomapa community clinic"
            speed={0.08}
            className="aspect-[21/9] w-full rounded-2xl border border-border/70 shadow-sm"
          />
        </motion.div>
      </div>
    </section>
  );
}
