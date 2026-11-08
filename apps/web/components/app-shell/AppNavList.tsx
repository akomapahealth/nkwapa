'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  getAccessibleNavSections,
  getNavItemHref,
  isNavItemActive,
  type AppNavSection,
} from '@/lib/app-nav';
import { getBootstrapActiveClinicId } from '@/lib/bootstrap-clinics';
import type { WhoAmIResponse } from '@/lib/bootstrap-context';

export function AppNavList({
  bootstrap,
  collapsed = false,
  mobile = false,
  rail = false,
  onNavigate,
  label = 'Workspace',
  sections: sectionsOverride,
}: {
  bootstrap: WhoAmIResponse | null;
  collapsed?: boolean;
  mobile?: boolean;
  /** Touch rail: icon above a visible, wrapping label. */
  rail?: boolean;
  onNavigate?: () => void;
  /** The landmark's name; a second list in the same sheet needs its own. */
  label?: string;
  /** Defaults to the sidebar's sections. The phone sheet passes the header and account items. */
  sections?: AppNavSection[];
}) {
  const pathname = usePathname();
  const clinicId = getBootstrapActiveClinicId(bootstrap);
  const sections = sectionsOverride ?? getAccessibleNavSections(bootstrap);

  const showLabels = !collapsed || mobile || rail;

  return (
    <nav aria-label={label} className="flex flex-col gap-4">
      {sections.map((section, index) => (
        <div
          key={section.id}
          // Collapsed, a hairline stands in for the group name between icon groups.
          className={cn((!showLabels || rail) && index > 0 && 'border-t border-border pt-4')}
        >
          {showLabels && (
            <p
              className={cn(
                'px-3 pb-1.5 text-xs font-semibold text-muted-foreground',
                rail && 'sr-only',
              )}
            >
              {section.label}
            </p>
          )}
          <div className="space-y-px">
            {section.items.map((item) => {
              const href = getNavItemHref(item, clinicId);
              const active = isNavItemActive(pathname, item, clinicId);
              const enabled = !item.requiresClinic || Boolean(clinicId);
              const Icon = item.icon;

              /*
                Teal marks only what is selected (MASTER.md section 12): a quiet tint and a bold
                label, with the icon in primary. The row is 44px tall in every state, collapsed
                included, so the rail never trades target size for density.
              */
              const itemClassName = cn(
                'group flex min-h-11 items-center gap-3 rounded-md px-3 text-sm text-foreground transition-colors duration-fast',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                !showLabels && 'justify-center px-0',
                rail &&
                  'flex-col justify-center gap-1 px-0 py-2 text-center text-[0.71875rem] leading-tight focus-visible:ring-inset',
                active
                  ? 'bg-selected font-semibold text-primary'
                  : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground',
              );

              const itemContent = (
                <>
                  <Icon
                    aria-hidden="true"
                    className={cn(
                      'h-[18px] w-[18px] shrink-0',
                      active ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground',
                    )}
                  />
                  <span
                    className={cn(
                      showLabels ? 'min-w-0 flex-1' : 'sr-only',
                      rail ? 'w-full break-words [overflow-wrap:anywhere]' : 'whitespace-normal',
                    )}
                  >
                    {item.label}
                  </span>
                </>
              );

              /*
                A destination that needs a clinic, with no clinic chosen, is not a link.

                It used to stay an <a href> carrying `pointer-events-none opacity-45`, which meant
                a mouse could not click it but a keyboard could still tab to it and press Enter,
                landing on `href="#"`. `opacity-45` also dropped the label under AA. It is now a
                real disabled button: out of the tab order, announced as disabled, and legible.
              */
              const control = enabled ? (
                <Link
                  href={href}
                  onClick={onNavigate}
                  aria-current={active ? 'page' : undefined}
                  className={itemClassName}
                >
                  {itemContent}
                </Link>
              ) : (
                <button
                  type="button"
                  disabled
                  aria-disabled="true"
                  title={`${item.label}: select a clinic first`}
                  className={cn(itemClassName, 'w-full cursor-not-allowed', !rail && 'text-left')}
                >
                  {itemContent}
                </button>
              );

              if (showLabels) {
                return <div key={item.href}>{control}</div>;
              }

              // Icons alone need their names on hover and on keyboard focus.
              return (
                <Tooltip key={item.href}>
                  <TooltipTrigger asChild>{control}</TooltipTrigger>
                  <TooltipContent side="right">{item.label}</TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
