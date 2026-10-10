'use client';

import { useState } from 'react';
import Image from 'next/image';
import { motion, useScroll, useTransform, useReducedMotion } from 'framer-motion';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from '@/components/ui/sheet';

const navLinks = [
  { label: 'Product', href: '#product' },
  { label: 'Workflow', href: '#workflow' },
  { label: 'Story', href: '#our-story' },
  { label: 'Impact', href: '#impact' },
];

export function LandingNav() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const prefersReducedMotion = useReducedMotion();
  const { scrollY } = useScroll();

  /*
    Token-derived, not literal white.

    These were `rgba(255,255,255,0.92)` and `rgba(0,0,0,0.06)`, so the nav faded to a white bar
    with a black shadow regardless of theme -- in dark mode it became a bright slab across the top
    of a dark page. `--card` and `--foreground` resolve per theme, so the same scroll behaviour now
    reads correctly in both.
  */
  const navBg = useTransform(
    scrollY,
    [0, 100],
    ['hsl(var(--card) / 0)', 'hsl(var(--card) / 0.92)'],
  );
  const navBorder = useTransform(
    scrollY,
    [0, 100],
    ['hsl(var(--border) / 0)', 'hsl(var(--border) / 0.8)'],
  );
  const navShadow = useTransform(
    scrollY,
    [0, 100],
    ['0 0 0 0 transparent', '0 4px 24px -4px hsl(var(--foreground) / 0.08)'],
  );

  const settledNavStyle = {
    backgroundColor: 'hsl(var(--card) / 0.92)',
    boxShadow: '0 4px 24px -4px hsl(var(--foreground) / 0.08)',
    border: '1px solid hsl(var(--border) / 0.8)',
  } as const;

  const handleAnchor = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    e.preventDefault();
    const id = href.replace('#', '');
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
    setMobileOpen(false);
  };

  return (
    <div className="pointer-events-none fixed top-4 left-0 right-0 z-50 flex justify-center px-4 md:top-6">
      <motion.nav
        className="pointer-events-auto flex w-full max-w-5xl items-center justify-between gap-4 rounded-full px-4 py-3 backdrop-blur-md md:px-6"
        style={
          prefersReducedMotion
            ? settledNavStyle
            : {
                backgroundColor: navBg,
                borderColor: navBorder,
                boxShadow: navShadow,
                border: '1px solid',
              }
        }
      >
        <a
          href="/"
          className="relative h-8 w-32 cursor-pointer no-underline transition-opacity duration-200 hover:opacity-80"
          aria-label="Nkwapa home"
        >
          <Image src="/images/nkwapa_logo-2.png" alt="Nkwapa" fill className="object-contain" />
        </a>

        <div className="hidden items-center gap-6 lg:flex">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={(e) => handleAnchor(e, link.href)}
              className="cursor-pointer font-landing-nav text-sm font-medium text-muted-foreground no-underline transition-colors duration-200 hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <motion.a
            href="#workflow"
            onClick={(e) => handleAnchor(e, '#workflow')}
            className="hidden cursor-pointer rounded-full bg-primary px-5 py-2 font-landing-nav text-sm font-semibold text-primary-foreground shadow-sm transition-colors duration-200 hover:bg-primary/90 sm:inline-flex"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
          >
            See workflow
          </motion.a>

          {/* Mobile menu */}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden"
                aria-label="Open navigation menu"
              >
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72">
              <SheetHeader>
                <SheetTitle>
                  <span className="relative block h-9 w-36">
                    <Image
                      src="/images/nkwapa_logo-2.png"
                      alt="Nkwapa"
                      fill
                      className="object-contain"
                    />
                  </span>
                </SheetTitle>
              </SheetHeader>
              <nav className="mt-8 flex flex-col gap-4">
                {navLinks.map((link) => (
                  <SheetClose key={link.href} asChild>
                    <a
                      href={link.href}
                      onClick={(e) => handleAnchor(e, link.href)}
                      className="cursor-pointer rounded-lg px-3 py-2 font-landing-nav text-base font-medium text-muted-foreground no-underline transition-colors duration-200 hover:bg-muted hover:text-foreground"
                    >
                      {link.label}
                    </a>
                  </SheetClose>
                ))}
                <SheetClose asChild>
                  <a
                    href="#workflow"
                    onClick={(e) => handleAnchor(e, '#workflow')}
                    className="mt-2 cursor-pointer rounded-full bg-primary px-5 py-3 text-center font-landing-nav text-sm font-semibold text-primary-foreground shadow-sm transition-colors duration-200 hover:bg-primary/90"
                  >
                    See workflow
                  </a>
                </SheetClose>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </motion.nav>
    </div>
  );
}
