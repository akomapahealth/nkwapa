'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useBootstrap } from '@/lib/bootstrap-context';
import { getActiveBootstrapClinic, getBootstrapActiveClinicId } from '@/lib/bootstrap-clinics';
import { Header } from '@/components/Header';
import { Badge } from '@/components/ui/badge';
import { ProgressiveHelp } from '@/components/ui/progressive-help';
import { cn } from '@/lib/utils';

const navItems = [
  {
    href: '/portal',
    label: 'Overview',
    matches: (pathname: string) => pathname === '/portal',
  },
  {
    href: '/portal/health',
    label: 'My Health',
    matches: (pathname: string) =>
      pathname.startsWith('/portal/health') || pathname.startsWith('/portal/self-reports'),
  },
  {
    href: '/portal/appointments',
    label: 'Appointments',
    matches: (pathname: string) => pathname.startsWith('/portal/appointments'),
  },
  {
    href: '/portal/appointments/request',
    label: 'Request Visit',
    matches: (pathname: string) => pathname === '/portal/appointments/request',
  },
] as const;

/**
 * The patient shell.
 *
 * It stays visibly different from the clinical workspace on purpose -- a patient and a clinician
 * must never be unsure which surface they are on -- and the difference is carried by structure,
 * not by a private palette: no nav rail, no chat widget, a named "Patient Portal" band, a reading
 * column at `max-w-6xl` against the workspace's `max-w-[1440px]`, and lower density throughout.
 * The colours, radii and type are the same tokens the workspace uses.
 */
export function PortalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const bootstrap = useBootstrap()?.bootstrap ?? null;
  const activeClinicId = getBootstrapActiveClinicId(bootstrap);
  const activeClinic = getActiveBootstrapClinic(bootstrap, activeClinicId);
  const displayName = bootstrap?.displayName ?? 'Patient';

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/*
        First thing in the tab order, hidden until focused. Without it a keyboard or screen reader
        user walks the whole header and the four-item pill nav on every portal page before reaching
        their own readings. The workspace shell has had this; the portal did not.
      */}
      <a
        href="#main-content"
        className="sr-only focus-visible:not-sr-only focus-visible:absolute focus-visible:left-4 focus-visible:top-4 focus-visible:z-50 focus-visible:rounded-lg focus-visible:bg-background focus-visible:px-4 focus-visible:py-3 focus-visible:text-sm focus-visible:font-medium focus-visible:shadow-sm focus-visible:ring-2 focus-visible:ring-ring"
      >
        Skip to main content
      </a>
      <Header />
      <div className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 md:px-6 lg:px-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="space-y-2">
              <p className="text-eyebrow text-primary">Patient Portal</p>
              <div className="space-y-1">
                <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
                  Welcome back, {displayName.split(' ')[0]}
                </h1>
                <p className="max-w-2xl text-sm text-muted-foreground md:text-base">
                  Your care and visits in one place.
                </p>
                <div className="max-w-2xl pt-2">
                  <ProgressiveHelp title="What you can do here">
                    Review finalized readings, check appointment details, and send visit requests
                    without leaving the portal.
                  </ProgressiveHelp>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="rounded-full px-3 py-1">
                Secure patient access
              </Badge>
              {activeClinic?.clinicName && (
                <Badge variant="outline" className="rounded-full border-border px-3 py-1">
                  {activeClinic.clinicName}
                </Badge>
              )}
            </div>
          </div>
          <nav aria-label="Patient portal" className="flex flex-wrap gap-2">
            {navItems.map((item) => {
              const active = item.matches(pathname);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                    active
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-background text-muted-foreground hover:text-foreground',
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
      <main
        id="main-content"
        tabIndex={-1}
        className="flex-1 overflow-auto px-4 py-6 focus-visible:outline-none md:px-6 lg:px-8"
      >
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
