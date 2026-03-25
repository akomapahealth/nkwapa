"use client";

import { useRef, useEffect } from "react";
import { gsap, ScrollTrigger } from "@/lib/gsap";
import { useKeycloak } from "@/app/KeycloakProvider";
import { landingCardHover, landingPrimaryPanelHover } from "@/lib/landing-card-hover";

export function TalentSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const { login } = useKeycloak() ?? {};

  useEffect(() => {
    if (typeof window === "undefined") return;
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) return;

    const ctx = gsap.context(() => {
      const els = sectionRef.current?.querySelectorAll("[data-animate]");
      if (!els?.length) return;

      gsap.fromTo(els, { opacity: 0, y: 40 }, {
        opacity: 1, y: 0, duration: 0.6, stagger: 0.15, ease: "power3.out",
        scrollTrigger: { trigger: sectionRef.current, start: "top 80%", toggleActions: "play none none reverse" },
      });
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  return (
    <section ref={sectionRef} className="py-16 md:py-24">
      <div className="mx-auto grid max-w-7xl gap-6 px-6 md:grid-cols-[1.2fr_1fr] lg:px-8">
        <div
          data-animate
          className="relative overflow-hidden rounded-2xl bg-primary px-8 py-10 md:px-12 md:py-14"
          style={{
            backgroundImage: `radial-gradient(1px 1px at 15% 25%, rgba(255,255,255,0.15) 0%, transparent 100%), radial-gradient(1px 1px at 85% 75%, rgba(255,255,255,0.1) 0%, transparent 100%)`,
          }}
        >
          <h2 className="font-landing-heading text-2xl font-bold lowercase text-white md:text-3xl">
            built for clinical teams
          </h2>
          <p className="mt-4 font-landing-body text-base text-white/90">
            Nkwapa is designed for doctors, preceptors, clinic directors, and community health volunteers.
            Each role gets purpose-built workflows — from patient screening to prescription management
            to research exports.
          </p>
          <p className="mt-3 font-landing-body text-base text-white/90">
            The platform handles the complexity of multi-clinic operations so your team can focus on
            what matters: patient care.
          </p>
          <button
            onClick={login}
            className="mt-6 cursor-pointer rounded-full border-2 border-white bg-transparent px-6 py-2.5 font-landing-nav text-sm font-semibold text-white transition-colors duration-200 hover:bg-white hover:text-primary"
          >
            Get Started
          </button>
        </div>

        <div
          data-animate
          className={`overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm ${landingCardHover}`}
        >
          <img
            src="https://images.unsplash.com/photo-1582750433449-648ed127bb54?w=600&q=80"
            alt="Healthcare team collaborating on patient records"
            className="h-full w-full object-cover"
            loading="lazy"
          />
        </div>
      </div>
    </section>
  );
}
