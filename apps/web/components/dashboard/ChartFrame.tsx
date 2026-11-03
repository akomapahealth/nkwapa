'use client';

import { useState, type ReactNode } from 'react';
import { BarChart3, Table2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InfoHint } from '@/components/ui/info-hint';

export interface ChartTableRow {
  label: string;
  /** One cell per value column, already formatted where a unit applies ("12 min"). */
  values: (number | string)[];
}

/**
 * A dashboard chart on a ruled surface, with the same numbers one press away as a table
 * (MASTER.md section 12). The table is for anyone who would rather read than estimate bar
 * heights, and for screen readers, which get nothing useful from the SVG.
 */
export function ChartFrame({
  title,
  hint,
  columns,
  rows,
  hasData,
  empty,
  height,
  summary,
  children,
}: {
  title: string;
  hint?: string;
  /** Header cells for the table view: what the label is, then what each value counts. */
  columns: [string, ...string[]];
  rows: ChartTableRow[];
  hasData: boolean;
  empty: ReactNode;
  /** Fixed chart height in px, for charts sized by their row count; `auto` for HTML bars. */
  height?: number | 'auto';
  /** Always-visible lead under the title: a headline figure or a one-line description. */
  summary?: ReactNode;
  children: ReactNode;
}) {
  const [showTable, setShowTable] = useState(false);

  return (
    <section className="min-w-0 border-t-2 border-rule-strong pt-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2 pt-2.5">
          <h3 className="type-label leading-snug text-foreground">{title}</h3>
          {hint ? <InfoHint label={hint} size="sm" /> : null}
        </div>
        {hasData ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-pressed={showTable}
            onClick={() => setShowTable((current) => !current)}
            className="min-h-11 shrink-0 px-3 text-muted-foreground"
          >
            {showTable ? <BarChart3 aria-hidden="true" /> : <Table2 aria-hidden="true" />}
            {showTable ? 'Show chart' : 'Show table'}
          </Button>
        ) : null}
      </div>
      {summary}
      {!hasData ? (
        // A fixed-height chart's empty note needs no room for a chart.
        <div className={height ? undefined : 'h-[240px] sm:h-[260px]'}>{empty}</div>
      ) : showTable ? (
        <table className="mt-2 w-full text-sm">
          <caption className="sr-only">{title}</caption>
          <thead>
            <tr className="border-b border-rule text-left text-muted-foreground">
              {columns.map((column, index) => (
                <th
                  key={column}
                  scope="col"
                  className={index ? 'py-2 pl-3 text-right font-medium' : 'py-2 font-medium'}
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={`${row.label}-${rowIndex}`} className="border-b border-rule">
                <th scope="row" className="py-2 text-left font-normal text-foreground">
                  {row.label}
                </th>
                {row.values.map((value, index) => (
                  <td key={index} className="py-2 pl-3 text-right tabular-nums text-foreground">
                    {value}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div
          className={height ? 'mt-2' : 'mt-2 h-[240px] sm:h-[260px]'}
          style={typeof height === 'number' ? { height } : undefined}
        >
          {children}
        </div>
      )}
    </section>
  );
}
