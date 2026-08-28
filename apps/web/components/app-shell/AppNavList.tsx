'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { getAccessibleNavSections, getNavItemHref, isNavItemActive } from '@/lib/app-nav';
import { getBootstrapActiveClinicId } from '@/lib/bootstrap-clinics';
import type { WhoAmIResponse } from '@/lib/bootstrap-context';

export function AppNavList({
  bootstrap,
  collapsed = false,
  mobile = false,
  onNavigate,
}: {
  bootstrap: WhoAmIResponse | null;
  collapsed?: boolean;
  mobile?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const clinicId = getBootstrapActiveClinicId(bootstrap);
  const sections = getAccessibleNavSections(bootstrap);

  return (
    <nav className="flex flex-col gap-4">
      {sections.map((section) => (
        <div key={section.id} className="space-y-2">
          {(!collapsed || mobile) && (
            <p className="text-eyebrow px-3 text-sidebar-muted-foreground">{section.label}</p>
          )}
          <div className="space-y-1">
            {section.items.map((item) => {
              const href = getNavItemHref(item, clinicId);
              const active = isNavItemActive(pathname, item, clinicId);
              const enabled = !item.requiresClinic || Boolean(clinicId);
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={href}
                  title={collapsed && !mobile ? item.label : undefined}
                  onClick={enabled ? onNavigate : undefined}
                  className={cn(
                    'group flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-all duration-200',
                    collapsed && !mobile ? 'justify-center px-2.5' : '',
                    active
                      ? 'border-primary/30 bg-primary text-primary-foreground'
                      : 'border-transparent text-muted-foreground hover:border-border/70 hover:bg-background/80 hover:text-foreground',
                    !enabled && 'pointer-events-none opacity-45',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors',
                      active
                        ? 'bg-primary-foreground/16 text-primary-foreground'
                        : 'bg-background/80 text-primary group-hover:bg-primary/10',
                    )}
                  >
                    <Icon className="h-[18px] w-[18px]" />
                  </span>
                  {(!collapsed || mobile) && (
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{item.label}</span>
                      <span
                        className={cn(
                          'mt-0.5 hidden truncate text-xs xl:block',
                          active
                            ? 'text-primary-foreground/80'
                            : 'text-muted-foreground group-hover:text-muted-foreground',
                        )}
                      >
                        {item.description}
                      </span>
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
