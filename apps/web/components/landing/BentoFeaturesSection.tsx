'use client';

import type { ReactNode } from 'react';
import { useRef } from 'react';
import Image from 'next/image';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import { landingCardHover } from '@/lib/landing-card-hover';
import { cn } from '@/lib/utils';

interface BentoFeature {
  title: string;
  description: string;
  meta?: string;
  status?: string;
  tags?: string[];
  colSpan?: number;
  rowSpan?: number;
  accentClass?: string;
  icon?: ReactNode;
  /** If true, render Akomapa-17 as background for this card */
  heroImage?: boolean;
}

/* Abstract marks — lightweight, no external assets */
function OfflineMark() {
  return (
    <div className="relative h-5 w-5" aria-hidden>
      <div className="absolute inset-0 rounded-full border-2 border-primary-foreground/80" />
      <div className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary-foreground" />
    </div>
  );
}
function RBACMark() {
  return (
    <div className="relative h-5 w-5" aria-hidden>
      <div className="absolute left-0 top-0 h-3.5 w-3.5 rounded-full border-2 border-primary/80" />
      <div className="absolute right-0 top-1.5 h-3.5 w-3.5 rounded-full border-2 border-primary/80" />
    </div>
  );
}
function EncountersMark() {
  return (
    <div className="relative h-5 w-5" aria-hidden>
      <div className="absolute inset-0 rounded-md border-2 border-secondary-foreground/50" />
      <div className="absolute left-0.5 top-0.5 right-0.5 h-0.5 rounded-full bg-secondary" />
    </div>
  );
}
function RxMark() {
  return (
    <div className="relative h-5 w-5" aria-hidden>
      <div className="absolute inset-0 rounded-md border-2 border-primary/70" />
      <div className="absolute left-1/2 top-1/2 h-2.5 w-0.5 -translate-x-1/2 -translate-y-1/2 bg-primary" />
      <div className="absolute left-1/2 top-1/2 h-0.5 w-2.5 -translate-x-1/2 -translate-y-1/2 bg-primary" />
    </div>
  );
}
function AuditMark() {
  return (
    <div className="relative h-5 w-5" aria-hidden>
      <div className="absolute bottom-0 left-1/2 h-4 w-3 -translate-x-1/2 rounded-t-full border-2 border-primary/70 border-b-0" />
    </div>
  );
}
function MultiClinicMark() {
  return (
    <div className="relative h-5 w-5" aria-hidden>
      <div className="absolute left-0 top-0 h-4 w-4 rounded-md border-2 border-landing-accent" />
      <div className="absolute bottom-0 right-0 h-4 w-4 rounded-md border-2 border-landing-accent bg-card" />
    </div>
  );
}
function PortalMark() {
  return (
    <div className="relative h-5 w-5" aria-hidden>
      <div className="absolute inset-0 rounded-full border-2 border-secondary/70" />
      <div className="absolute left-1/2 top-1.5 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-secondary" />
      <div className="absolute bottom-0.5 left-1/2 h-2 w-3 -translate-x-1/2 rounded-t-md border-2 border-secondary/70 border-b-0" />
    </div>
  );
}
function ExportMark() {
  return (
    <div className="relative h-5 w-5" aria-hidden>
      <div className="absolute inset-x-0.5 top-0 bottom-0.5 rounded-sm border-2 border-primary/60" />
      <div className="absolute bottom-0 left-1/2 h-0.5 w-3 -translate-x-1/2 bg-primary/60" />
      <div className="absolute bottom-1 left-1/2 h-2 w-0.5 -translate-x-1/2 bg-primary/60" />
    </div>
  );
}

