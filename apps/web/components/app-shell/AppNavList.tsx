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

              const itemClassName = cn(
                'group flex min-h-11 items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors duration-150',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                collapsed && !mobile ? 'justify-center px-2.5' : '',
                active
                  ? 'border-primary/30 bg-primary text-primary-foreground'
                  : 'border-transparent text-foreground hover:border-sidebar-border hover:bg-card hover:text-foreground',
              );

              const itemContent = (
                <>
                  <span
                    className={cn(
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors',
                      active
                        ? 'bg-primary-foreground/20 text-primary-foreground'
                        : 'bg-card text-primary group-hover:bg-primary/10',
                    )}
                  >
                    <Icon aria-hidden="true" className="h-[18px] w-[18px]" />
                  </span>
                  {(!collapsed || mobile) && (
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{item.label}</span>
                      <span
                        className={cn(
                          'mt-0.5 hidden truncate text-xs xl:block',
                          active ? 'text-primary-foreground/80' : 'text-sidebar-muted-foreground',
                        )}
                      >
                        {item.description}
                      </span>
                    </span>
                  )}
                </>
              );

              /*
                A destination that needs a clinic, with no clinic chosen, is not a link.

                It used to stay an <a href> carrying `pointer-events-none opacity-45`, which meant
                a mouse could not click it but a keyboard could still tab to it and press Enter,
                landing on `href="#"`. `opacity-45` also dropped the label under AA. It is now a
                real disabled button: out of the tab order, announced as disabled, and legible.
              */
              if (!enabled) {
                return (
                  <button
                    key={item.href}
                    type="button"
                    disabled
                    aria-disabled="true"
                    title={`${item.label} — select a clinic first`}
                    className={cn(itemClassName, 'w-full cursor-not-allowed text-left opacity-70')}
                  >
                    {itemContent}
                  </button>
                );
              }

              return (
                <Link
                  key={item.href}
                  href={href}
                  title={collapsed && !mobile ? item.label : undefined}
                  onClick={onNavigate}
                  aria-current={active ? 'page' : undefined}
                  className={itemClassName}
                >
                  {itemContent}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
