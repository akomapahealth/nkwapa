'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import type { LucideIcon } from 'lucide-react';

interface Action {
  href: string;
  label: string;
  icon: LucideIcon;
}

interface DashboardActionRowProps {
  actions: Action[];
}

export function DashboardActionRow({ actions }: DashboardActionRowProps) {
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
