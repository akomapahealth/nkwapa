import { ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AKOMAPA_HREF, CONTACT_HREF } from './links';
import { DesktopFrame, PhoneFrame } from './ProductFrames';

export function HeroSection() {
  return (
    <section id="top" aria-labelledby="hero-title" className="overflow-hidden bg-accent">
      <div className="landing-container grid gap-14 pb-20 pt-12 sm:pt-16 lg:grid-cols-12 lg:items-center lg:gap-10 lg:pb-28 lg:pt-20">
        <div className="lg:col-span-6 xl:col-span-5">
          <p className="motion-safe:animate-landing-rise text-sm font-semibold text-primary">
            Electronic medical records for hypertension and diabetes care
          </p>
          <h1
            id="hero-title"
            className="mt-4 motion-safe:animate-landing-rise text-balance font-heading text-[2.5rem] font-semibold leading-[1.04] tracking-[-0.02em] [animation-delay:60ms] sm:text-6xl lg:text-[3.4rem] xl:text-[3.85rem]"
          >
            Patient records and clinic workflows, in one place.
          </h1>
          <p className="mt-6 max-w-xl motion-safe:animate-landing-rise text-lg leading-relaxed text-foreground/80 [animation-delay:120ms]">
            Nkwapa connects registration, vital signs, clinical visits, doctor review and follow-up,
            so everyone on a care team can see what happened and what comes next, even when the
            clinic&apos;s internet drops.
          </p>
          <div className="mt-9 flex motion-safe:animate-landing-rise flex-col gap-3 [animation-delay:180ms] sm:flex-row">
            <Button asChild size="lg">
              <a href={CONTACT_HREF} data-cta="contact">
                Contact the team
              </a>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href={AKOMAPA_HREF} data-cta="akomapa" rel="noopener">
                Learn about Akomapa
                <ArrowUpRight aria-hidden />
              </a>
            </Button>
          </div>
          <p className="mt-8 motion-safe:animate-landing-rise text-sm text-foreground/70 [animation-delay:240ms]">
            Developed in support of Akomapa&apos;s community clinics in Ghana.
          </p>
        </div>

        <div className="relative lg:col-span-6 xl:col-span-7">
          <DesktopFrame
            priority
            sizes="(min-width: 1216px) 700px, (min-width: 1024px) 58vw, (min-width: 640px) 92vw, 1px"
            className="hidden motion-safe:animate-landing-settle sm:block"
          />
          <div
            data-hero-phone
            className="mx-auto w-[64%] max-w-[17rem] motion-safe:animate-landing-settle [animation-delay:120ms] sm:absolute sm:-bottom-12 sm:left-4 sm:mx-0 sm:w-[24%] lg:-left-3 lg:w-[26%]"
          >
            <PhoneFrame sizes="(min-width: 640px) 220px, 64vw" priority />
          </div>
        </div>
      </div>
    </section>
  );
}
