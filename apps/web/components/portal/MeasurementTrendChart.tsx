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
import { ChartFrame } from '@/components/dashboard/ChartFrame';

interface TrendLine {
  key: string;
  label: string;
  color: string;
}

interface MeasurementTrendChartProps {
  title: string;
  description: string;
  emptyMessage: string;
  lines: TrendLine[];
  data: Array<Record<string, string | number | null>>;
  valueSuffix?: string;
  /** Staff patient records use the Ruled Chart frame and a literal table of readings. */
  staffRecord?: boolean;
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
  description,
  emptyMessage,
  lines,
  data,
  valueSuffix = '',
  staffRecord = false,
}: MeasurementTrendChartProps) {
  const empty = (
    <EmptyState
      density="compact"
      icon={LineChartIcon}
      title="No readings to chart yet"
      description={emptyMessage}
    />
  );
  const chart = (
    <div className={staffRecord ? 'flex h-full min-h-0 flex-col gap-3' : 'space-y-4'}>
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
      <div className={staffRecord ? 'min-h-0 flex-1' : 'h-[240px]'}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="4 4" stroke="hsl(var(--border))" />
            <XAxis dataKey="label" tick={TABULAR_TICK} stroke="hsl(var(--muted-foreground))" />
            <YAxis
              tick={TABULAR_TICK}
              stroke="hsl(var(--muted-foreground))"
              domain={[
                (min: number) => Math.floor(min - Math.max(Math.abs(min) * 0.05, 1)),
                (max: number) => Math.ceil(max + Math.max(Math.abs(max) * 0.05, 1)),
              ]}
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
                type="linear"
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
  );

  return (
    <ChartFrame
      height={staffRecord ? 260 : 'auto'}
      title={title}
      hint={staffRecord ? description : undefined}
      summary={
        staffRecord ? undefined : (
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
        )
      }
      columns={[
        'Recorded',
        ...lines.map((line) => `${line.label}${valueSuffix ? ` (${valueSuffix.trim()})` : ''}`),
      ]}
      rows={data.map((reading) => ({
        label: String(reading.label ?? ''),
        values: lines.map((line) => reading[line.key] ?? 'Not recorded'),
      }))}
      hasData={data.length > 0}
      empty={empty}
    >
      {chart}
    </ChartFrame>
  );
}
