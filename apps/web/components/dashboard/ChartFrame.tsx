'use client';

import { useState, type ReactNode } from 'react';
import { BarChart3, Table2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InfoHint } from '@/components/ui/info-hint';

export interface ChartTableRow {
  label: string;
  value: number;
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
  children,
}: {
  title: string;
  hint?: string;
  /** Header cells for the table view: what the label is, what the value counts. */
  columns: [string, string];
  rows: ChartTableRow[];
  hasData: boolean;
  empty: ReactNode;
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
      {!hasData ? (
        <div className="h-[240px] sm:h-[260px]">{empty}</div>
      ) : showTable ? (
        <table className="mt-2 w-full text-sm">
          <caption className="sr-only">{title}</caption>
          <thead>
            <tr className="border-b border-rule text-left text-muted-foreground">
              <th scope="col" className="py-2 font-medium">
                {columns[0]}
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                {columns[1]}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-b border-rule">
                <th scope="row" className="py-2 text-left font-normal text-foreground">
                  {row.label}
                </th>
                <td className="py-2 text-right tabular-nums text-foreground">{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="mt-2 h-[240px] sm:h-[260px]">{children}</div>
      )}
    </section>
  );
}
