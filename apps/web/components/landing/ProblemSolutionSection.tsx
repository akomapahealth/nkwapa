"use client";

import { useRef, useEffect } from "react";
import { gsap } from "@/lib/gsap";
import { landingCardHover, landingPrimaryPanelHover } from "@/lib/landing-card-hover";

export function ProblemSolutionSection() {
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = gsap.context(() => {
      const cards = sectionRef.current?.querySelectorAll("[data-animate]");
      if (!cards?.length) return;
      gsap.fromTo(
        cards,
        { opacity: 0, y: 48 },
        {
          opacity: 1,
          y: 0,
          duration: 0.65,
          stagger: 0.18,
          ease: "power3.out",
          scrollTrigger: {
            trigger: sectionRef.current,
            start: "top 80%",
            toggleActions: "play none none reverse",
          },
        }
      );
    }, sectionRef);
    return () => ctx.revert();
  }, []);

  return (
    <section ref={sectionRef} className="py-16 md:py-24">
      <div className="mx-auto grid max-w-7xl gap-6 px-6 md:grid-cols-2 lg:px-8">
        <div
          data-animate
          className="relative overflow-hidden rounded-3xl bg-primary px-8 py-12 shadow-lg ring-1 ring-primary/20 md:px-12 md:py-16"
          style={{
            backgroundImage: `radial-gradient(1px 1px at 18% 22%, rgba(255,255,255,0.14) 0%, transparent 100%), radial-gradient(1px 1px at 82% 78%, rgba(255,255,255,0.1) 0%, transparent 100%)`,
          }}
        >
          <p className="font-landing-nav text-xs font-semibold uppercase tracking-[0.2em] text-primary-foreground/80">
            The gap
          </p>
          <h2 className="mt-4 font-landing-heading text-3xl font-black lowercase leading-tight text-primary-foreground md:text-4xl">
            chronic programs stall when tools ignore reality
          </h2>
          <p className="mt-5 font-landing-body text-base leading-relaxed text-primary-foreground/90">
            Spotty connectivity, fragmented paper, and generic EMRs that were never designed for{" "}
            <strong className="font-semibold text-primary-foreground">HTN and DM programs</strong> mean
            teams spend energy fighting software instead of closing care gaps.
          </p>
        </div>

        <div
          data-animate
          className={`relative overflow-hidden rounded-3xl border border-border bg-card px-8 py-12 shadow-sm ring-1 ring-black/[0.03] md:px-12 md:py-16 ${landingCardHover}`}
        >
          <p className="font-landing-nav text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            The shift
          </p>
          <h2 className="mt-4 font-landing-heading text-3xl font-black lowercase leading-tight text-foreground md:text-4xl">
            an emr that fits field conditions
          </h2>
          <p className="mt-5 font-landing-body text-base leading-relaxed text-muted-foreground">
            Nkwapa pairs <strong className="font-semibold text-foreground">offline resilience</strong> with{" "}
            <strong className="font-semibold text-foreground">audit-grade controls</strong>—so directors,
            clinicians, and volunteers share one truthful record across clinics.
          </p>
        </div>
      </div>
    </section>
  );
}
