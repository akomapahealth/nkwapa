import Image from 'next/image';
import { LANDING_BLUR } from '@/lib/landing-blur';
import { ArrowUpRight } from 'lucide-react';
import { AKOMAPA_HREF } from './links';
import { SectionRule } from './SectionRule';

/**
 * Akomapa, told with one photograph at full width. On wide screens LandingMotion opens the photograph
 * from the content width to the window edges as it scrolls in (clip-path only, so nothing reflows).
 */
export function ClinicalContextSection() {
  return (
    <section
      id="about"
      aria-labelledby="about-title"
      className="bg-background py-20 sm:py-28 lg:py-32"
    >
      <div className="landing-container">
        <SectionRule />
        <div className="mt-8 grid gap-8 lg:grid-cols-12 lg:items-end lg:gap-10" data-reveal>
          <h2
            id="about-title"
            data-split
            className="text-balance font-heading text-4xl font-semibold leading-[1.08] tracking-[-0.015em] sm:text-5xl lg:col-span-7"
          >
            Shaped by Akomapa&apos;s clinic days.
          </h2>
          <div className="lg:col-span-5">
            <p className="text-lg leading-relaxed text-foreground/80">
              Akomapa is a nonprofit running community screening and long-term care for hypertension
              and diabetes.
            </p>
            <a
              href={AKOMAPA_HREF}
              data-cta="akomapa"
              rel="noopener"
              className="mt-4 inline-flex min-h-11 items-center gap-1.5 rounded-sm font-semibold text-primary underline decoration-primary/40 underline-offset-4 transition-colors duration-fast hover:decoration-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Learn about Akomapa
              <ArrowUpRight className="h-4 w-4" aria-hidden />
            </a>
          </div>
        </div>
      </div>

      <div className="mt-14 lg:mt-20">
        <div data-expand className="relative h-[min(78svh,46rem)] min-h-[20rem] overflow-hidden">
          <Image
            src="/images/Akomapa-31.jpg"
            placeholder="blur"
            blurDataURL={LANDING_BLUR['/images/Akomapa-31.jpg']}
            alt="A gloved health worker prepares a finger-prick glucose test on a patient's hand."
            fill
            sizes="100vw"
            className="object-cover object-[40%_45%]"
          />
        </div>
      </div>
    </section>
  );
}
