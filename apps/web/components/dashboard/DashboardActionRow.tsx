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
          className="h-10 rounded-2xl border-border/70 bg-background/80 px-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5"
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
