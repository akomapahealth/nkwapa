'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useBootstrap } from '@/lib/bootstrap-context';
import { Header } from '@/components/Header';
import { Badge } from '@/components/ui/badge';
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

export function PortalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const bootstrap = useBootstrap()?.bootstrap ?? null;
  const activeClinicId = bootstrap?.activeClinicId ?? bootstrap?.memberships?.[0]?.clinicId ?? null;
  const activeClinic = bootstrap?.memberships.find(
    (membership) => membership.clinicId === activeClinicId,
  );
  const displayName = bootstrap?.displayName ?? 'Patient';

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <div className="border-b border-border/70 bg-card/70">
        <div className="landing-hero-mesh">
          <div className="mx-auto max-w-6xl px-4 py-6 md:px-6 lg:px-8">
            <div className="overflow-hidden rounded-[28px] border border-border/70 bg-card/90 shadow-sm backdrop-blur">
              <div className="relative overflow-hidden px-5 py-6 md:px-8">
                <div className="absolute inset-y-0 right-0 hidden w-1/3 bg-gradient-to-l from-primary/10 via-secondary/10 to-transparent md:block" />
                <div className="relative flex flex-col gap-6">
                  <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary/80">
                        Patient Portal
                      </p>
                      <div className="space-y-1">
                        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
                          Welcome back, {displayName.split(' ')[0]}
                        </h1>
                        <p className="max-w-2xl text-sm text-muted-foreground md:text-base">
                          Track your readings, review your care plan, and stay on top of upcoming
                          visits in one place.
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary" className="rounded-full px-3 py-1">
                        Secure patient access
                      </Badge>
                      {activeClinic?.clinicName && (
                        <Badge
                          variant="outline"
                          className="rounded-full bg-background/70 px-3 py-1"
                        >
                          {activeClinic.clinicName}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <nav className="flex flex-wrap gap-2">
                    {navItems.map((item) => {
                      const active = item.matches(pathname);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={cn(
                            'rounded-full border px-4 py-2 text-sm font-medium transition-all',
                            active
                              ? 'border-primary bg-primary text-primary-foreground shadow'
                              : 'border-border/70 bg-background/80 text-muted-foreground hover:border-primary/40 hover:text-foreground',
                          )}
                        >
                          {item.label}
                        </Link>
                      );
                    })}
                  </nav>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <main className="flex-1 overflow-auto px-4 py-6 md:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
