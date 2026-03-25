"use client";

import { useRef, useEffect } from "react";
import { gsap, ScrollTrigger } from "@/lib/gsap";
import { landingCardHover } from "@/lib/landing-card-hover";

const partners = [
  {
    name: "Global Health Initiative",
    description:
      "Supporting digital health infrastructure in underserved communities across Sub-Saharan Africa.",
  },
  {
    name: "Open Source Health",
    description:
      "Advancing open-source tools for healthcare delivery in low-resource settings worldwide.",
  },
];

export function PartnersSection() {
  const sectionRef = useRef<HTMLElement>(null);

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
    <section ref={sectionRef} className="bg-[#F8FAFC] py-16 md:py-24">
      <div className="mx-auto grid max-w-7xl gap-12 px-6 md:grid-cols-2 lg:px-8">
        <div>
          <h2
            data-animate
            className="font-landing-heading text-3xl font-black lowercase leading-tight text-[#0F172A] md:text-5xl"
          >
            special thank you<br />
            to our <span className="underline decoration-primary decoration-4 underline-offset-4">nkwapa</span><br />
            partners
          </h2>
          <p data-animate className="mt-6 font-landing-body text-base text-[#475569]">
            We are grateful for each partner that has supported the development of Nkwapa.
            From providing clinical feedback to funding infrastructure, there are many ways to
            get involved.
          </p>
          <a
            data-animate
            href="#"
            className="mt-4 inline-block font-landing-body text-sm font-semibold text-primary underline underline-offset-4 transition-opacity duration-200 hover:opacity-70 cursor-pointer"
          >
            learn more about becoming a partner
          </a>
        </div>

        <div className="space-y-5">
          {partners.map((p) => (
            <div
              key={p.name}
              data-animate
              className={`rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-sm ${landingCardHover}`}
            >
              <h3 className="font-landing-heading text-lg font-bold lowercase text-[#0F172A]">
                {p.name}
              </h3>
              <p className="mt-2 font-landing-body text-sm text-[#475569]">
                {p.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
