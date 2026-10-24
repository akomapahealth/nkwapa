'use client';

import { useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(useGSAP, ScrollTrigger, SplitText);

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

          // The pin goes first so every trigger below it measures the page with the pin spacer in place.
          const journey = wide ? root.querySelector<HTMLElement>('[data-journey]') : null;
          if (journey) {
            journey.setAttribute('data-journey-pinned', '');
            const texts = gsap.utils.toArray<HTMLElement>('[data-step-text]', journey);
            const media = gsap.utils.toArray<HTMLElement>('[data-step-media]', journey);
            const n = texts.length;
            gsap.set(texts.slice(1), { autoAlpha: 0, y: 32 });
            gsap.set(media.slice(1), { clipPath: 'inset(100% 0% 0% 0%)' });

            const timeline = gsap.timeline({
              defaults: { ease: 'power2.inOut' },
              scrollTrigger: {
                trigger: journey,
                pin: true,
                start: 'center 55%',
                end: `+=${(n - 1) * 75}%`,
                scrub: 0.6,
                snap: { snapTo: 1 / (n - 1), duration: 0.4, delay: 0.1, inertia: false },
              },
            });
            timeline.fromTo(
              journey.querySelector('[data-journey-line]'),
              { scaleX: 1 / n },
              { scaleX: 1, ease: 'none', duration: n - 1 },
              0,
            );
            for (let i = 1; i < n; i++) {
              const at = i - 1;
              timeline
                .to(texts[i - 1], { autoAlpha: 0, y: -32, duration: 0.35 }, at + 0.1)
                .to(media[i], { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.8 }, at + 0.1)
                .from(media[i].querySelector('img'), { scale: 1.12, duration: 0.8 }, at + 0.1)
                .to(texts[i], { autoAlpha: 1, y: 0, duration: 0.35 }, at + 0.55);
            }
          }

          // The role deck: the top card is flung aside and tucked under the rest, once per role.
          const deck = wide ? root.querySelector<HTMLElement>('[data-deck]') : null;
          if (deck) {
            deck.setAttribute('data-deck-pinned', '');
            const texts = gsap.utils.toArray<HTMLElement>('[data-deck-text]', deck);
            const cards = gsap.utils.toArray<HTMLElement>('[data-deck-card]', deck);
            const n = cards.length;
            // Where the card k-th from the top sits: lower, smaller and slightly askew.
            const slot = (k: number) => ({
              y: k * 26,
              scale: 1 - k * 0.06,
              rotation: k === 0 ? 0 : k % 2 ? 3 : -3,
            });
            cards.forEach((card, k) =>
              gsap.set(card, { ...slot(k), zIndex: n - k, transformOrigin: '50% 100%' }),
            );
            gsap.set(texts.slice(1), { autoAlpha: 0, y: 32 });

            const timeline = gsap.timeline({
              scrollTrigger: {
                trigger: deck,
                pin: true,
                start: 'center 55%',
                end: `+=${(n - 1) * 80}%`,
                scrub: 0.6,
                snap: { snapTo: 'labels', duration: 0.4, delay: 0.1, inertia: false },
              },
            });
            // Each role holds for a moment before and after its shuffle, and scrolling settles on a role.
            const hold = 0.3;
            timeline.addLabel('role0', 0);
            const order = cards.map((_, k) => k);
            for (let i = 0; i < n - 1; i++) {
              const at = hold + i;
              const top = order.shift()!;
              order.push(top);
              timeline
                .to(
                  cards[top],
                  {
                    xPercent: -75,
                    yPercent: -12,
                    rotation: -14,
                    duration: 0.45,
                    ease: 'power2.in',
                  },
                  at,
                )
                .to(texts[i], { autoAlpha: 0, y: -32, duration: 0.3, ease: 'power2.in' }, at);
              order.forEach((card, k) => timeline.set(cards[card], { zIndex: n - k }, at + 0.45));
              timeline.to(
                cards[top],
                { ...slot(n - 1), xPercent: 0, yPercent: 0, duration: 0.5, ease: 'power2.out' },
                at + 0.45,
              );
              order
                .slice(0, -1)
                .forEach((card, k) =>
                  timeline.to(
                    cards[card],
                    { ...slot(k), duration: 0.55, ease: 'power2.inOut' },
                    at + 0.2,
                  ),
                );
              timeline.to(
                texts[i + 1],
                { autoAlpha: 1, y: 0, duration: 0.35, ease: 'power2.out' },
                at + 0.55,
              );
              timeline.addLabel(`role${i + 1}`, at + 1);
            }
            timeline.to({}, { duration: hold }, `role${n - 1}`);
          }

          // A pin spacer arrives after the browser has already scrolled to a #hash from another page.
          const target =
            (journey || deck) &&
            window.location.hash &&
            document.getElementById(window.location.hash.slice(1));
          if (target) {
            ScrollTrigger.refresh();
            target.scrollIntoView({ behavior: 'instant' });
          }

          root.querySelectorAll<HTMLElement>('[data-reveal]').forEach((el) => {
            gsap.from(el, {
              autoAlpha: 0,
              y: 32,
              duration: 0.8,
              ease: 'power3.out',
              scrollTrigger: { trigger: el, start: 'top 88%', once: true },
            });
          });

          // Headlines rise line by line from behind a mask.
          root.querySelectorAll<HTMLElement>('[data-split]').forEach((el) => {
            SplitText.create(el, {
              type: 'lines',
              mask: 'lines',
              autoSplit: true,
              onSplit: (self) =>
                gsap.from(self.lines, {
                  yPercent: 105,
                  duration: 0.9,
                  stagger: 0.08,
                  ease: 'power4.out',
                  scrollTrigger: { trigger: el, start: 'top 88%', once: true },
                }),
            });
          });

          // A statement that reads itself in as it scrolls past.
          root.querySelectorAll<HTMLElement>('[data-scrub-words]').forEach((el) => {
            const { words } = SplitText.create(el, { type: 'words' });
            gsap.fromTo(
              words,
              { opacity: 0.18 },
              {
                opacity: 1,
                stagger: 0.1,
                ease: 'none',
                scrollTrigger: { trigger: el, start: 'top 82%', end: 'bottom 45%', scrub: true },
              },
            );
          });

          // Photographs wipe up into place.
          root.querySelectorAll<HTMLElement>('[data-reveal-image]').forEach((el) => {
            const scrollTrigger = { trigger: el, start: 'top 85%', once: true };
            gsap.from(el, {
              clipPath: 'inset(100% 0% 0% 0%)',
              duration: 1.1,
              ease: 'power3.inOut',
              scrollTrigger,
            });
            gsap.from(el.querySelector('img'), {
              scale: 1.18,
              duration: 1.4,
              ease: 'power3.out',
              scrollTrigger,
            });
          });

          root.querySelectorAll<HTMLElement>('[data-marker]').forEach((el, index) => {
            gsap.from(el, {
              scale: 0.6,
              autoAlpha: 0,
              duration: 0.5,
              delay: index * 0.12,
              ease: 'back.out(2.2)',
              scrollTrigger: { trigger: el, start: 'top 75%', once: true },
            });
          });

          if (!wide) return;

          root.querySelectorAll<HTMLElement>('[data-parallax]').forEach((el) => {
            gsap.fromTo(
              el.querySelector('img'),
              { yPercent: -6, scale: 1.14 },
              {
                yPercent: 6,
                scale: 1.14,
                ease: 'none',
                scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: true },
              },
            );
          });

          // The scroll cue has done its job once the page starts moving.
          gsap.to(root.querySelector('[data-scroll-cue]'), {
            autoAlpha: 0,
            ease: 'none',
            scrollTrigger: { start: 0, end: 160, scrub: true },
          });

          const phone = root.querySelector('[data-hero-phone]');
          if (phone) {
            gsap.to(phone, {
              yPercent: -10,
              ease: 'none',
              scrollTrigger: { trigger: phone, start: 'top 70%', end: 'bottom top', scrub: true },
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

          return () => {
            journey?.removeAttribute('data-journey-pinned');
            deck?.removeAttribute('data-deck-pinned');
          };
        },
      );
    },
    { scope },
  );

  return <div ref={scope}>{children}</div>;
}
