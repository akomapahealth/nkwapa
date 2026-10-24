import type { ReactNode } from 'react';
import { LandingHeader } from './LandingHeader';
import { LandingFooter } from './LandingFooter';

export interface LegalSection {
  id: string;
  title: string;
  body: ReactNode;
}

/** Shared layout for /privacy and /terms: the landing chrome, a contents list, and the text. */
export function LegalPage({
  title,
  lede,
  updated,
  sections,
}: {
  title: string;
  lede: ReactNode;
  updated: string;
  sections: LegalSection[];
}) {
  return (
    <div data-landing className="min-h-screen bg-background text-foreground">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-primary px-4 py-3 text-primary-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>
      <LandingHeader base="/" />
      <main id="main">
        <div className="bg-accent">
          <div className="landing-container py-14 sm:py-20">
            <p className="text-sm font-semibold text-primary">Nkwapa</p>
            <h1 className="mt-3 max-w-3xl font-heading text-4xl font-semibold leading-tight sm:text-5xl">
              {title}
            </h1>
            <div className="mt-5 max-w-2xl text-lg text-foreground/80">{lede}</div>
            <p className="mt-6 text-sm text-muted-foreground">Last updated {updated}</p>
          </div>
        </div>

        <div className="landing-container grid gap-10 pb-20 pt-6 lg:grid-cols-12">
          <nav aria-label="Contents" className="lg:col-span-4 xl:col-span-3">
            <div className="lg:sticky lg:top-24 lg:pt-8">
              <h2 className="font-body text-sm font-semibold">Contents</h2>
              <ol className="mt-3 border-l border-border">
                {sections.map((section) => (
                  <li key={section.id}>
                    <a
                      href={`#${section.id}`}
                      className="-ml-px flex min-h-10 items-center border-l-2 border-transparent pl-4 text-sm text-foreground/75 transition-colors duration-fast hover:border-primary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {section.title}
                    </a>
                  </li>
                ))}
              </ol>
            </div>
          </nav>

          <div className="legal-prose lg:col-span-8 xl:col-span-9">
            {sections.map((section) => (
              <section key={section.id} aria-labelledby={section.id}>
                <h2 id={section.id}>{section.title}</h2>
                {section.body}
              </section>
            ))}
          </div>
        </div>
      </main>
      <LandingFooter base="/" />
    </div>
  );
}
