"use client";

import { useRef, useEffect } from "react";
import { gsap, ScrollTrigger } from "@/lib/gsap";
import { landingCardHover } from "@/lib/landing-card-hover";

export function OurStorySection() {
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) return;

    const ctx = gsap.context(() => {
      const els = sectionRef.current?.querySelectorAll("[data-animate]");
      if (!els?.length) return;

      gsap.fromTo(
        els,
        { opacity: 0, y: 40 },
        {
          opacity: 1,
          y: 0,
          duration: 0.6,
          stagger: 0.15,
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
    <section ref={sectionRef} id="our-story" className="scroll-mt-28 py-16 md:py-24">
      <div className="mx-auto grid max-w-7xl gap-12 px-6 md:grid-cols-2 md:items-center lg:px-8">
        <div>
          <h2
            data-animate
            className="font-landing-heading text-3xl font-black lowercase italic leading-tight text-foreground md:text-5xl"
          >
            our story
          </h2>
          <div data-animate className="mt-6 space-y-4 font-landing-body text-base text-muted-foreground">
            <p>
              Nkwapa is an open-source EMR built for clinics managing hypertension and diabetes in
              low-resource settings. We believe that{" "}
              <strong className="font-semibold text-foreground">reliable patient records should not depend on internet connectivity.</strong>
            </p>
            <p>
              Our offline-first PWA syncs automatically when connectivity returns, with role-based access
              control and audit-by-default so every action is traceable.
            </p>
            <p>
              Built as a multi-clinic platform, Nkwapa lets health systems manage
              multiple sites from a single dashboard with clinic-scoped data isolation.
            </p>
          </div>
          <a
            data-animate
            href="#product"
            className="mt-6 inline-block font-landing-body text-sm font-semibold text-foreground underline underline-offset-4 transition-opacity duration-200 hover:opacity-70 cursor-pointer"
          >
            explore product capabilities
          </a>
        </div>

        <div
          data-animate
          className={`overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm ${landingCardHover}`}
        >
          <img
            src="https://images.unsplash.com/photo-1631815588090-d4bfec5b1ccb?w=800&q=80"
            alt="Doctor checking patient blood pressure in a clinic"
            className="h-auto w-full object-cover"
            loading="lazy"
          />
        </div>
      </div>
    </section>
  );
}
