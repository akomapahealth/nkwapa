'use client';

import { landingPrimaryPanelHover } from '@/lib/landing-card-hover';

export function CtaBanner() {
  const scrollToStory = () => {
    document.getElementById('our-story')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section className="py-8">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div
          className={`flex flex-col items-center justify-between gap-4 rounded-3xl bg-primary px-8 py-8 shadow-lg ring-1 ring-primary/20 sm:flex-row sm:gap-6 ${landingPrimaryPanelHover}`}
        >
          <p className="text-center font-landing-heading text-lg font-bold lowercase text-primary-foreground sm:text-left md:text-xl">
            better chronic care starts with you.
          </p>
          <button
            type="button"
            onClick={scrollToStory}
            className="cursor-pointer whitespace-nowrap rounded-full border-2 border-primary-foreground bg-primary-foreground px-8 py-3 font-landing-nav text-sm font-semibold text-primary transition-colors duration-200 hover:bg-transparent hover:text-primary-foreground"
          >
            Read our story
          </button>
        </div>
      </div>
    </section>
  );
}
