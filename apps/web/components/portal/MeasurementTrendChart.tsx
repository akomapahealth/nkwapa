'use client';

import { LineChartIcon } from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { EmptyState } from '@/components/feedback/AppState';
import { PortalPanel } from '@/components/portal/PortalPanels';

interface TrendLine {
  key: string;
  label: string;
  color: string;
}

interface MeasurementTrendChartProps {
  title: string;
  /**
   * Defaults to `h3`, which is right for the staff chart panel: it nests these under its own
   * section heading. The portal's health page puts them at the top level of the page and passes
   * `h2`.
   */
  headingLevel?: 'h2' | 'h3';
  description: string;
  emptyMessage: string;
  lines: TrendLine[];
  data: Array<Record<string, string | number | null>>;
  valueSuffix?: string;
}

// Axis labels and tooltip values are clinical numbers a patient reads down a column, so the
// digits have to line up. Recharts renders them as SVG text, which the `tabular-nums` utility
// cannot reach; the font feature has to be set on the tick style directly.
const TABULAR_TICK = { fontSize: 11, fontVariantNumeric: 'tabular-nums' } as const;

/*
  A second, non-colour channel for series identity.

  Systolic and diastolic were told apart by stroke colour alone -- same width, same dot, no dash --
  so a reader who cannot separate the two hues had nothing else to go on, and neither did anyone
  printing the page or reading it in forced-colours mode. The dash pattern is drawn in the legend
  swatch as well, so the swatch says which line it names rather than only what colour it is.
*/
const DASHES = [undefined, '7 4', '2 3', '10 3 2 3'] as const;
const dashFor = (index: number) => DASHES[index % DASHES.length];

export function MeasurementTrendChart({
  title,
  headingLevel = 'h3',
  description,
  emptyMessage,
  lines,
  data,
  valueSuffix = '',
}: MeasurementTrendChartProps) {
  return (
    <PortalPanel title={title} headingLevel={headingLevel} description={description}>
      {data.length === 0 ? (
        <EmptyState
          density="compact"
          icon={LineChartIcon}
          title="No readings to chart yet"
          description={emptyMessage}
        />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            {lines.map((line, index) => (
              <div key={line.key} className="flex items-center gap-2">
                <svg aria-hidden="true" width="18" height="10" viewBox="0 0 18 10">
                  <line
                    x1="0"
                    y1="5"
                    x2="18"
                    y2="5"
                    stroke={line.color}
                    strokeWidth="2.5"
                    strokeDasharray={dashFor(index)}
                  />
                </svg>
                <span>{line.label}</span>
              </div>
            ))}
          </div>
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="4 4" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={TABULAR_TICK} stroke="hsl(var(--muted-foreground))" />
                <YAxis
                  tick={TABULAR_TICK}
                  stroke="hsl(var(--muted-foreground))"
                  domain={['auto', 'auto']}
                />
                <Tooltip
                  formatter={(value, key) => {
                    if (value == null) return ['No value', key];
                    return [`${value}${valueSuffix}`, String(key ?? '')];
                  }}
                  labelFormatter={(value) => `${value}`}
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    // The radius scale caps at 14px; this was 1rem, off-scale in both directions.
                    borderRadius: '0.625rem',
                    color: 'hsl(var(--foreground))',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                />
                {lines.map((line, index) => (
                  <Line
                    key={line.key}
                    type="monotone"
                    dataKey={line.key}
                    stroke={line.color}
                    strokeWidth={2.5}
                    strokeDasharray={dashFor(index)}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                    connectNulls
                    // Recharts' default draw-in runs 1500ms and is driven from JavaScript, so the
                    // global prefers-reduced-motion rule in globals.css cannot switch it off.
                    // Nothing in a clinical view animates longer than 200ms anyway.
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </PortalPanel>
  );
}
