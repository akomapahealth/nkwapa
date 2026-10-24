import Image from 'next/image';
import { ArrowUpRight } from 'lucide-react';
import { AKOMAPA_HREF } from './links';

export function ClinicalContextSection() {
  return (
    <section
      id="about"
      aria-labelledby="about-title"
      className="bg-background py-20 sm:py-28 lg:py-32"
    >
      <div className="landing-container grid gap-12 lg:grid-cols-12 lg:gap-10">
        <div className="lg:col-span-5 lg:pt-4" data-reveal>
          <p className="text-eyebrow text-primary">About</p>
          <h2
            id="about-title"
            className="mt-3 text-balance font-heading text-4xl font-semibold leading-[1.08] tracking-[-0.015em] sm:text-5xl"
          >
            Designed around care teams, not just computer screens.
          </h2>
          <div className="mt-6 space-y-4 text-lg leading-relaxed text-foreground/80">
            <p>
              Nkwapa is developed in support of Akomapa, a nonprofit that runs community screening,
              education and long-term care for non-communicable diseases such as hypertension and
              diabetes.
            </p>
            <p>
              The clinic days in these photographs are the work the software is shaped around: blood
              pressure checks at a folding table, a finger-prick glucose test, an eye chart taped to
              a wall.
            </p>
          </div>
          <a
            href={AKOMAPA_HREF}
            data-cta="akomapa"
            rel="noopener"
            className="mt-8 inline-flex min-h-11 items-center gap-1.5 rounded-sm font-semibold text-primary underline decoration-primary/40 underline-offset-4 transition-colors duration-fast hover:decoration-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Learn about Akomapa
            <ArrowUpRight className="h-4 w-4" aria-hidden />
          </a>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:col-span-7" data-reveal>
          <Image
            src="/images/Akomapa-31.jpg"
            alt="A gloved health worker prepares a finger-prick glucose test on a patient's hand."
            width={3600}
            height={3337}
            sizes="(min-width: 1024px) 28vw, 50vw"
            className="col-span-2 aspect-[16/10] w-full rounded-xl object-cover"
          />
          <Image
            src="/images/Akomapa-34.jpg"
            alt="A volunteer points to letters on an eye chart while a seated patient reads them aloud."
            width={3093}
            height={3600}
            sizes="(min-width: 1024px) 28vw, 50vw"
            className="aspect-[4/5] w-full rounded-xl object-cover"
          />
          <Image
            src="/images/Akomapa-19.jpg"
            alt="A blood pressure cuff on a patient's arm during a screening at an Akomapa clinic."
            width={3600}
            height={2400}
            sizes="(min-width: 1024px) 28vw, 50vw"
            className="aspect-[4/5] w-full rounded-xl object-cover"
          />
        </div>
      </div>
    </section>
  );
}
