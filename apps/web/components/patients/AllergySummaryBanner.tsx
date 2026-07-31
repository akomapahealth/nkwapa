'use client';

import { AlertTriangle, CheckCircle2, CircleHelp, History } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { AllergySummary } from '@/lib/medical-history';

const presentations = {
  ACTIVE_ALLERGIES: {
    title: 'Active allergies or adverse reactions',
    description: 'Review these entries before prescribing medication.',
    icon: AlertTriangle,
    className: 'border-destructive/35 bg-destructive/10 text-destructive dark:bg-destructive/15',
  },
  NO_KNOWN_ALLERGIES: {
    title: 'No known allergies recorded',
    description: 'This is an intentional clinical history state.',
    icon: CheckCircle2,
    className: 'border-emerald-500/35 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300',
  },
  HISTORICAL_ONLY: {
    title: 'Historical allergies only',
    description: 'No allergy is currently marked active.',
    icon: History,
    className: 'border-amber-500/35 bg-amber-500/10 text-amber-900 dark:text-amber-300',
  },
  NOT_RECORDED: {
    title: 'Allergy status not recorded',
    description: 'Confirm allergies or record no known allergies before medication decisions.',
    icon: CircleHelp,
    className: 'border-amber-500/35 bg-amber-500/10 text-amber-900 dark:text-amber-300',
  },
  UNAVAILABLE: {
    title: 'Allergy status unavailable',
    description: 'The allergy summary could not be loaded.',
    icon: CircleHelp,
    className: 'border-border bg-muted/50 text-foreground',
  },
} as const;

export function AllergySummaryBanner({
  summary,
  compact = false,
}: {
  summary: AllergySummary;
  compact?: boolean;
}) {
  const presentation = presentations[summary.state];
  const Icon = presentation.icon;

  return (
    <section
      aria-label="Allergy status"
      className={cn(
        'rounded-3xl border p-4',
        presentation.className,
        compact ? 'space-y-2' : 'space-y-3',
      )}
    >
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">{presentation.title}</h2>
          <p className="mt-1 text-sm opacity-90">{presentation.description}</p>
        </div>
      </div>
      {summary.activeAllergies.length > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label="Active allergies">
          {summary.activeAllergies.map((allergy) => (
            <li key={allergy.recordId}>
              <Badge variant="destructive" className="gap-1">
                {allergy.substance || 'Unspecified substance'}
                <span aria-hidden="true">·</span>
                {allergy.severity}
                {allergy.reaction ? ` · ${allergy.reaction}` : ''}
              </Badge>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
