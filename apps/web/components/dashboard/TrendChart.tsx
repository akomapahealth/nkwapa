'use client';

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { EmptyState } from '@/components/feedback/AppState';
import { Activity } from 'lucide-react';
import { ChartFrame } from './ChartFrame';
import { hasRenderableTrendData, parseChartDate, type TrendDatum } from './chart-utils';

interface TrendChartProps {
  title: string;
  hint?: string;
  data: TrendDatum[];
  color?: string;
  emptyMessage?: string;
  titleAs?: 'h2' | 'h3';
  /** One point per day (default) or per month, dated the 1st. Sets the axis and table labels. */
  period?: 'day' | 'month';
}

/*
  Recharts renders axis ticks as SVG <text>, so the `tabular-nums` utility cannot reach them and
  the figures have to be asked for here. Without it a count going 9 -> 10 shifts the whole axis.
*/
const TICK = {
  fontSize: 11,
  fontVariantNumeric: 'tabular-nums' as const,
  fill: 'hsl(var(--muted-foreground))',
};

export function TrendChart({
  title,
  hint,
  data,
  color = 'hsl(var(--chart-1))',
  emptyMessage = 'No activity has been recorded for this period yet.',
  titleAs,
  period = 'day',
}: TrendChartProps) {
  const hasData = hasRenderableTrendData(data);
  const monthly = period === 'month';
  const fullLabel = (value: string | number | Date) =>
    monthly
      ? parseChartDate(value).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
      : parseChartDate(value).toLocaleDateString();

  return (
    <ChartFrame
      title={title}
      titleAs={titleAs}
      hint={hint}
      columns={[monthly ? 'Month' : 'Day', 'Count']}
      rows={data.map((point) => ({
        label: fullLabel(point.date),
        values: [point.count],
      }))}
      hasData={hasData}
      empty={
        <EmptyState
          icon={Activity}
          title="No chart activity yet"
          description={emptyMessage}
          className="h-full justify-center"
        />
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis
            dataKey="date"
            tick={TICK}
            tickFormatter={(v) => {
              const d = parseChartDate(v);
              return monthly
                ? d.toLocaleDateString(undefined, { month: 'short' })
                : `${d.getMonth() + 1}/${d.getDate()}`;
            }}
          />
          <YAxis tick={TICK} allowDecimals={false} />
          <Tooltip
            labelFormatter={(v) => fullLabel(v as string)}
            contentStyle={{
              backgroundColor: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: 'var(--radius)',
              color: 'hsl(var(--foreground))',
            }}
          />
          <Line
            // Straight segments between real daily counts: a curve would draw values between
            // days that were never recorded (MASTER.md section 12).
            type="linear"
            dataKey="count"
            stroke={color}
            strokeWidth={2.5}
            dot={{ r: 2.5 }}
            activeDot={{ r: 5 }}
            // Recharts draws in over 1500ms in JavaScript, which the global
            // prefers-reduced-motion rule cannot reach.
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
