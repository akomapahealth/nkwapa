'use client';

import Image from 'next/image';
import { Keyboard } from 'lucide-react';
import { AppNavList } from '@/components/app-shell/AppNavList';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useBootstrap } from '@/lib/bootstrap-context';
import { cn } from '@/lib/utils';

export function Sidebar({ collapsed }: { collapsed: boolean }) {
  const bootstrap = useBootstrap()?.bootstrap ?? null;

  return (
    /*
      Direction A's rail (MASTER.md section 12): labelled and 232px on the canvas, 64px of icons
      when collapsed. It sits on `--background` with a hairline edge rather than the sage
      `--sidebar` panel, so chrome stays quiet and the page carries the hierarchy.

      The aside stretches with the page and only its contents are sticky. It used to be
      `sticky h-screen` itself, so on a page longer than the window its background and edge
      stopped one viewport down and the canvas showed through beside the rest of the page.

      The active clinic and roles moved to the header's clinic switcher, which already named the
      clinic; the rail repeated it.
    */
    <aside
      id="workspace-sidebar"
      aria-label="Workspace navigation"
      className={cn(
        'hidden shrink-0 border-r border-border bg-background text-foreground md:block',
        'transition-[width] duration-base ease-drawer',
        collapsed ? 'w-16' : 'w-[232px]',
      )}
    >
      <div
        className={cn(
          'sticky top-0 flex h-screen flex-col gap-5 py-4',
          collapsed ? 'px-2' : 'px-3',
        )}
      >
        {/*
          Both marks stay mounted and cross-fade while the rail changes width, instead of one
          being swapped for the other mid-transition. The collapsed mark is a square tile drawn
          by scripts/generate-pwa-icons.mjs (`nkwapa-mark.png`).
        */}
        <div className="relative h-10 w-full shrink-0 overflow-hidden">
          <div
            className={cn(
              'absolute inset-y-0 left-3 w-36 origin-left transition-[opacity,transform] duration-base ease-out-strong',
              collapsed ? 'pointer-events-none scale-95 opacity-0' : 'scale-100 opacity-100',
            )}
          >
            <Image
              src="/images/nkwapa-logo.png"
              alt={collapsed ? '' : 'Nkwapa EMR'}
              fill
              sizes="144px"
              priority
              className="object-contain object-left"
            />
          </div>
          <div
            className={cn(
              'absolute left-1/2 top-1/2 h-9 w-9 -translate-x-1/2 -translate-y-1/2 transition-[opacity,transform] duration-base ease-out-strong',
              collapsed ? 'scale-100 opacity-100' : 'pointer-events-none scale-90 opacity-0',
            )}
          >
            <Image
              src="/images/nkwapa-mark.png"
              alt={collapsed ? 'Nkwapa' : ''}
              fill
              sizes="36px"
              className="object-contain"
            />
          </div>
        </div>

        <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
          <TooltipProvider delayDuration={200}>
            <AppNavList bootstrap={bootstrap} collapsed={collapsed} />
          </TooltipProvider>
        </div>

        {collapsed ? null : (
          <p className="flex shrink-0 items-center gap-2 px-3 text-xs text-muted-foreground">
            <Keyboard aria-hidden="true" className="h-4 w-4" />
            Press <kbd className="font-sans font-semibold text-foreground">[</kbd> to collapse
          </p>
        )}
      </div>
    </aside>
  );
}
