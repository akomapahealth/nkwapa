import Image from 'next/image';
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
        <SectionRule>About</SectionRule>
        <div className="mt-8 grid gap-8 lg:grid-cols-12 lg:items-end lg:gap-10" data-reveal>
          <h2
            id="about-title"
            data-split
            className="text-balance font-heading text-4xl font-semibold leading-[1.08] tracking-[-0.015em] sm:text-5xl lg:col-span-7"
          >
            Designed around care teams, not just computer screens.
          </h2>
          <p className="text-lg leading-relaxed text-foreground/80 lg:col-span-5">
            Nkwapa is developed in support of Akomapa, a nonprofit that runs community screening,
            education and long-term care for non-communicable diseases such as hypertension and
            diabetes.
          </p>
        </div>
      </div>

      <figure className="mt-14 lg:mt-20">
        <div data-expand className="relative h-[min(78svh,46rem)] min-h-[20rem] overflow-hidden">
          <Image
            src="/images/Akomapa-31.jpg"
            alt="A gloved health worker prepares a finger-prick glucose test on a patient's hand."
            fill
            sizes="100vw"
            className="object-cover object-[40%_45%]"
          />
        </div>
        <figcaption className="landing-container mt-3 text-sm text-muted-foreground">
          A finger-prick glucose test at an Akomapa screening.
        </figcaption>
      </figure>

      <div className="landing-container mt-14 grid gap-8 lg:mt-20 lg:grid-cols-12 lg:gap-10">
        <p
          className="border-t-2 border-foreground pt-6 font-heading text-2xl leading-snug sm:text-3xl lg:col-span-7"
          data-reveal
        >
          The clinic days in these photographs are the work the software is shaped around: blood
          pressure checks at a folding table, a finger-prick glucose test, an eye chart taped to a
          wall.
        </p>
        <div className="lg:col-span-4 lg:col-start-9 lg:pt-6" data-reveal>
          <a
            href={AKOMAPA_HREF}
            data-cta="akomapa"
            rel="noopener"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-sm font-semibold text-primary underline decoration-primary/40 underline-offset-4 transition-colors duration-fast hover:decoration-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Learn about Akomapa
            <ArrowUpRight className="h-4 w-4" aria-hidden />
          </a>
        </div>
      </div>
    </section>
  );
}
