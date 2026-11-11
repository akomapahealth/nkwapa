'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MoreHorizontal, RefreshCw, Settings, UserPen } from 'lucide-react';
import { useSync } from '@/app/ServiceWorkerAndSyncProvider';
import { AppNavList } from '@/components/app-shell/AppNavList';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { useBootstrap } from '@/lib/bootstrap-context';
import { getBootstrapActiveClinicId } from '@/lib/bootstrap-clinics';
import { portalNavItems } from '@/lib/portal-nav';
import { getNavItemHref, isNavItemActive, type AppNavItem } from '@/lib/app-nav';
import { getMobileNavigation } from '@/lib/mobile-nav';
import { cn } from '@/lib/utils';

/** Shared phone presentation; each shell supplies its existing destinations. */
export function BottomNav({
  portal = false,
  canOpenSync = true,
}: {
  portal?: boolean;
  canOpenSync?: boolean;
}) {
  const bootstrap = useBootstrap()?.bootstrap ?? null;
  const clinicId = getBootstrapActiveClinicId(bootstrap);
  const pathname = usePathname();
  const { setSyncCenterOpen } = useSync();
  const navigation = getMobileNavigation(bootstrap);
  const primary: AppNavItem[] = portal ? portalNavItems : navigation.primary;
  const more = portal ? [] : navigation.more;
  const utilities = navigation.utilities;
  const isActive = (item: AppNavItem) =>
    portal
      ? Boolean(portalNavItems.find((entry) => entry.href === item.href)?.matches(pathname))
      : isNavItemActive(pathname, item, clinicId);
  const [open, setOpen] = useState(false);
  const syncAfterClose = useRef(false);
  const moreTrigger = useRef<HTMLButtonElement>(null);
  const previousPath = useRef(pathname);

  useEffect(() => {
    if (previousPath.current !== pathname) setOpen(false);
    previousPath.current = pathname;
  }, [pathname]);

  useEffect(() => {
    const query = window.matchMedia('(min-width: 600px)');
    const closeOnResize = () => {
      if (query.matches) setOpen(false);
    };
    query.addEventListener('change', closeOnResize);
    return () => query.removeEventListener('change', closeOnResize);
  }, []);

  const moreActive =
    [...more.flatMap((section) => section.items), ...utilities].some((item) =>
      isNavItemActive(pathname, item, clinicId),
    ) || /^\/(account|settings)(\/|$)/.test(pathname);
  const activeIndex = primary.findIndex(isActive);
  const indicatorIndex = moreActive || open ? primary.length : activeIndex;
  const tabClass =
    'flex min-h-[3.75rem] min-w-0 flex-col items-center justify-center gap-[3px] px-1 py-1 text-center text-[0.71875rem] font-medium leading-tight text-muted-foreground transition-colors duration-fast hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring';
  const utilityClass =
    'flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-sm text-muted-foreground hover:bg-surface-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <nav
        aria-label={portal ? 'Patient portal' : 'Primary'}
        className="safe-edges-x fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card pb-[env(safe-area-inset-bottom)] compact:hidden"
      >
        <div
          className="relative mx-2 grid"
          style={{ gridTemplateColumns: `repeat(${primary.length + 1}, minmax(0, 1fr))` }}
        >
          {indicatorIndex >= 0 && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -top-px left-0 h-0.5 bg-primary transition-transform duration-base ease-in-out-strong"
              style={{
                width: `${100 / (primary.length + 1)}%`,
                transform: `translateX(${indicatorIndex * 100}%)`,
              }}
            />
          )}
          {primary.map((item) => {
            const Icon = item.icon;
            const active = isActive(item);
            const content = (
              <>
                <Icon aria-hidden="true" className="size-5 shrink-0" />
                <span className="w-full break-words [overflow-wrap:anywhere]">{item.label}</span>
              </>
            );
            return item.requiresClinic && !clinicId ? (
              <button key={item.href} type="button" disabled className={tabClass}>
                {content}
              </button>
            ) : (
              <Link
                key={item.href}
                href={getNavItemHref(item, clinicId)}
                aria-current={active ? 'page' : undefined}
                className={cn(tabClass, active && 'font-semibold text-primary')}
              >
                {content}
              </Link>
            );
          })}
          <SheetTrigger asChild>
            <button
              ref={moreTrigger}
              type="button"
              aria-current={moreActive ? 'true' : undefined}
              className={cn(tabClass, (moreActive || open) && 'font-semibold text-primary')}
            >
              <MoreHorizontal aria-hidden="true" className="size-5 shrink-0" />
              <span>More</span>
            </button>
          </SheetTrigger>
        </div>
      </nav>
      <SheetContent
        side="bottom"
        className="flex max-h-[85dvh] flex-col rounded-t-xl border-border bg-card p-0 pb-[env(safe-area-inset-bottom)]"
        onCloseAutoFocus={(event) => {
          if (window.matchMedia('(min-width: 600px)').matches) {
            event.preventDefault();
            document.getElementById('main-content')?.focus();
          }
          if (!syncAfterClose.current) return;
          syncAfterClose.current = false;
          event.preventDefault();
          moreTrigger.current?.focus();
          // Let More release its focus trap before opening the existing sync center.
          requestAnimationFrame(() => setSyncCenterOpen(true));
        }}
      >
        <SheetHeader className="border-b border-border p-5 pr-20 text-left">
          <SheetTitle className="font-sans">More</SheetTitle>
          <SheetDescription>
            {portal
              ? 'Patient portal and account tools.'
              : 'Workspace destinations and account tools.'}
          </SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 flex-col gap-5 overflow-y-auto p-4">
          {more.length > 0 && (
            <AppNavList
              bootstrap={bootstrap}
              mobile
              sections={more}
              onNavigate={() => setOpen(false)}
            />
          )}
          {utilities.length > 0 && (
            <AppNavList
              bootstrap={bootstrap}
              mobile
              label="Account"
              sections={[{ id: 'account', label: 'Account', items: utilities }]}
              onNavigate={() => setOpen(false)}
            />
          )}
          <div
            className={cn(
              'flex flex-col gap-px',
              (more.length > 0 || utilities.length > 0) && 'border-t border-border pt-3',
            )}
          >
            <Link href="/account" className={utilityClass} onClick={() => setOpen(false)}>
              <UserPen aria-hidden="true" className="size-[18px] shrink-0" />
              Manage profile
            </Link>
            <Link href="/settings" className={utilityClass} onClick={() => setOpen(false)}>
              <Settings aria-hidden="true" className="size-[18px] shrink-0" />
              Your settings
            </Link>
            {canOpenSync && (
              <button
                type="button"
                disabled={!clinicId}
                className={utilityClass}
                onClick={() => {
                  syncAfterClose.current = true;
                  setOpen(false);
                }}
              >
                <RefreshCw aria-hidden="true" className="size-[18px] shrink-0" />
                Saved changes and sync
              </button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
