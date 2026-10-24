'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
import { Menu, Moon, Sun } from 'lucide-react';
import { useTheme } from '@/lib/theme-context';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { CONTACT_HREF, SECTION_LINKS } from './links';

/** `base` is `/` on pages other than the landing page, so section links lead back to it. */
export function LandingHeader({ base = '' }: { base?: '' | '/' }) {
  const [menuOpen, setMenuOpen] = useState(false);
  // The open sheet locks page scroll, so a section link chosen in it is followed once it closes.
  const pendingHash = useRef<string | null>(null);
  const { theme, setPreference } = useTheme();
  const nextTheme = theme === 'dark' ? 'light' : 'dark';

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background">
      <div className="landing-container flex h-16 items-center justify-between gap-6">
        <a
          href={`${base}#top`}
          className="relative block h-8 w-[118px] shrink-0 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <Image
            src="/images/nkwapa-logo.png"
            alt="Nkwapa home"
            fill
            sizes="118px"
            className="object-contain object-left"
          />
        </a>

        <nav aria-label="Main" className="hidden lg:block">
          <ul className="flex items-center gap-1">
            {SECTION_LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={base + link.href}
                  className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-foreground/75 transition-colors duration-fast hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Switch to ${nextTheme} mode`}
            onClick={() => setPreference(nextTheme)}
          >
            {theme === 'dark' ? (
              <Sun className="h-5 w-5" aria-hidden />
            ) : (
              <Moon className="h-5 w-5" aria-hidden />
            )}
          </Button>
          <Button asChild className="hidden sm:inline-flex">
            <a href={CONTACT_HREF} data-cta="contact">
              Contact the team
            </a>
          </Button>

          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu">
                <Menu className="h-5 w-5" aria-hidden />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="right"
              className="w-[min(20rem,85vw)]"
              aria-describedby={undefined}
              onCloseAutoFocus={(event) => {
                if (!pendingHash.current) return;
                event.preventDefault();
                window.location.href = pendingHash.current;
                pendingHash.current = null;
              }}
            >
              <SheetHeader>
                <SheetTitle className="text-left font-heading text-xl">Menu</SheetTitle>
              </SheetHeader>
              <nav aria-label="Mobile" className="mt-6">
                <ul className="flex flex-col">
                  {SECTION_LINKS.map((link) => (
                    <li key={link.href}>
                      <SheetClose asChild>
                        <a
                          href={base + link.href}
                          onClick={(event) => {
                            event.preventDefault();
                            pendingHash.current = base + link.href;
                            setMenuOpen(false);
                          }}
                          className="flex min-h-12 items-center border-b border-border text-base font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {link.label}
                        </a>
                      </SheetClose>
                    </li>
                  ))}
                </ul>
                <Button asChild size="lg" className="mt-8 w-full">
                  <a href={CONTACT_HREF} data-cta="contact">
                    Contact the team
                  </a>
                </Button>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
