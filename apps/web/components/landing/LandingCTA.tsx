import { ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AKOMAPA_HREF, CONTACT_EMAIL, CONTACT_HREF } from './links';

export function LandingCTA() {
  return (
    <section
      aria-labelledby="cta-title"
      className="bg-primary py-20 text-primary-foreground sm:py-28 lg:py-36"
    >
      <div className="landing-container grid gap-10 lg:grid-cols-12 lg:items-end" data-reveal>
        <h2
          id="cta-title"
          className="text-balance font-heading text-[2.5rem] font-semibold leading-[1.02] tracking-[-0.02em] sm:text-6xl lg:col-span-8 lg:text-7xl"
        >
          Better care starts with better-organized information.
        </h2>
        <div className="lg:col-span-4">
          <p className="text-lg leading-relaxed text-primary-foreground/90">
            If you run a clinic or a screening program and want to know whether Nkwapa fits how your
            team works, write to us at{' '}
            <a
              href={CONTACT_HREF}
              data-cta="contact"
              className="rounded-sm font-semibold underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground"
            >
              {CONTACT_EMAIL}
            </a>
            .
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row lg:flex-col">
            <Button
              asChild
              size="lg"
              variant="gold"
              className="focus-visible:ring-primary-foreground focus-visible:ring-offset-primary"
            >
              <a href={CONTACT_HREF} data-cta="contact">
                Contact the team
              </a>
            </Button>
            <Button
              asChild
              size="lg"
              variant="ghost"
              className="border border-primary-foreground/60 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground focus-visible:ring-primary-foreground focus-visible:ring-offset-primary"
            >
              <a href={AKOMAPA_HREF} data-cta="akomapa" rel="noopener">
                Learn about Akomapa
                <ArrowUpRight aria-hidden />
              </a>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
