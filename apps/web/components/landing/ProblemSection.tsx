import Image from 'next/image';
import { LANDING_BLUR } from '@/lib/landing-blur';
import { SectionRule } from './SectionRule';

export function ProblemSection() {
  return (
    <section
      id="problem"
      aria-labelledby="problem-title"
      className="bg-background py-20 sm:py-28 lg:py-32"
    >
      <div className="landing-container grid gap-x-16 gap-y-12 lg:grid-cols-12">
        <SectionRule className="lg:col-span-12" />
        <div className="lg:col-span-7 lg:self-center" data-reveal>
          <h2
            id="problem-title"
            data-split
            className="text-balance font-heading text-4xl font-semibold leading-[1.08] tracking-[-0.015em] sm:text-5xl lg:text-[3.4rem]"
          >
            Care breaks down between stations.
          </h2>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            One patient can meet five people at a screening. When each writes somewhere different,
            the doctor works from fragments.
          </p>
        </div>

        <div className="lg:col-span-5">
          <div data-reveal-image className="overflow-hidden">
            <Image
              src="/images/Akomapa-14.jpg"
              placeholder="blur"
              blurDataURL={LANDING_BLUR['/images/Akomapa-14.jpg']}
              alt="A volunteer in a white coat writes on a paper form while a patient leans in beside him at a screening."
              width={3600}
              height={2218}
              sizes="(min-width: 1024px) 40vw, 100vw"
              className="aspect-[4/3] w-full object-cover lg:aspect-[4/5]"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
