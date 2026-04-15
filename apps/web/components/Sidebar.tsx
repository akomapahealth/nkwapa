'use client';

import { Badge } from '@/components/ui/badge';
import { AppNavList } from '@/components/app-shell/AppNavList';
import { useBootstrap } from '@/lib/bootstrap-context';
import { formatRoleLabel } from '@/lib/ops';
import { cn } from '@/lib/utils';

export function Sidebar({ collapsed }: { collapsed: boolean }) {
  const bootstrap = useBootstrap()?.bootstrap ?? null;
  const clinicId = bootstrap?.activeClinicId ?? bootstrap?.memberships?.[0]?.clinicId ?? null;
  const memberships = bootstrap?.memberships ?? [];
  const activeMembership = memberships.find((membership) => membership.clinicId === clinicId);
  const roleLabels = [...(activeMembership?.roles ?? []), ...(bootstrap?.globalRoles ?? [])].slice(
    0,
    3,
  );

  return (
    <aside
      className={cn(
        'sticky top-0 hidden h-screen shrink-0 border-r border-border/70 bg-card/65 backdrop-blur md:flex',
        'transition-[width] duration-300 ease-out',
        collapsed ? 'w-[96px]' : 'w-[320px]',
      )}
    >
      <div className="flex h-full w-full flex-col gap-5 p-4">
        <div className="overflow-hidden rounded-[30px] border border-primary/15 bg-gradient-to-br from-primary/14 via-card to-secondary/12 shadow-lg shadow-primary/5">
          <div className={cn('p-4', collapsed ? 'px-3 py-4' : 'p-5')}>
            <div className={cn('flex items-center gap-3', collapsed && 'justify-center')}>
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-xl font-heading font-semibold text-primary-foreground shadow-lg shadow-primary/25">
                N
              </div>
              {!collapsed && (
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary/80">
                    Nkwapa EMR
                  </p>
                  <p className="mt-1 text-sm font-medium text-foreground">Clinic workspace</p>
                </div>
              )}
            </div>

            {!collapsed && (
              <div className="mt-5 rounded-[24px] border border-border/70 bg-background/80 p-4">
                <p className="text-sm font-medium text-foreground">Daily workflow</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground xl:max-w-[18rem]">
                  Patients, queues, and follow-up work in one place.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <AppNavList bootstrap={bootstrap} collapsed={collapsed} />
        </div>

        <div className="rounded-[26px] border border-border/70 bg-background/80 p-3 shadow-sm">
          {collapsed ? (
            <div className="flex justify-center">
              <Badge variant="outline" className="rounded-full px-2.5 py-1 text-[10px]">
                {activeMembership?.clinicName?.slice(0, 1) ?? 'C'}
              </Badge>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  Active clinic
                </p>
                <p className="mt-2 text-sm font-semibold text-foreground">
                  {activeMembership?.clinicName ?? 'Select a clinic'}
                </p>
              </div>
              {roleLabels.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {roleLabels.map((role) => (
                    <Badge key={role} variant="secondary" className="rounded-full">
                      {formatRoleLabel(role)}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
