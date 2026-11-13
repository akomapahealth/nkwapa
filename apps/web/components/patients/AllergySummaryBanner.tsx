'use client';

import { statusLabel } from '@/lib/status-presentation';
import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, CircleHelp, History } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { AllergySummary } from '@/lib/medical-history';

const presentations = {
  ACTIVE_ALLERGIES: {
    title: 'Active allergies or adverse reactions',
    description: 'Review these entries before prescribing medication.',
    icon: AlertTriangle,
    className: 'border-destructive/35 bg-destructive/10 text-destructive-ink',
  },
  NO_KNOWN_ALLERGIES: {
    title: 'No known allergies recorded',
    description: 'This is an intentional clinical history state.',
    icon: CheckCircle2,
    className: 'border-success/35 bg-success/10 text-success-ink',
  },
  HISTORICAL_ONLY: {
    title: 'Historical allergies only',
    description: 'No allergy is currently marked active.',
    icon: History,
    className: 'border-warning/35 bg-warning/10 text-warning-ink',
  },
  NOT_RECORDED: {
    title: 'Allergy status not recorded',
    description: 'Confirm allergies or record no known allergies before medication decisions.',
    icon: CircleHelp,
    className: 'border-warning/35 bg-warning/10 text-warning-ink',
  },
  UNAVAILABLE: {
    title: 'Allergy status unavailable',
    description: 'The allergy summary could not be loaded.',
    icon: CircleHelp,
    className: 'border-border bg-muted text-foreground',
  },
} as const;

/** States where the chart still owes an allergy entry. */
export function allergyStatusNeedsEntry(state: AllergySummary['state']): boolean {
  return state === 'NOT_RECORDED' || state === 'HISTORICAL_ONLY';
}

export function AllergySummaryBanner({
  summary,
  compact = false,
  titleAs: Title = 'h3',
  action,
}: {
  summary: AllergySummary;
  compact?: boolean;
  titleAs?: 'h2' | 'h3';
  /** The next step, when the status asks for one. */
  action?: ReactNode;
}) {
  const presentation = presentations[summary.state];
  const Icon = presentation.icon;

  return (
    <section
      aria-label="Allergy status"
      className={cn(
        'rounded-lg border p-4',
        presentation.className,
        compact ? 'space-y-2' : 'space-y-3',
      )}
    >
      <div className="flex flex-wrap items-start gap-3">
        <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <Title className="font-semibold">{presentation.title}</Title>
          <p className="mt-1 text-sm opacity-90">{presentation.description}</p>
        </div>
        {action ? <div className="w-full pl-8 sm:w-auto sm:shrink-0 sm:pl-0">{action}</div> : null}
      </div>
      {summary.activeAllergies.length > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label="Active allergies">
          {summary.activeAllergies.map((allergy) => (
            <li key={allergy.recordId}>
              <Badge variant="destructive" className="gap-1">
                {allergy.substance || 'Unspecified substance'}
                <span aria-hidden="true">·</span>
                {statusLabel(allergy.severity)}
                {allergy.reaction ? ` · ${allergy.reaction}` : ''}
              </Badge>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
