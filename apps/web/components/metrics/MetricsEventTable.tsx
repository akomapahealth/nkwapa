import { InfoHint } from '@/components/ui/info-hint';
import { failureRate, formatRatio, type MetricsEventTotal } from '@/lib/metrics';
import { cn } from '@/lib/utils';

/**
 * A workflow group's events with their outcomes. A table, not a grid: these are a handful of rows
 * that are read, not searched or sorted.
 */
export function MetricsEventTable({
  title,
  description,
  rows,
}: {
  title: string;
  description: string;
  rows: MetricsEventTotal[];
}) {
  const headingId = `metrics-${title.toLowerCase().replace(/\s+/g, '-')}`;
  return (
    <section className="min-w-0 border-t-2 border-rule-strong pt-3">
      <h3 id={headingId} className="type-label pt-2.5 text-foreground">
        {title}
      </h3>
      <p className="text-xs text-muted-foreground">{description}</p>
      <div
        role="region"
        aria-labelledby={headingId}
        tabIndex={0}
        className="scroll-region mt-2 overflow-x-auto"
      >
        <table aria-labelledby={headingId} className="w-full min-w-[20rem] text-sm">
          <thead>
            <tr className="border-b border-rule text-left text-xs text-muted-foreground">
              <th scope="col" className="py-2 pr-3 font-medium">
                Activity
              </th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">
                Total
              </th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">
                Failed
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                Failure rate
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const rate = failureRate(row);
              return (
                <tr key={row.event} className="border-b border-rule last:border-0">
                  <th scope="row" className="py-2 pr-3 text-left font-normal">
                    <span className="inline-flex items-center gap-1">
                      {row.label}
                      <InfoHint label={row.description} size="sm" />
                    </span>
                  </th>
                  <td className="py-2 pr-3 text-right tabular-nums">{row.total}</td>
                  <td
                    className={cn(
                      'py-2 pr-3 text-right tabular-nums',
                      row.failed > 0 ? 'text-destructive' : 'text-muted-foreground',
                    )}
                  >
                    {row.failed}
                  </td>
                  <td className="py-2 text-right tabular-nums text-muted-foreground">
                    {formatRatio(rate)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
