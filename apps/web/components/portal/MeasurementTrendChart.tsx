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

export function MeasurementTrendChart({
  title,
  description,
  emptyMessage,
  lines,
  data,
  valueSuffix = '',
}: MeasurementTrendChartProps) {
  return (
    <PortalPanel title={title} description={description}>
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
            {lines.map((line) => (
              <div key={line.key} className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: line.color }}
                />
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
                {lines.map((line) => (
                  <Line
                    key={line.key}
                    type="monotone"
                    dataKey={line.key}
                    stroke={line.color}
                    strokeWidth={2.5}
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
