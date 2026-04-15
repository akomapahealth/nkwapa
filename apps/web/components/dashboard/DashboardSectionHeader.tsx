'use client';

import { InfoHint } from '@/components/ui/info-hint';

interface DashboardSectionHeaderProps {
  title: string;
  subtitle?: string;
  hint?: string;
}

export function DashboardSectionHeader({ title, subtitle, hint }: DashboardSectionHeaderProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <h2 className="font-heading text-xl font-semibold tracking-tight text-foreground">
          {title}
        </h2>
        {hint ? <InfoHint label={hint} /> : null}
      </div>
      {subtitle && <p className="max-w-2xl text-sm text-muted-foreground">{subtitle}</p>}
    </div>
  );
}
