import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { LandingHeader } from './LandingHeader';
import { LandingFooter } from './LandingFooter';
import { LegalContents } from './LegalContents';
import { CONTACT_EMAIL, CONTACT_HREF, COOKIES_HREF, PRIVACY_HREF, TERMS_HREF } from './links';

export interface LegalSection {
  id: string;
  title: string;
  body: ReactNode;
}

const LEGAL_PAGES = [
  { href: PRIVACY_HREF, label: 'Privacy notice' },
  { href: TERMS_HREF, label: 'Terms of use' },
  { href: COOKIES_HREF, label: 'Cookie policy' },
];

/**
 * Shared layout for /privacy, /terms and /cookies: the landing chrome, the title on the canvas, then
 * the unchanged legal text on the white sheet with a numbered contents list that follows the reader.
 */
export function LegalPage({
  path,
  title,
  lede,
  updated,
  sections,
}: {
  path: typeof PRIVACY_HREF | typeof TERMS_HREF | typeof COOKIES_HREF;
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
      <main id="main" tabIndex={-1} className="focus-visible:outline-none">
        <div className="border-b border-rule">
          <div className="landing-container grid gap-8 pb-10 pt-6 sm:pb-12 sm:pt-8 lg:grid-cols-12">
            <div className="lg:col-span-9">
              <nav
                aria-label="Legal pages"
                className="flex flex-wrap gap-x-5 gap-y-1 border-b border-rule"
              >
                {LEGAL_PAGES.map((page) => (
                  <a
                    key={page.href}
                    href={page.href}
                    aria-current={page.href === path ? 'page' : undefined}
                    className={cn(
                      'inline-flex min-h-11 items-center border-b-2 px-1 type-label motion-safe:transition-colors motion-safe:duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                      page.href === path
                        ? 'border-primary text-foreground'
                        : 'border-transparent text-muted-foreground hover:border-rule-strong hover:text-foreground',
                    )}
                  >
                    {page.label}
                  </a>
                ))}
              </nav>
              <h1 className="mt-8 border-t-2 border-rule-strong pt-6 type-page-title">{title}</h1>
              <div className="mt-4 max-w-[65ch] type-body leading-relaxed text-muted-foreground">
                {lede}
              </div>
            </div>
            <dl className="grid content-start gap-5 border-t border-rule pt-5 text-sm sm:grid-cols-3 lg:col-span-3 lg:grid-cols-1 lg:border-t-2 lg:border-rule-strong lg:pt-6">
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

        {/* The notice reads on the white sheet, below the title on the canvas, as workspace pages do. */}
        <div className="bg-card">
          <div className="landing-container grid gap-x-12 gap-y-8 pb-16 pt-8 lg:grid-cols-12">
            <nav aria-label="Contents" className="lg:col-span-3">
              <div className="lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto">
                <h2 className="border-t-2 border-rule-strong pt-4 type-section-title">Contents</h2>
                <LegalContents sections={sections.map(({ id, title }) => ({ id, title }))} />
              </div>
            </nav>

            <div className="min-w-0 lg:col-span-9">
              <div className="max-w-[68ch] type-body leading-relaxed text-foreground [&_p]:mt-4 [&_ul]:mt-4 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5 [&_h3]:mt-8 [&_h3]:font-semibold [&_a]:rounded-sm [&_a]:font-medium [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4 [&_a:focus-visible]:outline [&_a:focus-visible]:outline-2 [&_a:focus-visible]:outline-ring [&_code]:[overflow-wrap:anywhere]">
                {sections.map((section, index) => (
                  <section
                    key={section.id}
                    aria-labelledby={section.id}
                    className="mb-12 border-t-2 border-rule-strong pt-5"
                  >
                    <h2 id={section.id} className="scroll-mt-24 type-section-title">
                      <span
                        aria-hidden="true"
                        className="mr-3 text-sm tabular-nums text-muted-foreground"
                      >
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      {section.title}
                    </h2>
                    {section.body}
                  </section>
                ))}
              </div>

              <aside
                aria-labelledby="legal-questions"
                className="mt-12 max-w-[68ch] border-t-2 border-rule-strong py-6"
              >
                <h2 id="legal-questions" className="type-section-title">
                  Questions about this page?
                </h2>
                <p className="mt-3 leading-relaxed">
                  Write to the Akomapa team about anything in this notice.
                </p>
                <a
                  href={CONTACT_HREF}
                  className="mt-4 inline-flex min-h-11 items-center rounded-sm font-semibold text-primary underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {CONTACT_EMAIL}
                </a>
              </aside>
            </div>
          </div>
        </div>
      </main>
      <LandingFooter base="/" />
    </div>
  );
}
