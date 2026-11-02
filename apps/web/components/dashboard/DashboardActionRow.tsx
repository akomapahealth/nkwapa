'use client';

import Link from 'next/link';
import { AppActionRow } from '@/components/app-shell/AppActionRow';
import { Button } from '@/components/ui/button';
import type { LucideIcon } from 'lucide-react';

interface Action {
  href: string;
  label: string;
  icon: LucideIcon;
  title?: string;
  detail?: string;
}

interface DashboardActionRowProps {
  actions: Action[];
  presentation?: 'buttons' | 'rows';
}

export function DashboardActionRow({ actions, presentation = 'buttons' }: DashboardActionRowProps) {
  if (presentation === 'rows') {
    return (
      <section aria-label="Needs you now">
        <h2 className="type-section-title border-t-2 border-rule-strong pt-4">Needs you now</h2>
        <ul>
          {actions.map(({ href, label, icon, title, detail }) => (
            <AppActionRow
              key={href}
              title={title ?? label}
              detail={detail}
              icon={icon}
              action={
                <Button asChild variant="outline">
                  <Link href={href}>{label}</Link>
                </Button>
              }
            />
          ))}
        </ul>
      </section>
    );
  }
  return (
    <div className="flex flex-wrap gap-3">
      {actions.map(({ href, label, icon: Icon }) => (
        <Button
          key={href}
          asChild
          variant="outline"
          size="sm"
          // No `hover:-translate-y-0.5`. A control that lifts under the cursor moves the row
          // beneath it, and the design system rules out transform-based hover for exactly that.
          // Colour carries the affordance instead.
          className="px-4"
        >
          <Link href={href}>
            <Icon className="mr-2 h-4 w-4" />
            {label}
          </Link>
        </Button>
      ))}
    </div>
  );
}
