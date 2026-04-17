'use client';

import { InfoHint } from '@/components/ui/info-hint';
import { ProgressiveHelp } from '@/components/ui/progressive-help';

interface DashboardSectionHeaderProps {
  title: string;
  subtitle?: string;
  hint?: string;
  helpLabel?: string;
  helpText?: React.ReactNode;
}

export function DashboardSectionHeader({
  title,
  subtitle,
  hint,
  helpLabel,
  helpText,
}: DashboardSectionHeaderProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <h2 className="font-heading text-xl font-semibold tracking-tight text-foreground">
          {title}
        </h2>
        {hint ? <InfoHint label={hint} /> : null}
      </div>
      {subtitle && <p className="max-w-2xl text-sm text-muted-foreground">{subtitle}</p>}
      {helpText ? (
        <div className="max-w-2xl">
          <ProgressiveHelp title={helpLabel ?? 'How this works'}>{helpText}</ProgressiveHelp>
        </div>
      ) : null}
    </div>
  );
}