const features: BentoFeature[] = [
  {
    title: 'Offline sync',
    description:
      'Document encounters without connectivity. Nkwapa reconciles quietly when the network returns—no lost vitals, no duplicate rows.',
    meta: 'Outbox model',
    status: 'Always on',
    tags: ['PWA', 'Resilience'],
    colSpan: 2,
    rowSpan: 2,
    accentClass:
      'bg-primary-foreground/20 text-primary-foreground ring-1 ring-primary-foreground/30',
    icon: <OfflineMark />,
    heroImage: true,
  },
  {
    title: 'Role-based access',
    description:
      'Doctors, directors, managers, and volunteers see only what their role and clinic allow.',
    meta: 'RBAC',
    status: 'Enforced',
    tags: ['Security', 'Multi-site'],
    accentClass: 'bg-secondary/25 text-secondary-foreground ring-1 ring-secondary/40',
    icon: <RBACMark />,
  },
  {
    title: 'Structured encounters',
    description:
      'HTN and DM flows with vitals, drafts, peer review, and finalization built for real clinic velocity.',
    meta: 'HTN · DM',
    status: 'Live',
    tags: ['Workflow', 'Quality'],
    accentClass: 'bg-accent text-accent-foreground ring-1 ring-border',
    icon: <EncountersMark />,
  },
  {
    title: 'Prescriptions',
    description:
      'Medications tied to encounters and roles so the record stays coherent from screening to follow-up.',
    meta: 'In-context',
    status: 'Clinical',
    tags: ['Medication', 'Safety'],
    accentClass: 'bg-primary/10 text-primary ring-1 ring-primary/20',
    icon: <RxMark />,
  },
  {
    title: 'Audit by default',
    description:
      'Sensitive actions leave an immutable trail so compliance teams can trust what happened.',
    meta: 'Immutable',
    status: 'Compliant',
    tags: ['Audit', 'Research'],
    accentClass: 'bg-muted text-foreground ring-1 ring-border',
    icon: <AuditMark />,
  },
  {
    title: 'Multi-clinic operations',
    description:
      'One platform, many clinics: isolated patient data, per-site queues, and leadership dashboards.',
    meta: 'Unlimited sites',
    status: 'Scale',
    tags: ['Operations', 'Reporting'],
    accentClass: 'bg-landing-accent/20 text-landing-accent ring-1 ring-landing-accent/30',
    icon: <MultiClinicMark />,
  },
  {
    title: 'Patient portal',
    description:
      'Patients track BP and glucose from home, request appointments, and view their longitudinal trends.',
    meta: 'Self-service',
    status: 'Active',
    tags: ['Portal', 'Engagement'],
    accentClass: 'bg-secondary/15 text-secondary ring-1 ring-secondary/25',
    icon: <PortalMark />,
  },
  {
    title: 'Research exports',
    description:
      'De-identified data packs with consent gating, SHA-256 integrity, and approval workflows.',
    meta: 'HIPAA-aware',
    status: 'Ready',
    tags: ['Research', 'Export'],
    accentClass: 'bg-primary/10 text-primary ring-1 ring-primary/20',
    icon: <ExportMark />,
  },
];

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07 } },
};

const cardVariants = {
  hidden: { opacity: 0, y: 32 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, ease: [0.25, 0.4, 0.25, 1] as const },
  },
};

