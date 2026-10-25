import Image from 'next/image';
import Link from 'next/link';
import { StatusPanel } from './StatusPanel';
import {
  AKOMAPA_HREF,
  CONTACT_EMAIL,
  CONTACT_HREF,
  PRIVACY_HREF,
  SECTION_LINKS,
  TERMS_HREF,
} from './links';

const linkClass =
  'inline-flex min-h-11 items-center rounded-sm text-foreground/75 transition-colors duration-fast hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function LandingFooter({
  base = '',
  releaseVersion,
}: {
  base?: '' | '/';
  releaseVersion?: string;
}) {
  return (
    <footer className="border-t border-border bg-background">
      <div className="landing-container grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-12">
        <div className="sm:col-span-2 lg:col-span-6">
          <Image
            src="/images/nkwapa-logo.png"
            alt="Nkwapa"
            width={1049}
            height={286}
            sizes="132px"
            className="h-9 w-auto"
          />
          <p className="mt-4 max-w-sm text-muted-foreground">
            Electronic medical records and clinic workflows for hypertension and diabetes care.
          </p>
        </div>

        <nav aria-label="Footer" className="lg:col-span-3">
          <h2 className="font-body text-sm font-semibold">{base ? 'Nkwapa' : 'On this page'}</h2>
          <ul className="mt-2">
            {SECTION_LINKS.map((link) => (
              <li key={link.href}>
                <a href={base + link.href} className={linkClass}>
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="lg:col-span-3">
          <h2 className="font-body text-sm font-semibold">Get in touch</h2>
          <ul className="mt-2">
            <li>
              <a href={CONTACT_HREF} data-cta="contact" className={linkClass}>
                {CONTACT_EMAIL}
              </a>
            </li>
            <li>
              <a href={AKOMAPA_HREF} data-cta="akomapa" rel="noopener" className={linkClass}>
                akomapa.org
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="landing-container flex flex-col gap-2 border-t border-border py-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>&copy; {new Date().getFullYear()} Nkwapa. Developed in support of Akomapa.</p>
        <div className="flex flex-wrap items-center gap-6">
          <StatusPanel releaseVersion={releaseVersion} />
          <ul className="flex gap-6">
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
          </ul>
        </div>
      </div>
    </footer>
  );
}
