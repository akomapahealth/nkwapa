import type { ReactNode } from 'react';
import { AppMetricCard, METRIC_ROW, type MetricTone } from '@/components/app-shell/AppMetricCard';

export interface Figure {
  value: ReactNode;
  unit?: string;
  label: string;
  tone?: MetricTone;
}

/** The role's own figures share the same separate, breathing treatment as list summaries. */
export function FigureStrip({ label, figures }: { label: string; figures: Figure[] }) {
  const needsAction = (figure: Figure) =>
    figure.tone === 'attention' && figure.value !== 0 && figure.value !== '0';
  const ordered = [
    ...figures.filter(needsAction),
    ...figures.filter((figure) => !needsAction(figure)),
  ];
  return (
    <ul
      aria-label={label}
      data-testid="figure-strip"
      tabIndex={0}
      className={`${METRIC_ROW} rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring`}
    >
      {ordered.map((figure) => (
        <li key={figure.label} className="min-w-0 max-w-full shrink-0">
          <AppMetricCard
            title={figure.label}
            value={figure.value}
            unit={figure.unit}
            tone={figure.tone}
          />
        </li>
      ))}
    </ul>
  );
}
