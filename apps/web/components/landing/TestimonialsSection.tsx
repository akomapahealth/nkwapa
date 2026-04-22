'use client';

import { useRef, useState } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Quote } from 'lucide-react';
import { Button } from '@/components/ui/button';

const QUOTES = [
  {
    quote:
      'We finally have one record that survives clinic Wi-Fi dropping out. That alone changed how honest our hypertension data is.',
    name: 'Dr. Amara K.',
    role: 'Program lead, urban outpost clinics',
  },
  {
    quote:
      'Review queues for preceptors are clear, and audit tells us who touched what. For scale, that discipline matters.',
    name: 'James Mensah',
    role: 'Clinical operations director',
  },
  {
    quote:
      'Multi-clinic isolation was non-negotiable. Nkwapa keeps patients scoped per site without us running three parallel systems.',
    name: 'Elena Duarte',
    role: 'Health system PMO',
  },
  {
    quote:
      'Offline sync means our volunteers at market screenings capture every vital. When they get back to the clinic, it is all there.',
    name: 'Nana Ama Boateng',
    role: 'Community health coordinator',
  },
  {
    quote:
      'The de-identified research exports saved us months of manual anonymization. Consent gating gives our IRB confidence.',
    name: 'Prof. Kwame Asante',
    role: 'Principal investigator, chronic disease cohort',
  },
];

export function TestimonialsSection() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const sectionRef = useRef<HTMLElement>(null);
  const isInView = useInView(sectionRef, { once: true, margin: '-80px' });
  const prefersReducedMotion = useReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);

  const scrollTo = (index: number) => {
    const clamped = Math.max(0, Math.min(index, QUOTES.length - 1));
    setCurrentIndex(clamped);
    if (containerRef.current) {
      const cardWidth = containerRef.current.scrollWidth / QUOTES.length;
      containerRef.current.scrollTo({
        left: cardWidth * clamped,
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
      });
    }
  };

  const handleScroll = () => {
    if (!containerRef.current) return;
    const cardWidth = containerRef.current.scrollWidth / QUOTES.length;
    const newIndex = Math.round(containerRef.current.scrollLeft / cardWidth);
    if (newIndex !== currentIndex) setCurrentIndex(newIndex);
  };

  return (
    <section ref={sectionRef} className="py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        {/* Header */}
        <motion.div
          className="mx-auto max-w-2xl text-center"
          initial={prefersReducedMotion ? false : { opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
        >
          <p className="font-landing-nav text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            Proof, not hype
          </p>
          <h2 className="mt-3 font-landing-heading text-3xl font-black lowercase text-foreground sm:text-4xl">
            what teams say when the emr finally matches the mission
          </h2>
        </motion.div>

        {/* Carousel */}
        <motion.div
          className="mt-12"
          initial={prefersReducedMotion ? false : { opacity: 0, y: 24 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <div
            ref={containerRef}
            onScroll={handleScroll}
            className="flex snap-x snap-mandatory gap-5 overflow-x-auto scroll-smooth pb-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {QUOTES.map((t) => (
              <div key={t.name} className="w-[85%] shrink-0 snap-start sm:w-[45%] lg:w-[32%]">
                <div className="relative h-full rounded-2xl landing-glass border-white/40 p-6 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md">
                  {/* Decorative quote mark */}
                  <Quote className="absolute right-4 top-4 h-8 w-8 text-primary/10" aria-hidden />

                  <p className="relative font-landing-body text-sm leading-relaxed text-foreground">
                    &ldquo;{t.quote}&rdquo;
                  </p>
                  <div className="mt-6 border-t border-border/50 pt-4">
                    <p className="font-landing-heading text-sm font-semibold text-foreground">
                      {t.name}
                    </p>
                    <p className="mt-1 font-landing-body text-xs text-muted-foreground">{t.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Navigation */}
          <div className="mt-6 flex items-center justify-center gap-4">
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 rounded-full"
              onClick={() => scrollTo(currentIndex - 1)}
              disabled={currentIndex === 0}
              aria-label="Previous testimonial"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            <div className="flex gap-2">
              {QUOTES.map((_, i) => (
                <button
                  key={i}
                  onClick={() => scrollTo(i)}
                  className={`h-2 cursor-pointer rounded-full transition-all duration-300 ${
                    i === currentIndex
                      ? 'w-6 bg-primary'
                      : 'w-2 bg-border hover:bg-muted-foreground/40'
                  }`}
                  aria-label={`Go to testimonial ${i + 1}`}
                />
              ))}
            </div>

            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 rounded-full"
              onClick={() => scrollTo(currentIndex + 1)}
              disabled={currentIndex === QUOTES.length - 1}
              aria-label="Next testimonial"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
