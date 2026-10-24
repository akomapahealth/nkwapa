import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { LandingHeader } from './LandingHeader';
import { LandingFooter } from './LandingFooter';
import { LegalContents } from './LegalContents';
import { CONTACT_EMAIL, CONTACT_HREF, PRIVACY_HREF, TERMS_HREF } from './links';

export interface LegalSection {
  id: string;
  title: string;
  body: ReactNode;
}

const LEGAL_PAGES = [
  { href: PRIVACY_HREF, label: 'Privacy notice' },
  { href: TERMS_HREF, label: 'Terms of use' },
];

/**
 * Shared layout for /privacy and /terms: the landing chrome, an editorial title band, a numbered
 * contents list that follows the reader, and the text. Section numbers come from CSS counters
 * (globals.css), so the pages only supply plain sections.
 */
export function LegalPage({
  path,
  title,
  lede,
  updated,
  sections,
}: {
  path: typeof PRIVACY_HREF | typeof TERMS_HREF;
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
      {/* Reading progress, driven by the scroll position in CSS; absent where unsupported. */}
      <div aria-hidden className="legal-progress sticky top-16 z-30 h-0.5 bg-primary" />
      <main id="main">
        <div className="border-b border-border bg-accent">
          <div className="landing-container grid gap-10 pb-14 pt-10 sm:pb-20 sm:pt-14 lg:grid-cols-12">
            <div className="lg:col-span-8">
              <nav aria-label="Legal pages" className="flex flex-wrap gap-2">
                {LEGAL_PAGES.map((page) => (
                  <a
                    key={page.href}
                    href={page.href}
                    aria-current={page.href === path ? 'page' : undefined}
                    className={cn(
                      'inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                      page.href === path
                        ? 'border-foreground bg-foreground text-background'
                        : 'border-foreground/25 text-foreground hover:border-foreground',
                    )}
                  >
                    {page.label}
                  </a>
                ))}
              </nav>
              <h1 className="mt-10 text-balance font-heading text-5xl font-semibold leading-[1.02] tracking-[-0.02em] sm:text-6xl lg:text-7xl">
                {title}
              </h1>
              <div className="mt-6 max-w-2xl text-lg leading-relaxed text-foreground/80 sm:text-xl">
                {lede}
              </div>
            </div>
            <dl className="grid content-end gap-5 border-t border-foreground/15 pt-6 text-sm sm:grid-cols-3 lg:col-span-4 lg:grid-cols-1 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
              <div>
                <dt className="text-muted-foreground">Last updated</dt>
                <dd className="mt-1 font-semibold">{updated}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Applies to</dt>
                <dd className="mt-1 font-semibold">Nkwapa, by Akomapa Health Foundation</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Sections</dt>
                <dd className="mt-1 font-semibold tabular-nums">{sections.length}</dd>
              </div>
            </dl>
          </div>
        </div>

        <div className="landing-container grid gap-10 pb-20 pt-6 lg:grid-cols-12">
          <nav aria-label="Contents" className="lg:col-span-4 xl:col-span-3">
            <div className="lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto lg:pt-8">
              <h2 className="text-eyebrow text-muted-foreground">Contents</h2>
              <LegalContents sections={sections.map(({ id, title }) => ({ id, title }))} />
            </div>
          </nav>

          <div className="lg:col-span-8 xl:col-span-9">
            <div className="legal-prose">
              {sections.map((section) => (
                <section key={section.id} aria-labelledby={section.id}>
                  <h2 id={section.id}>{section.title}</h2>
                  {section.body}
                </section>
              ))}
            </div>

            <aside
              aria-labelledby="legal-questions"
              className="mt-16 max-w-[68ch] rounded-xl bg-primary px-6 py-8 text-primary-foreground sm:px-10 sm:py-10"
            >
              <h2 id="legal-questions" className="font-heading text-2xl font-semibold sm:text-3xl">
                Questions about this page?
              </h2>
              <p className="mt-3 leading-relaxed">
                Write to the Akomapa team about anything in this notice.
              </p>
              <a
                href={CONTACT_HREF}
                className="mt-6 inline-flex min-h-11 items-center rounded-md bg-primary-foreground px-5 font-semibold text-primary transition-transform duration-fast ease-out-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-primary active:scale-[0.97]"
              >
                {CONTACT_EMAIL}
              </a>
            </aside>
          </div>
        </div>
      </main>
      <LandingFooter base="/" />
    </div>
  );
}
