'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
import { ArrowUpRight, Menu, Moon, Sun } from 'lucide-react';
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
    <header className="sticky top-0 z-40 border-b border-rule bg-background">
      <div className="landing-container flex h-16 items-center justify-between gap-6">
        <a
          href={`${base}#top`}
          className="relative flex min-h-11 w-[118px] items-center shrink-0 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <Image
            src="/images/nkwapa-logo.png"
            alt="Nkwapa home"
            width={118}
            height={32}
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
                  className="inline-flex min-h-11 items-center rounded-sm px-3 type-label text-muted-foreground motion-safe:transition-colors motion-safe:duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
            className="min-h-11 min-w-11"
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
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </a>
          </Button>

          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="min-h-11 min-w-11 lg:hidden"
                aria-label="Open menu"
              >
                <Menu className="h-5 w-5" aria-hidden />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="right"
              className="w-[min(22rem,90vw)] overflow-y-auto border-l border-rule px-6 pb-8 pt-6 data-[state=open]:duration-200 data-[state=closed]:duration-150 [&>button]:flex [&>button]:min-h-11 [&>button]:min-w-11 [&>button]:items-center [&>button]:justify-center"
              aria-describedby={undefined}
              onCloseAutoFocus={(event) => {
                if (!pendingHash.current) return;
                event.preventDefault();
                window.location.href = pendingHash.current;
                pendingHash.current = null;
              }}
            >
              <SheetHeader>
                <SheetTitle className="border-t-2 border-rule-strong pb-5 pt-6 text-left type-page-title">
                  Menu
                </SheetTitle>
              </SheetHeader>
              <nav aria-label="Mobile" className="mt-4">
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
                          className="flex min-h-12 items-center border-b border-rule text-base font-medium text-foreground motion-safe:transition-colors motion-safe:duration-150 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
