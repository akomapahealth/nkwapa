'use client';

import { useRef } from 'react';
import Image from 'next/image';
import { motion, useScroll, useTransform, useReducedMotion } from 'framer-motion';
import { MoveRight, ShieldCheck, Wifi, Activity } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { trackEvent } from '@/lib/analytics';
import { NoiseTexture } from './shared/NoiseTexture';

const fadeUp = {
  hidden: { opacity: 0, y: 32 },
  visible: (delay: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, delay, ease: [0.25, 0.4, 0.25, 1] as const },
  }),
};

export function HeroSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const prefersReducedMotion = useReducedMotion();

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start start', 'end start'],
  });

  const imageY = useTransform(scrollYProgress, [0, 1], [0, -80]);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section
      ref={sectionRef}
      className="landing-hero-mesh relative overflow-hidden pt-28 pb-20 md:pt-36 md:pb-28"
    >
      <NoiseTexture />

      {/* Dot grid */}
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,hsl(var(--border))_1px,transparent_0)] [background-size:24px_24px] opacity-[0.3]"
        aria-hidden
      />

      {/* Floating decorative dots */}
      {!prefersReducedMotion && (
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <motion.div
            className="absolute left-[10%] top-[20%] h-3 w-3 rounded-full bg-primary/20"
            animate={{ y: [0, -12, 0], x: [0, 4, 0] }}
            transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.div
            className="absolute right-[15%] top-[30%] h-2 w-2 rounded-full bg-secondary/25"
            animate={{ y: [0, 10, 0], x: [0, -6, 0] }}
            transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut', delay: 1.5 }}
          />
          <motion.div
            className="absolute left-[25%] bottom-[25%] h-2.5 w-2.5 rounded-full bg-primary/15"
            animate={{ y: [0, -8, 0] }}
            transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut', delay: 0.8 }}
          />
          <motion.div
            className="absolute right-[30%] bottom-[35%] h-1.5 w-1.5 rounded-full bg-secondary/20"
            animate={{ y: [0, 6, 0], x: [0, 3, 0] }}
            transition={{ duration: 5.5, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
          />
        </div>
      )}

      <div className="relative z-10 mx-auto max-w-7xl px-6 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          {/* Left column — copy */}
          <motion.div
            initial={prefersReducedMotion ? false : 'hidden'}
            animate="visible"
            className="max-w-xl"
          >
            <motion.div variants={fadeUp} custom={0}>
              <Badge
                variant="outline"
                className="mb-6 rounded-full border-primary/30 bg-primary/5 px-3 py-1 font-landing-nav text-xs font-medium text-primary"
              >
                <Wifi className="mr-1.5 h-3 w-3" aria-hidden />
                Offline-first · Audit-ready
              </Badge>
            </motion.div>

            <motion.h1
              variants={fadeUp}
              custom={0.1}
              className="font-landing-heading text-4xl font-black lowercase leading-[1.08] tracking-tight text-foreground sm:text-5xl md:text-6xl"
            >
              Clinical records that work{' '}
              <span className="bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                when the network doesn&apos;t
              </span>
            </motion.h1>

            <motion.p
              variants={fadeUp}
              custom={0.2}
              className="mt-6 font-landing-body text-base leading-relaxed text-muted-foreground sm:text-lg"
            >
              Nkwapa is a contemporary EMR for{' '}
              <span className="font-semibold text-primary">hypertension</span> &{' '}
              <span className="font-semibold text-secondary">diabetes</span> programs: structured
              encounters, prescriptions, RBAC, and sync that survives field conditions — so
              clinicians stay focused on outcomes, not infrastructure.
            </motion.p>

            <motion.div
              variants={fadeUp}
              custom={0.3}
              className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center"
            >
              <Button
                size="lg"
                className="cursor-pointer gap-2 rounded-full px-8 font-landing-nav font-semibold shadow-lg shadow-primary/20"
                onClick={() => {
                  trackEvent({ name: 'landing_scroll_workflow', properties: { source: 'hero' } });
                  scrollTo('workflow');
                }}
              >
                See workflow
                <MoveRight className="h-4 w-4" aria-hidden />
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="cursor-pointer rounded-full border-2 px-8 font-landing-nav font-medium"
                onClick={() => {
                  trackEvent({ name: 'landing_scroll_product', properties: {} });
                  scrollTo('product');
                }}
              >
                Explore the product
              </Button>
            </motion.div>

            <motion.div
              variants={fadeUp}
              custom={0.4}
              className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground"
            >
              <span className="inline-flex items-center gap-2 font-landing-body">
                <ShieldCheck className="h-4 w-4 text-primary" aria-hidden />
                Clinic-scoped data
              </span>
              <span className="inline-flex items-center gap-2 font-landing-body">
                <Activity className="h-4 w-4 text-primary" aria-hidden />
                Immutable audit trail
              </span>
            </motion.div>
          </motion.div>

          {/* Right column — hero image */}
          <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.15, ease: [0.25, 0.4, 0.25, 1] }}
            className="relative"
          >
            <div className="relative overflow-hidden rounded-3xl border border-border bg-muted/40 shadow-2xl ring-1 ring-black/5">
              {/* Gradient overlay on image */}
              <div
                className="absolute inset-0 z-[1] bg-gradient-to-br from-primary/10 via-transparent to-secondary/15"
                aria-hidden
              />

              {/* Main hero image with parallax */}
              <motion.div style={prefersReducedMotion ? {} : { y: imageY }} className="relative">
                <Image
                  src="/images/Akomapa-11.jpg"
                  alt="Akomapa student-run free clinic — community health screening in Ghana"
                  width={1200}
                  height={800}
                  className="aspect-[4/3] w-full object-cover sm:aspect-auto sm:h-[440px] lg:h-[480px]"
                  priority
                  sizes="(max-width: 768px) 100vw, 50vw"
                />
              </motion.div>

              {/* Glass card dashboard preview overlay */}
              <motion.div
                initial={prefersReducedMotion ? false : { y: 30, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.5, ease: [0.25, 0.4, 0.25, 1] }}
                className="absolute inset-x-4 bottom-4 z-10 sm:inset-x-6 sm:bottom-6"
              >
                <div className="w-full max-w-md rounded-2xl border border-white/60 bg-background/95 p-4 shadow-xl backdrop-blur-md sm:p-5">
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
                    <div className="flex items-center justify-between rounded-lg bg-muted/60 px-3 py-1.5">
                      <span className="font-landing-body text-[11px] text-muted-foreground">
                        Encounters pending review
                      </span>
                      <span className="font-landing-nav text-[10px] font-semibold text-secondary">
                        4
                      </span>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <span className="flex h-7 flex-1 items-center justify-center rounded-md bg-primary/10 font-landing-nav text-[9px] font-medium text-primary">
                        HTN: 8
                      </span>
                      <span className="flex h-7 w-16 items-center justify-center rounded-md bg-secondary/20 font-landing-nav text-[9px] font-medium text-secondary">
                        DM: 4
                      </span>
                      <span className="flex h-7 w-12 items-center justify-center rounded-md bg-muted font-landing-nav text-[9px] font-medium text-muted-foreground">
                        Sync ✓
                      </span>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