export function BentoFeaturesSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const isInView = useInView(sectionRef, { once: true, margin: '-60px' });
  const prefersReducedMotion = useReducedMotion();

  return (
    <section ref={sectionRef} id="product" className="scroll-mt-28 py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        {/* Section header */}
        <motion.div
          className="mx-auto max-w-3xl text-center"
          initial={prefersReducedMotion ? false : { opacity: 0, y: 24 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, ease: [0.25, 0.4, 0.25, 1] as const }}
        >
          <p className="font-landing-nav text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            Platform
          </p>
          <h2 className="mt-3 font-landing-heading text-3xl font-black lowercase tracking-tight text-foreground sm:text-4xl md:text-5xl">
            chronic-care emr capabilities—designed to feel inevitable
          </h2>
          <p className="mt-4 font-landing-body text-base text-muted-foreground sm:text-lg">
            Enterprise-grade patterns for patient management: structured workflows, resilient sync,
            and accountability without the legacy bloat.
          </p>
        </motion.div>

        {/* Bento grid */}
        <motion.div
          className="mt-14 grid auto-rows-[minmax(168px,auto)] grid-cols-1 gap-3 sm:gap-4 md:grid-cols-3"
          initial={prefersReducedMotion ? false : 'hidden'}
          animate={isInView ? 'visible' : 'hidden'}
          variants={containerVariants}
        >
          {features.map((feature, index) => (
            <motion.div
              key={`${feature.title}-${index}`}
              variants={cardVariants}
              className={cn(
                'group relative overflow-hidden rounded-2xl border border-border/70 shadow-sm backdrop-blur-sm',
                feature.heroImage ? '' : 'bg-card/90 p-5 hover:bg-card sm:p-6',
                landingCardHover,
                feature.colSpan === 2 ? 'md:col-span-2' : 'md:col-span-1',
                feature.rowSpan === 2 ? 'md:row-span-2' : 'md:row-span-1',
              )}
            >
              {/* Hero image card (Offline sync) */}
              {feature.heroImage && (
                <>
                  <Image
                    src="/images/Akomapa-17.jpg"
                    alt=""
                    fill
                    sizes="(max-width: 768px) 100vw, 66vw"
                    className="object-cover"
                    aria-hidden="true"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-primary/95 via-primary/80 to-primary/60" />
                </>
              )}

              {/* Grid texture (non-hero cards) */}
              {!feature.heroImage && (
                <div
                  className="pointer-events-none absolute inset-0 opacity-[0.35] transition-opacity duration-300 group-hover:opacity-60"
                  aria-hidden
                  style={{
                    backgroundImage: `radial-gradient(circle at center, hsl(var(--foreground) / 0.06) 1px, transparent 1px)`,
                    backgroundSize: '14px 14px',
                  }}
                />
              )}

              {/* Left accent rail */}
              <div
                className={cn(
                  'absolute left-0 top-0 h-full w-1 bg-gradient-to-b opacity-0 transition-all duration-300 group-hover:w-1.5 group-hover:opacity-100',
                  feature.heroImage
                    ? 'from-primary-foreground via-primary-foreground/40 to-transparent'
                    : 'from-primary via-primary/40 to-transparent',
                )}
                aria-hidden
              />

              <div
                className={cn(
                  'relative flex h-full min-h-0 flex-col gap-4',
                  feature.heroImage && 'p-5 sm:p-6',
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <motion.div
                    whileHover={prefersReducedMotion ? {} : { scale: 1.08 }}
                    className={cn(
                      'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-transform duration-300',
                      feature.accentClass,
                    )}
                  >
                    {feature.icon}
                  </motion.div>
                  <span
                    className={cn(
                      'shrink-0 rounded-full px-2.5 py-1 font-landing-nav text-[10px] font-semibold uppercase tracking-wide backdrop-blur-sm transition-colors duration-300',
                      feature.heroImage
                        ? 'border border-primary-foreground/30 bg-primary-foreground/15 text-primary-foreground'
                        : 'border border-border/80 bg-muted/80 text-muted-foreground group-hover:border-primary/25 group-hover:bg-primary/10 group-hover:text-primary',
                    )}
                  >
                    {feature.status}
                  </span>
                </div>

                <div className="min-h-0 flex-1 space-y-2">
                  <h3
                    className={cn(
                      'font-landing-heading text-lg font-bold lowercase leading-snug tracking-tight sm:text-xl',
                      feature.heroImage ? 'text-primary-foreground' : 'text-foreground',
                    )}
                  >
                    {feature.title}
                    {feature.meta && (
                      <span
                        className={cn(
                          'ml-2 font-landing-body text-xs font-normal normal-case',
                          feature.heroImage
                            ? 'text-primary-foreground/70'
                            : 'text-muted-foreground',
                        )}
                      >
                        · {feature.meta}
                      </span>
                    )}
                  </h3>
                  <p
                    className={cn(
                      'font-landing-body text-sm leading-relaxed',
                      feature.heroImage ? 'text-primary-foreground/90' : 'text-muted-foreground',
                    )}
                  >
                    {feature.description}
                  </p>
                </div>

                {feature.tags && feature.tags.length > 0 && (
                  <div
                    className={cn(
                      'flex flex-wrap items-center gap-2 border-t pt-3',
                      feature.heroImage ? 'border-primary-foreground/20' : 'border-border/50',
                    )}
                  >
                    {feature.tags.map((tag, i) => (
                      <span
                        key={i}
                        className={cn(
                          'rounded-full border px-2.5 py-0.5 font-landing-body text-[11px] font-medium transition-colors duration-200',
                          feature.heroImage
                            ? 'border-primary-foreground/25 bg-primary-foreground/10 text-primary-foreground/80'
                            : 'border-border/60 bg-background/80 text-muted-foreground group-hover:border-primary/20 group-hover:text-foreground',
                        )}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
