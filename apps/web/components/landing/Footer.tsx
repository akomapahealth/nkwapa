'use client';

import { Github, ArrowUp } from 'lucide-react';
import { Button } from '@/components/ui/button';

const footerLinks = {
  explore: [
    { label: 'product overview', href: '#product' },
    { label: 'workflow', href: '#workflow' },
    { label: 'our story', href: '#our-story' },
  ],
  platform: [
    { label: 'offline sync', href: '#product' },
    { label: 'care workflows', href: '#workflow' },
    { label: 'program impact', href: '#impact' },
  ],
  resources: [
    { label: 'what we solve', href: '#product' },
    { label: 'team focus', href: '#our-story' },
    { label: 'community outcomes', href: '#impact' },
  ],
};

export function Footer() {
  const handleAnchor = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    e.preventDefault();
    const id = href.replace('#', '');
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <footer className="border-t border-border py-12 md:py-16">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-[1.2fr_2fr]">
          <div>
            <h3 className="font-landing-heading text-xl font-black lowercase leading-tight text-foreground md:text-2xl">
              reliable chronic care
              <br />
              management for all.
            </h3>
            <div className="mt-6 flex flex-wrap gap-3">
              <a
                href="#product"
                onClick={(e) => handleAnchor(e, '#product')}
                className="inline-flex cursor-pointer items-center rounded-full border-2 border-foreground px-6 py-2.5 font-landing-nav text-sm font-semibold text-foreground transition-colors duration-200 hover:bg-foreground hover:text-background"
              >
                Explore the product
              </a>
              <a
                href="https://github.com/nkwapa/nkwapa"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex cursor-pointer items-center gap-2 rounded-full border-2 border-border px-5 py-2.5 font-landing-nav text-sm font-medium text-muted-foreground transition-colors duration-200 hover:border-foreground hover:text-foreground"
              >
                <Github className="h-4 w-4" aria-hidden />
                GitHub
              </a>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            {Object.entries(footerLinks).map(([category, links]) => (
              <div key={category}>
                <h4 className="font-landing-nav text-sm font-semibold capitalize text-foreground">
                  {category}
                </h4>
                <ul className="mt-3 space-y-2">
                  {links.map((link) => (
                    <li key={link.label}>
                      <a
                        href={link.href}
                        onClick={(e) => handleAnchor(e, link.href)}
                        className="cursor-pointer font-landing-body text-sm text-muted-foreground transition-colors duration-200 hover:text-foreground"
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-12 flex items-center justify-between border-t border-border pt-6">
          <p className="font-landing-body text-xs text-muted-foreground">
            Nkwapa EMR — Open source multi-clinic hypertension and diabetes workflows. &copy;{' '}
            {new Date().getFullYear()}
          </p>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full"
            onClick={scrollToTop}
            aria-label="Back to top"
          >
            <ArrowUp className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </footer>
  );
}
