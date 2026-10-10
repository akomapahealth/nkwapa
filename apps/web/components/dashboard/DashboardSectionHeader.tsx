'use client';

import { InfoHint } from '@/components/ui/info-hint';

interface DashboardSectionHeaderProps {
  title: string;
  subtitle?: string;
  hint?: string;
}

/*
  A section heading with optional contextual help.

  The `helpLabel` / `helpText` props that used to hang off this rendered a ProgressiveHelp
  disclosure, and no caller ever passed them -- six dashboards import this component and every one
  of them passes `hint` alone. Deleting a dead branch is most of what #63 asks for on this surface;
  the dashboards had already converged on the bubble.
*/
export function DashboardSectionHeader({ title, subtitle, hint }: DashboardSectionHeaderProps) {
  return (
    <div className="space-y-2">
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
