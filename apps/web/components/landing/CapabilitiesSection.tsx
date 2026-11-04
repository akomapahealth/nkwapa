import Image from 'next/image';
import { LANDING_BLUR } from '@/lib/landing-blur';
import { SectionRule } from './SectionRule';

const SUPPORTING = [
  {
    title: 'Hypertension and diabetes, step by step.',
    text: 'Guided interviews end in a care plan with counseling, medication and a follow-up date.',
  },
  {
    title: 'Several clinics, one organization.',
    text: 'A person can hold different roles at different clinics, and organization reports bring the numbers together.',
  },
];

export function CapabilitiesSection() {
  return (
    <section aria-labelledby="capabilities-title" className="bg-accent py-20 sm:py-28">
      <div className="landing-container">
        <SectionRule />
        <h2
          id="capabilities-title"
          data-split
          className="mt-8 max-w-3xl text-balance font-heading text-4xl font-semibold leading-[1.08] tracking-[-0.015em] sm:text-5xl"
          data-reveal
        >
          Built for clinic conditions.
        </h2>

        <div className="mt-12 grid gap-12 lg:mt-16 lg:grid-cols-12 lg:gap-10">
          <article className="lg:col-span-7" data-reveal>
            <div>
              <div data-reveal-image className="overflow-hidden">
                <Image
                  src="/images/Akomapa-19.jpg"
                  placeholder="blur"
                  blurDataURL={LANDING_BLUR['/images/Akomapa-19.jpg']}
                  alt="A volunteer takes a woman's blood pressure at a folding table during an Akomapa screening."
                  width={3600}
                  height={2400}
                  sizes="(min-width: 1024px) 55vw, 100vw"
                  className="aspect-[16/9] w-full object-cover"
                />
              </div>
            </div>
            <h3 className="mt-8 border-t-2 border-foreground pt-6 font-heading text-3xl font-semibold leading-tight sm:text-4xl">
              Keeps working when the internet doesn&apos;t.
            </h3>
            <p className="mt-4 text-lg leading-relaxed text-foreground/80">
              Registration, visits, vital signs, consent and prescriptions save on the device and
              send when the connection returns. Conflicting edits wait for a person to resolve.
            </p>
            <p className="mt-4 text-sm text-muted-foreground">
              Assigning staff and moving patients between stations still need a connection.
            </p>
          </article>

          <div className="flex flex-col gap-10 lg:col-span-5 lg:pt-6" data-reveal>
            {SUPPORTING.map((item) => (
              <article key={item.title} className="border-t-2 border-foreground pt-6">
                <h3 className="font-heading text-2xl font-semibold leading-snug">{item.title}</h3>
                <p className="mt-3 text-lg leading-relaxed text-foreground/80">{item.text}</p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
