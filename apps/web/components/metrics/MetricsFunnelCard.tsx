import { ChartFrame } from '@/components/dashboard/ChartFrame';
import { formatRatio, type MetricsFunnel } from '@/lib/metrics';

/**
 * One conversion, drawn as bars against its first step.
 *
 * The bars are proportions of the step that fed them, so a narrow second bar reads as drop-off at
 * a glance; the exact counts sit beside each bar because a bar alone is never the figure. The
 * table view states each step's share of the first in words.
 */
export function MetricsFunnelCard({ funnel }: { funnel: MetricsFunnel }) {
  const first = funnel.steps[0]?.count ?? 0;
  const share = (count: number) => (first > 0 ? formatRatio(count / first) : '–');

  return (
    <ChartFrame
      title={funnel.label}
      columns={['Step', 'Count', 'Share of first step']}
      rows={funnel.steps.map((step) => ({
        label: step.label,
        values: [step.count, share(step.count)],
      }))}
      hasData={funnel.steps.length > 0}
      empty={<p className="py-4 text-sm text-muted-foreground">No steps recorded.</p>}
      height="auto"
      summary={
        <div className="mt-1 flex items-baseline justify-between gap-3">
          <p className="text-xs text-muted-foreground">{funnel.description}</p>
          <p className="shrink-0 text-right">
            <span className="type-metric tabular-nums">{formatRatio(funnel.conversion)}</span>{' '}
            <span className="text-xs text-muted-foreground">converted</span>
          </p>
        </div>
      }
    >
      <ol className="space-y-2">
        {funnel.steps.map((step) => {
          const width =
            first > 0 ? Math.max((step.count / first) * 100, step.count > 0 ? 2 : 0) : 0;
          return (
            <li key={step.event} className="space-y-1">
              <div className="flex items-baseline justify-between gap-3 text-xs">
                <span className="text-muted-foreground">{step.label}</span>
                <span className="font-medium tabular-nums">{step.count}</span>
              </div>
              <div className="h-2 bg-muted" aria-hidden="true">
                <div className="h-full bg-chart-1" style={{ width: `${Math.min(width, 100)}%` }} />
              </div>
            </li>
          );
        })}
      </ol>
    </ChartFrame>
  );
}
