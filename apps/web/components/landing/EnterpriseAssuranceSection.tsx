'use client';

import { useRef } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import { Activity, Building2, Database, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const assurances = [
  { icon: ShieldCheck, label: 'Governance', value: 'Role-based access' },
  { icon: Database, label: 'Data controls', value: 'Clinic-scoped records' },
  { icon: Activity, label: 'Operations', value: 'Audit-ready workflows' },
];

const controlRows = [
  { label: 'Access policy', value: 'RBAC enforced', tone: 'bg-primary/12 text-primary' },
  { label: 'Record boundaries', value: 'Clinic scoped', tone: 'bg-muted text-muted-foreground' },
  { label: 'Review trail', value: 'Traceable', tone: 'bg-secondary/20 text-secondary' },
];

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.25, 0.4, 0.25, 1] as const },
  },
};

export function EnterpriseAssuranceSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const isInView = useInView(sectionRef, { once: true, margin: '-80px' });
  const prefersReducedMotion = useReducedMotion();

  return (
    <section ref={sectionRef} className="border-t border-border bg-muted/20 py-16 md:py-24">
      <div className="mx-auto grid max-w-7xl gap-12 px-6 md:grid-cols-2 md:items-center lg:px-8">
        <motion.div
          initial={prefersReducedMotion ? false : 'hidden'}
          animate={isInView ? 'visible' : 'hidden'}
          variants={stagger}
        >
          <motion.div variants={fadeUp}>
            <p className="font-landing-nav text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              Enterprise assurance
            </p>
            <h2 className="mt-3 font-landing-heading text-3xl font-black lowercase leading-tight text-foreground md:text-4xl">
              ready for governed clinical operations
            </h2>
          </motion.div>
          <motion.p
            variants={fadeUp}
            className="mt-4 font-landing-body text-base leading-relaxed text-muted-foreground"
          >
            Nkwapa is built for health systems that need reliable chronic care operations across
            clinics: accountable permissions, clean data boundaries, and workflows teams can trust
            in the field.
          </motion.p>
          <motion.div variants={fadeUp} className="mt-6 flex flex-wrap gap-3">
            {assurances.map((assurance) => {
              const Icon = assurance.icon;
              return (
                <Badge
                  key={assurance.label}
                  variant="outline"
                  className="gap-2 rounded-full border-border/70 bg-background px-3 py-1.5 font-landing-body text-xs font-medium text-foreground"
                >
                  <Icon className="h-3.5 w-3.5 text-primary" aria-hidden />
                  {assurance.label}: {assurance.value}
                </Badge>
              );
            })}
          </motion.div>
        </motion.div>

        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 32 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7, delay: 0.2 }}
          className="overflow-hidden rounded-2xl border border-border bg-card shadow-xl ring-1 ring-black/[0.03]"
        >
          <div className="border-b border-border bg-background/70 px-5 py-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-landing-nav text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">
                  Control plane
                </p>
                <h3 className="mt-1 font-landing-heading text-xl font-black lowercase text-foreground">
                  clinic operations
                </h3>
              </div>
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Building2 className="h-5 w-5" aria-hidden />
              </span>
            </div>
          </div>
          <div className="space-y-3 p-5">
            {controlRows.map((row, index) => (
              <motion.div
                key={row.label}
                initial={prefersReducedMotion ? false : { opacity: 0, x: 18 }}
                animate={isInView ? { opacity: 1, x: 0 } : {}}
                transition={{ delay: 0.4 + index * 0.12, duration: 0.4, ease: 'easeOut' }}
                className="flex items-center justify-between gap-4 rounded-xl border border-border/70 bg-background/80 px-4 py-3"
              >
                <span className="font-landing-body text-sm font-medium text-foreground">
                  {row.label}
                </span>
                <span
                  className={`rounded-full px-3 py-1 font-landing-nav text-[10px] font-semibold ${row.tone}`}
                >
                  {row.value}
                </span>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
