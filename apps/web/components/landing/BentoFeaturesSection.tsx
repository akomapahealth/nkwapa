"use client";

import type { ReactNode } from "react";
import { useRef, useEffect } from "react";
import { gsap, ScrollTrigger } from "@/lib/gsap";
import { landingCardHover } from "@/lib/landing-card-hover";
import { cn } from "@/lib/utils";

export interface BentoFeature {
  title: string;
  description: string;
  meta?: string;
  status?: string;
  tags?: string[];
  colSpan?: number;
  rowSpan?: number;
  /** Tailwind classes for the icon well (theme-aligned) */
  accentClass?: string;
  icon?: ReactNode;
}

/** Abstract marks — lightweight, no external assets */
function OfflineMark() {
  return (
    <div className="relative h-5 w-5" aria-hidden>
      <div className="absolute inset-0 rounded-full border-2 border-primary/80" />
      <div className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary" />
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

function MultiClinicMark() {
  return (
    <div className="relative h-5 w-5" aria-hidden>
      <div className="absolute left-0 top-0 h-4 w-4 rounded-md border-2 border-chart-3" />
      <div className="absolute bottom-0 right-0 h-4 w-4 rounded-md border-2 border-chart-3 bg-card" />
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

const NKWAPA_BENTO_FEATURES: BentoFeature[] = [
  {
    title: "Offline sync",
    description:
      "Document encounters without connectivity. Nkwapa reconciles quietly when the network returns—no lost vitals, no duplicate rows.",
    meta: "Outbox model",
    status: "Always on",
    tags: ["PWA", "Resilience"],
    colSpan: 2,
    rowSpan: 2,
    accentClass: "bg-primary/15 text-primary ring-1 ring-primary/25",
    icon: <OfflineMark />,
  },
  {
    title: "Role-based access",
    description:
      "Doctors, preceptors, directors, and volunteers see only what their role and clinic allow—scoped with clear guardrails.",
    meta: "RBAC",
    status: "Enforced",
    tags: ["Security", "Multi-site"],
    colSpan: 1,
    rowSpan: 1,
    accentClass: "bg-secondary/25 text-secondary-foreground ring-1 ring-secondary/40",
    icon: <RBACMark />,
  },
  {
    title: "Structured encounters",
    description:
      "Hypertension and diabetes flows with vitals, drafts, peer review, and finalization built for real clinic velocity.",
    meta: "HTN · DM",
    status: "Live",
    tags: ["Workflow", "Quality"],
    colSpan: 1,
    rowSpan: 1,
    accentClass: "bg-accent text-accent-foreground ring-1 ring-border",
    icon: <EncountersMark />,
  },
  {
    title: "Prescriptions",
    description:
      "Medications tied to encounters and roles so the record stays coherent from screening to follow-up.",
    meta: "In-context",
    status: "Clinical",
    tags: ["Medication", "Safety"],
    colSpan: 1,
    rowSpan: 1,
    accentClass: "bg-primary/10 text-primary ring-1 ring-primary/20",
    icon: <RxMark />,
  },
  {
    title: "Audit by default",
    description:
      "Sensitive actions leave an immutable trail so compliance and quality teams can trust what happened, when, and by whom.",
    meta: "Immutable",
    status: "Compliant",
    tags: ["Audit", "Research"],
    colSpan: 1,
    rowSpan: 1,
    accentClass: "bg-muted text-foreground ring-1 ring-border",
    icon: <AuditMark />,
  },
  {
    title: "Multi-clinic operations",
    description:
      "One platform, many clinics: isolated patient data, per-site queues, and leadership dashboards without data bleed.",
    meta: "Unlimited sites",
    status: "Scale",
    tags: ["Operations", "Reporting"],
    colSpan: 1,
    rowSpan: 1,
    accentClass: "bg-chart-3/20 text-chart-3 ring-1 ring-chart-3/30",
    icon: <MultiClinicMark />,
  },
];

interface ChronicCareEMRBentoGridProps {
  features?: BentoFeature[];
  className?: string;
}

export function ChronicCareEMRBentoGrid({
  features = NKWAPA_BENTO_FEATURES,
  className,
}: ChronicCareEMRBentoGridProps) {
  return (
    <div className={cn("w-full", className)}>
      <div className="grid auto-rows-[minmax(168px,auto)] grid-cols-1 gap-3 sm:gap-4 md:grid-cols-3">
        {features.map((feature, index) => (
          <div
            key={`${feature.title}-${index}`}
            data-bento-card
            className={cn(
              "group relative overflow-hidden rounded-2xl border border-border/70 bg-card/90 p-5 shadow-sm backdrop-blur-sm sm:p-6",
              "hover:bg-card",
              landingCardHover,
              feature.colSpan === 2 ? "md:col-span-2" : "md:col-span-1",
              feature.rowSpan === 2 ? "md:row-span-2" : "md:row-span-1"
            )}
          >
            {/* Soft grid texture — visible at rest, stronger on hover */}
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.35] transition-opacity duration-300 group-hover:opacity-60"
              aria-hidden
              style={{
                backgroundImage: `radial-gradient(circle at center, hsl(var(--foreground) / 0.06) 1px, transparent 1px)`,
                backgroundSize: "14px 14px",
              }}
            />

            {/* Top sheen */}
            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-primary/[0.07] to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100"
              aria-hidden
            />

            {/* Left accent rail */}
            <div
              className="absolute left-0 top-0 h-full w-1 bg-gradient-to-b from-primary via-primary/40 to-transparent opacity-0 transition-all duration-300 group-hover:w-1.5 group-hover:opacity-100"
              aria-hidden
            />

            {/* Outer gradient frame (pseudo-border glow) */}
            <div
              className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-br from-primary/25 via-transparent to-secondary/20 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
              style={{ maskImage: "linear-gradient(white, white) content-box, linear-gradient(white, white)", WebkitMaskComposite: "xor", maskComposite: "exclude", padding: "1px" }}
              aria-hidden
            />
            <div
              className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-transparent transition-all duration-300 group-hover:ring-primary/15"
              aria-hidden
            />

            <div className="relative flex h-full min-h-0 flex-col gap-4">
              <div className="flex items-start justify-between gap-3">
                <div
                  className={cn(
                    "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-105",
                    feature.accentClass ?? "bg-primary/10 text-primary ring-1 ring-primary/20"
                  )}
                >
                  {feature.icon ?? (
                    <div className="h-5 w-5 rounded-sm bg-current opacity-50" aria-hidden />
                  )}
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2.5 py-1 font-landing-nav text-[10px] font-semibold uppercase tracking-wide",
                    "border border-border/80 bg-muted/80 text-muted-foreground backdrop-blur-sm",
                    "transition-colors duration-300 group-hover:border-primary/25 group-hover:bg-primary/10 group-hover:text-primary"
                  )}
                >
                  {feature.status ?? "Active"}
                </span>
              </div>

              <div className="min-h-0 flex-1 space-y-2">
                <h3 className="font-landing-heading text-lg font-bold lowercase leading-snug tracking-tight text-foreground sm:text-xl">
                  {feature.title}
                  {feature.meta ? (
                    <span className="ml-2 font-landing-body text-xs font-normal normal-case text-muted-foreground">
                      · {feature.meta}
                    </span>
                  ) : null}
                </h3>
                <p className="font-landing-body text-sm leading-relaxed text-muted-foreground">
                  {feature.description}
                </p>
              </div>

              {feature.tags && feature.tags.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2 border-t border-border/50 pt-3">
                  {feature.tags.map((tag, i) => (
                    <span
                      key={i}
                      className="rounded-full border border-border/60 bg-background/80 px-2.5 py-0.5 font-landing-body text-[11px] font-medium text-muted-foreground transition-colors duration-200 group-hover:border-primary/20 group-hover:text-foreground"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function BentoFeaturesSection() {
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = gsap.context(() => {
      const cards = sectionRef.current?.querySelectorAll("[data-bento-card]");
      if (!cards?.length) return;
      gsap.fromTo(
        cards,
        { opacity: 0, y: 36 },
        {
          opacity: 1,
          y: 0,
          duration: 0.6,
          stagger: 0.07,
          ease: "power3.out",
          scrollTrigger: {
            trigger: sectionRef.current,
            start: "top 82%",
            toggleActions: "play none none reverse",
          },
        }
      );
    }, sectionRef);
    return () => ctx.revert();
  }, []);

  return (
    <section ref={sectionRef} id="product" className="scroll-mt-28 py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <p className="font-landing-nav text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            Platform
          </p>
          <h2 className="mt-3 font-landing-heading text-3xl font-black lowercase tracking-tight text-foreground sm:text-4xl md:text-5xl">
            chronic-care emr capabilities—designed to feel inevitable
          </h2>
          <p className="mt-4 font-landing-body text-base text-muted-foreground sm:text-lg">
            Enterprise-grade patterns for patient management: structured workflows, resilient sync, and
            accountability without the legacy bloat.
          </p>
        </div>

        <div className="mt-14">
          <ChronicCareEMRBentoGrid />
        </div>
      </div>
    </section>
  );
}
