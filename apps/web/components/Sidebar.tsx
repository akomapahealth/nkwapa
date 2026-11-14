'use client';

import Image from 'next/image';
import { BrandWordmark } from '@/components/BrandWordmark';
import { Keyboard } from 'lucide-react';
import { AppNavList } from '@/components/app-shell/AppNavList';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useBootstrap } from '@/lib/bootstrap-context';
import { cn } from '@/lib/utils';

export function Sidebar({
  collapsed,
  rail,
  animate,
}: {
  collapsed: boolean;
  rail: boolean;
  animate: boolean;
}) {
  const bootstrap = useBootstrap()?.bootstrap ?? null;

  return (
    // The aside stretches with the document; only its independently scrollable contents stick.
    <aside
      id="workspace-sidebar"
      aria-label="Workspace navigation"
      className={cn(
        'hidden w-[76px] shrink-0 bg-background text-foreground compact:block',
        animate
          ? 'desktop:transition-[width] desktop:duration-base desktop:ease-drawer'
          : 'transition-none',
        collapsed ? 'desktop:w-16' : 'desktop:w-[232px]',
      )}
    >
      <div
        className={cn(
          'sticky top-0 flex h-dvh flex-col gap-5 py-4',
          rail ? 'px-1' : collapsed ? 'px-2' : 'px-3',
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
              'absolute inset-y-0 left-3 w-36 origin-left',
              animate && 'transition-opacity duration-base ease-out-strong',
              collapsed || rail ? 'pointer-events-none opacity-0' : 'opacity-100',
            )}
          >
            <BrandWordmark
              alt={collapsed || rail ? '' : 'Nkwapa EMR'}
              fill
              sizes="144px"
              className="object-contain object-left"
            />
          </div>
          <div
            className={cn(
              'absolute left-1/2 top-1/2 h-9 w-9 -translate-x-1/2 -translate-y-1/2',
              animate && 'transition-opacity duration-base ease-out-strong',
              collapsed || rail ? 'opacity-100' : 'pointer-events-none opacity-0',
            )}
          >
            <Image
              src="/images/nkwapa-mark.png"
              alt={collapsed || rail ? 'Nkwapa' : ''}
              fill
              sizes="36px"
              className="object-contain"
            />
          </div>
        </div>

        <div className={cn('-mx-1 min-h-0 flex-1 overflow-y-auto', rail ? 'px-px' : 'px-1')}>
          <TooltipProvider delayDuration={300}>
            <AppNavList bootstrap={bootstrap} collapsed={collapsed} rail={rail} />
          </TooltipProvider>
        </div>

        {collapsed || rail ? null : (
          <p className="flex shrink-0 items-center gap-2 px-3 text-xs text-muted-foreground">
            <Keyboard aria-hidden="true" className="h-4 w-4" />
            Press <kbd className="font-sans font-semibold text-foreground">[</kbd> to collapse
          </p>
        )}
      </div>
    </aside>
  );
}
