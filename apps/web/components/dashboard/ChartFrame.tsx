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
  titleAs: Title = 'h3',
  onSelectRow,
  isRowSelectable,
  selectRowLabel,
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
  /** `h2` where the chart sits straight under the page's h1, so no level is skipped (#313). */
  titleAs?: 'h2' | 'h3';
  /** Makes each table row's label a button: the keyboard path to whatever a bar click opens. */
  onSelectRow?: (rowIndex: number) => void;
  /** Rows with nothing behind them stay plain text. */
  isRowSelectable?: (rowIndex: number) => boolean;
  /** The accessible name of a row's button, when `onSelectRow` is set. */
  selectRowLabel?: (row: ChartTableRow) => string;
  children: ReactNode;
}) {
  const [showTable, setShowTable] = useState(false);

  return (
    <section className="min-w-0 border-t-2 border-rule-strong pt-3" data-chart-frame>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 max-w-full items-start gap-2 pt-2.5">
          <Title className="type-label min-w-0 leading-snug text-foreground [overflow-wrap:anywhere]">
            {title}
          </Title>
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
        <div
          role="region"
          aria-label={title}
          tabIndex={0}
          className="scroll-region mt-2 max-w-full overflow-x-auto"
        >
          <table className="w-full text-sm">
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
                    {onSelectRow && (isRowSelectable?.(rowIndex) ?? true) ? (
                      <button
                        type="button"
                        onClick={() => onSelectRow(rowIndex)}
                        aria-label={selectRowLabel?.(row)}
                        className="-mx-1 inline-flex min-h-9 items-center rounded px-1 text-left text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:min-h-11"
                      >
                        {row.label}
                      </button>
                    ) : (
                      row.label
                    )}
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
        </div>
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
