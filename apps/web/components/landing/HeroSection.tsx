import Image from 'next/image';
import { ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AKOMAPA_HREF, CONTACT_HREF } from './links';
import { PhoneFrame } from './ProductFrames';

/**
 * A clinic photograph fills the first screen; the copy sits on a dark scrim at its foot, so the hero
 * reads the same in light and dark. The photograph is the LCP: it is preloaded, visible from the first
 * frame, and moves only by transform (LandingMotion drifts it on scroll, wide screens only).
 */
export function HeroSection() {
  return (
    <section
      id="top"
      aria-labelledby="hero-title"
      className="relative isolate flex min-h-[calc(100svh-4rem)] flex-col overflow-hidden lg:justify-end bg-[hsl(200_25%_8%)] text-white"
    >
      <div
        data-hero-photo
        className="relative h-[36svh] min-h-[15rem] lg:absolute lg:inset-0 lg:-z-10 lg:h-auto"
      >
        <Image
          src="/images/Akomapa-17.jpg"
          alt="A volunteer in an Akomapa shirt writes down a reading while a woman's blood pressure is taken at a community screening."
          fill
          loading="eager"
          fetchPriority="high"
          sizes="100vw"
          className="object-cover object-[12%_30%] lg:object-[22%_30%]"
        />
        {/* Narrow screens stack the copy under the photograph; wide screens set it on the photograph's
            foot, darkest where the copy sits, so the volunteer's face stays clear at the top. */}
        <div
          aria-hidden
          className="absolute inset-0 bg-[linear-gradient(to_top,hsl(200_25%_8%)_0%,transparent_40%)] lg:bg-[linear-gradient(to_top,hsl(200_25%_6%/0.92)_0%,hsl(200_25%_6%/0.7)_45%,hsl(200_25%_6%/0.15)_85%)]"
        />
      </div>

      <div className="landing-container grid gap-10 pb-10 pt-2 sm:pt-6 lg:grid-cols-12 lg:items-end lg:pb-14 lg:pt-56">
        <div className="lg:col-span-8">
          <p className="border-t-2 border-white pt-4 text-sm font-semibold motion-safe:animate-landing-rise">
            Electronic medical records for hypertension and diabetes care
          </p>
          <h1
            id="hero-title"
            className="mt-6 text-balance font-heading text-[2.6rem] font-semibold leading-[1.02] tracking-[-0.02em] motion-safe:animate-landing-rise [animation-delay:60ms] sm:text-6xl lg:text-[4.4rem] xl:text-[5rem]"
          >
            Patient records and clinic workflows, in one place.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-white/90 motion-safe:animate-landing-rise [animation-delay:120ms] sm:text-xl">
            Nkwapa connects registration, vital signs, clinical visits, doctor review and follow-up,
            so everyone on a care team can see what happened and what comes next, even when the
            clinic&apos;s internet drops.
          </p>
          <div className="mt-9 flex flex-col gap-3 motion-safe:animate-landing-rise [animation-delay:180ms] sm:flex-row">
            <Button
              asChild
              size="lg"
              variant="gold"
              className="focus-visible:ring-white focus-visible:ring-offset-[hsl(200_25%_8%)]"
            >
              <a href={CONTACT_HREF} data-cta="contact">
                Contact the team
              </a>
            </Button>
            <Button
              asChild
              size="lg"
              variant="ghost"
              className="border border-white/70 text-white hover:bg-white/10 hover:text-white focus-visible:ring-white focus-visible:ring-offset-[hsl(200_25%_8%)]"
            >
              <a href={AKOMAPA_HREF} data-cta="akomapa" rel="noopener">
                Learn about Akomapa
                <ArrowUpRight aria-hidden />
              </a>
            </Button>
          </div>
        </div>

        <figure
          data-hero-phone
          className="hidden motion-safe:animate-landing-settle [animation-delay:200ms] lg:col-span-3 lg:col-start-10 lg:block"
        >
          <PhoneFrame sizes="240px" className="border-white/25" />
          <figcaption className="mt-3 text-sm text-white/85">
            The clinic dashboard, on a phone.
          </figcaption>
        </figure>
      </div>

      <div className="border-t border-white/25">
        <div className="landing-container flex min-h-14 flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3 text-sm text-white/85">
          <p>Developed in support of Akomapa&apos;s community clinics in Ghana.</p>
          <a
            href="#problem"
            data-scroll-cue
            className="hidden min-h-11 items-center gap-2 rounded-sm font-semibold transition-colors duration-fast hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white lg:inline-flex"
          >
            {/* A pulse travelling along a heartbeat trace. */}
            <svg
              aria-hidden
              viewBox="0 0 56 20"
              className="h-5 w-14 fill-none stroke-current"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M1 10h21l5-4 6 8 4-4h18" className="opacity-30" />
              <path d="M1 10h21l5-4 6 8 4-4h18" pathLength={100} className="landing-scroll-pulse" />
            </svg>
            Scroll to the clinic day
          </a>
        </div>
      </div>
    </section>
  );
}
