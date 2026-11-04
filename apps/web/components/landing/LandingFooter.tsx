import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { StatusPanel } from './StatusPanel';
import { CookieSettingsButton } from './CookieSettingsButton';
import {
  AKOMAPA_HREF,
  CONTACT_EMAIL,
  CONTACT_HREF,
  COOKIES_HREF,
  PRIVACY_HREF,
  SECTION_LINKS,
  TERMS_HREF,
} from './links';

const linkClass =
  'inline-flex min-h-11 items-center gap-2 rounded-sm text-sm text-muted-foreground underline-offset-4 motion-safe:transition-colors motion-safe:duration-150 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function LandingFooter({
  base = '',
  releaseVersion,
}: {
  base?: '' | '/';
  releaseVersion?: string;
}) {
  return (
    <footer className="border-t-2 border-rule-strong bg-background text-foreground">
      <div className="landing-container grid gap-x-10 gap-y-10 py-12 sm:grid-cols-2 lg:grid-cols-12 lg:py-16">
        <div className="sm:col-span-2 lg:col-span-5">
          <a
            href={`${base}#top`}
            className="inline-flex min-h-11 items-center rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Image
              src="/images/nkwapa-logo.png"
              alt="Nkwapa home"
              width={1049}
              height={286}
              sizes="164px"
              loading="eager"
              className="h-auto w-[164px]"
            />
          </a>
          <p className="mt-6 max-w-md font-heading text-2xl leading-snug sm:text-3xl">
            Electronic medical records and clinic workflows for hypertension and diabetes care.
          </p>
        </div>

        <nav aria-label="Footer" className="border-t border-rule pt-4 lg:col-span-2">
          <h2 className="type-label text-foreground">{base ? 'Nkwapa' : 'On this page'}</h2>
          <ul className="mt-3">
            {SECTION_LINKS.map((link) => (
              <li key={link.href}>
                <a href={base + link.href} className={linkClass}>
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label="Legal" className="border-t border-rule pt-4 lg:col-span-2">
          <h2 className="type-label text-foreground">Legal</h2>
          <ul className="mt-3">
            <li>
              <Link href={PRIVACY_HREF} className={linkClass}>
                Privacy
              </Link>
            </li>
            <li>
              <Link href={TERMS_HREF} className={linkClass}>
                Terms
              </Link>
            </li>
            <li>
              <Link href={COOKIES_HREF} className={linkClass}>
                Cookies
              </Link>
            </li>
            <li>
              <CookieSettingsButton className={linkClass} />
            </li>
          </ul>
        </nav>

        <div className="border-t border-rule pt-4 lg:col-span-3">
          <h2 className="type-label text-foreground">Get in touch</h2>
          <ul className="mt-3">
            <li>
              <a href={CONTACT_HREF} data-cta="contact" className={linkClass}>
                {CONTACT_EMAIL}
              </a>
            </li>
            <li>
              <a href={AKOMAPA_HREF} data-cta="akomapa" rel="noopener" className={linkClass}>
                akomapa.org <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="landing-container">
        <div className="flex flex-col gap-3 border-t border-rule py-5 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>&copy; {new Date().getFullYear()} Nkwapa. Developed in support of Akomapa.</p>
          <StatusPanel releaseVersion={releaseVersion} />
        </div>
      </div>
    </footer>
  );
}
