'use client';

import { useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(useGSAP, ScrollTrigger);

/**
 * Scroll motion for the landing page. Content is fully visible in the server HTML; everything here
 * is an enhancement that only runs without a reduced-motion preference, and useGSAP reverts it all
 * on unmount (including Strict Mode's double mount).
 */
export function LandingMotion({ children }: { children: React.ReactNode }) {
  const scope = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const root = scope.current;
      if (!root) return;
      const mm = gsap.matchMedia();

      mm.add(
        { motion: '(prefers-reduced-motion: no-preference)', wide: '(min-width: 1024px)' },
        (context) => {
          const { motion, wide } = context.conditions ?? {};
          if (!motion) return;

          root.querySelectorAll<HTMLElement>('[data-reveal]').forEach((el) => {
            gsap.from(el, {
              autoAlpha: 0,
              y: 32,
              duration: 0.8,
              ease: 'power3.out',
              scrollTrigger: { trigger: el, start: 'top 88%', once: true },
            });
          });

          if (!wide) return;

          const phone = root.querySelector('[data-hero-phone]');
          if (phone) {
            gsap.to(phone, {
              yPercent: -10,
              ease: 'none',
              scrollTrigger: { trigger: phone, start: 'top 70%', end: 'bottom top', scrub: true },
            });
          }

          const journey = root.querySelector('[data-journey]');
          if (journey) {
            const steps = journey.querySelectorAll('[data-journey-step]');
            const timeline = gsap.timeline({
              scrollTrigger: { trigger: journey, start: 'top 75%', end: 'bottom 60%', scrub: 0.6 },
            });
            timeline.from(journey.querySelector('[data-journey-line]'), {
              scaleX: 0,
              ease: 'none',
              duration: steps.length,
            });
            steps.forEach((step, index) => {
              timeline.from(step, { opacity: 0.35, duration: 0.5, ease: 'none' }, index);
            });
          }

          const showcase = root.querySelector('[data-showcase]');
          if (showcase) {
            gsap.from(showcase.firstElementChild, {
              scale: 0.94,
              transformOrigin: '50% 0%',
              ease: 'none',
              scrollTrigger: { trigger: showcase, start: 'top bottom', end: 'top 30%', scrub: 0.6 },
            });
          }
        },
      );
    },
    { scope },
  );

  return <div ref={scope}>{children}</div>;
}
