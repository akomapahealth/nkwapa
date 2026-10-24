import Image from 'next/image';
import { AKOMAPA_HREF, CONTACT_EMAIL, CONTACT_HREF, SECTION_LINKS } from './links';

const linkClass =
  'inline-flex min-h-11 items-center rounded-sm text-foreground/75 transition-colors duration-fast hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function LandingFooter() {
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
          <h2 className="font-body text-sm font-semibold">On this page</h2>
          <ul className="mt-2">
            {SECTION_LINKS.map((link) => (
              <li key={link.href}>
                <a href={link.href} className={linkClass}>
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
      <div className="landing-container border-t border-border py-6 text-sm text-muted-foreground">
        &copy; {new Date().getFullYear()} Nkwapa. Developed in support of Akomapa.
      </div>
    </footer>
  );
}
