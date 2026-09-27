import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { formatRatio, type MetricsFunnel } from '@/lib/metrics';

/**
 * One conversion, drawn as bars against its first step.
 *
 * The bars are proportions of the step that fed them, so a narrow second bar reads as drop-off at
 * a glance; the exact counts sit beside each bar because a bar alone is never the figure.
 */
export function MetricsFunnelCard({ funnel }: { funnel: MetricsFunnel }) {
  const first = funnel.steps[0]?.count ?? 0;
  const headingId = `funnel-${funnel.id}`;

  return (
    <Card aria-labelledby={headingId}>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 pb-3">
        <div className="min-w-0">
          <h3 id={headingId} className="text-sm font-semibold">
            {funnel.label}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">{funnel.description}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-2xl font-semibold tabular-nums">{formatRatio(funnel.conversion)}</p>
          <p className="text-xs text-muted-foreground">converted</p>
        </div>
      </CardHeader>
      <CardContent>
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
                <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-200"
                    style={{ width: `${Math.min(width, 100)}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
