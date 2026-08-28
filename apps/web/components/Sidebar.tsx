'use client';

import Image from 'next/image';
import { Badge } from '@/components/ui/badge';
import { AppNavList } from '@/components/app-shell/AppNavList';
import { useBootstrap } from '@/lib/bootstrap-context';
import { getActiveBootstrapClinic, getBootstrapActiveClinicId } from '@/lib/bootstrap-clinics';
import { formatRoleLabel, getVisibleRoleLabels } from '@/lib/ops';
import { cn } from '@/lib/utils';

export function Sidebar({ collapsed }: { collapsed: boolean }) {
  const bootstrap = useBootstrap()?.bootstrap ?? null;
  const clinicId = getBootstrapActiveClinicId(bootstrap);
  const memberships = bootstrap?.memberships ?? [];
  const activeClinic = getActiveBootstrapClinic(bootstrap, clinicId);
  const activeMembership = memberships.find((membership) => membership.clinicId === clinicId);
  const roleLabels = getVisibleRoleLabels(activeMembership?.roles, bootstrap?.globalRoles);
  const clinicName = activeClinic?.clinicName ?? null;

  return (
    /*
      The rail is `--sidebar`, a soft sage derived in the token contract specifically for it.
      It rendered `bg-card/65` until now, so the token existed with zero consumers and the panel
      was very nearly the same colour as the canvas it was meant to separate from.

      Sidebar ink is `--foreground` and `--sidebar-muted-foreground`, never the standard
      `--muted-foreground`: on this surface that measures 4.49:1 and fails AA. See MASTER.md
      section 3.
    */
    <aside
      id="workspace-sidebar"
      className={cn(
        'sticky top-0 hidden h-screen shrink-0 border-r border-sidebar-border bg-sidebar text-foreground md:flex',
        'transition-[width] duration-200 ease-out',
        collapsed ? 'w-[96px]' : 'w-[320px]',
      )}
    >
      <div className="flex h-full w-full flex-col gap-5 p-4">
        <div className={cn('flex flex-col gap-3', collapsed ? 'items-center' : 'items-start')}>
          {collapsed ? (
            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-background">
              <Image
                src="/images/favicon/android-chrome-192x192.png"
                alt="Nkwapa"
                fill
                sizes="48px"
                className="object-contain"
              />
            </div>
          ) : (
            <div className="relative h-12 w-44 shrink-0">
              <Image
                src="/images/nkwapa-logo.png"
                alt="Nkwapa EMR"
                fill
                sizes="176px"
                className="object-contain object-left"
              />
            </div>
          )}
          {!collapsed && (
            <p className="text-sm font-medium text-sidebar-muted-foreground">Clinic workspace</p>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <AppNavList bootstrap={bootstrap} collapsed={collapsed} />
        </div>

        <div className="rounded-lg border border-sidebar-border bg-background p-3">
          {collapsed ? (
            /*
              Collapsed, this used to be a bare single-letter badge with no accessible name, so a
              screen reader announced "N" and a sighted user got a tooltip only by guessing. The
              letter is decorative now and the clinic name is the label.
            */
            <div className="flex justify-center">
              <Badge
                variant="outline"
                title={clinicName ?? 'No clinic selected'}
                className="rounded-full px-2.5 py-1 text-[10px]"
              >
                <span aria-hidden="true">{clinicName?.slice(0, 1) ?? 'C'}</span>
                <span className="sr-only">
                  {clinicName ? `Active clinic: ${clinicName}` : 'No clinic selected'}
                </span>
              </Badge>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <p className="text-eyebrow text-sidebar-muted-foreground">Active clinic</p>
                <p className="mt-2 text-sm font-semibold text-foreground">
                  {clinicName ?? 'Select a clinic'}
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
