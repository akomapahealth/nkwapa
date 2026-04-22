'use client';

import { useRef } from 'react';
import Image from 'next/image';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import { ParallaxImage } from './shared/ParallaxImage';

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 36 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.25, 0.4, 0.25, 1] as const },
  },
};

export function OurStorySection() {
  const sectionRef = useRef<HTMLElement>(null);
  const isInView = useInView(sectionRef, { once: true, margin: '-80px' });
  const prefersReducedMotion = useReducedMotion();

  return (
    <section ref={sectionRef} id="our-story" className="scroll-mt-28 py-16 md:py-24">
      <div className="mx-auto grid max-w-7xl gap-12 px-6 md:grid-cols-2 md:items-center lg:px-8">
        {/* Left — story text */}
        <motion.div
          initial={prefersReducedMotion ? false : 'hidden'}
          animate={isInView ? 'visible' : 'hidden'}
          variants={stagger}
        >
          <motion.h2
            variants={fadeUp}
            className="font-landing-heading text-3xl font-black lowercase italic leading-tight text-foreground md:text-5xl"
          >
            our story
          </motion.h2>
          <motion.div
            variants={fadeUp}
            className="mt-6 space-y-4 font-landing-body text-base text-muted-foreground"
          >
            <p>
              Nkwapa is an open-source EMR built for clinics managing hypertension and diabetes in
              low-resource settings. We believe that{' '}
              <strong className="font-semibold text-foreground">
                reliable patient records should not depend on internet connectivity.
              </strong>
            </p>
            <p>
              Our offline-first PWA syncs automatically when connectivity returns, with role-based
              access control and audit-by-default so every action is traceable.
            </p>
            <p>
              Built as a multi-clinic platform, Nkwapa lets health systems manage multiple sites
              from a single dashboard with clinic-scoped data isolation.
            </p>
          </motion.div>
          <motion.a
            variants={fadeUp}
            href="#product"
            onClick={(e) => {
              e.preventDefault();
              document.getElementById('product')?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="mt-6 inline-block cursor-pointer font-landing-body text-sm font-semibold text-foreground underline underline-offset-4 transition-opacity duration-200 hover:opacity-70"
          >
            explore product capabilities
          </motion.a>
        </motion.div>

        {/* Right — overlapping photo composition */}
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 40 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7, delay: 0.2, ease: [0.25, 0.4, 0.25, 1] as const }}
          className="relative"
        >
          {/* Primary image */}
          <ParallaxImage
            src="/images/Akomapa-3.jpg"
            alt="Akomapa volunteer conducting patient intake with a laptop at a community clinic"
            speed={0.1}
            className="aspect-[4/3] w-full rounded-2xl border border-border/70 shadow-lg"
            priority={false}
          />

          {/* Overlapping secondary image */}
          <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.9, rotate: 0 }}
            animate={isInView ? { opacity: 1, scale: 1, rotate: 2 } : {}}
            transition={{ duration: 0.6, delay: 0.5, ease: [0.25, 0.4, 0.25, 1] as const }}
            className="absolute -bottom-6 -right-4 hidden w-[45%] md:block"
          >
            <div className="overflow-hidden rounded-xl border-4 border-background shadow-xl">
              <Image
                src="/images/Akomapa-14.jpg"
                alt="Akomapa medical student documenting a patient encounter"
                width={400}
                height={300}
                className="aspect-[4/3] w-full object-cover"
                sizes="(max-width: 768px) 0vw, 25vw"
                loading="lazy"
              />
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
