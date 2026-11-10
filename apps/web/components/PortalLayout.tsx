'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useBootstrap } from '@/lib/bootstrap-context';
import { getActiveBootstrapClinic, getBootstrapActiveClinicId } from '@/lib/bootstrap-clinics';
import { Header } from '@/components/Header';
import { NavigationProgress } from '@/components/app-shell/NavigationProgress';
import { cn } from '@/lib/utils';
import { BottomNav } from '@/components/app-shell/BottomNav';
import { portalNavItems } from '@/lib/portal-nav';
import { useSyncRecoveryAvailability } from '@/lib/use-sync-recovery-availability';

export function PortalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const bootstrap = useBootstrap()?.bootstrap ?? null;
  const activeClinicId = getBootstrapActiveClinicId(bootstrap);
  const activeClinic = getActiveBootstrapClinic(bootstrap, activeClinicId);
  const canOpenSync = useSyncRecoveryAvailability(bootstrap);
  const displayName = bootstrap?.displayName ?? 'Patient';

  return (
    <div className="flex min-h-screen min-w-0 flex-col bg-card px-safe [--workspace-bottom-nav-height:3.75rem] compact:m-2 compact:rounded-xl compact:border compact:border-border compact:[--workspace-bottom-nav-height:0px]">
      <a
        href="#main-content"
        className="sr-only focus-visible:not-sr-only focus-visible:absolute focus-visible:left-4 focus-visible:top-4 focus-visible:z-50 focus-visible:rounded-lg focus-visible:bg-background focus-visible:px-4 focus-visible:py-3 focus-visible:text-sm focus-visible:font-medium focus-visible:shadow-sm focus-visible:ring-2 focus-visible:ring-ring"
      >
        Skip to main content
      </a>
      <NavigationProgress />
      <Header portal />
      <section aria-labelledby="portal-context-title" className="border-b border-border">
        <div className="mx-auto max-w-5xl px-4 md:px-6">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-4">
            <h1
              id="portal-context-title"
              className="font-heading text-2xl font-semibold text-foreground"
            >
              {pathname === '/portal'
                ? `Welcome back, ${displayName.split(' ')[0]}`
                : 'Patient portal'}
            </h1>
            {activeClinic?.clinicName && (
              <p className="text-sm text-muted-foreground">{activeClinic.clinicName}</p>
            )}
          </div>
          <nav
            aria-label="Patient portal"
            className="hidden flex-wrap gap-x-4 border-t border-border compact:flex"
          >
            {portalNavItems.map((item) => {
              const Icon = item.icon;
              const active = item.matches(pathname);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={pathname === item.href ? 'page' : active ? 'location' : undefined}
                  className={cn(
                    'inline-flex min-h-14 flex-col items-center justify-center gap-1 border-b-2 px-1 text-center text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:min-h-11 sm:flex-row sm:gap-2 sm:px-3',
                    active
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Icon aria-hidden="true" className="size-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </section>
      <main
        id="main-content"
        tabIndex={-1}
        className="min-w-0 flex-1 overflow-auto [&_button]:min-h-11 [&_button]:min-w-11 [&_input]:min-h-11 [&_select]:min-h-11 [&_textarea]:min-h-11 px-4 py-6 pb-[calc(6rem+env(safe-area-inset-bottom))] compact:pb-[calc(1.5rem+env(safe-area-inset-bottom))] focus-visible:outline-none md:px-6 lg:px-8"
      >
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>
      <BottomNav portal canOpenSync={canOpenSync} />
    </div>
  );
}
