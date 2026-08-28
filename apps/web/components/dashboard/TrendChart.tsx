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
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/feedback/AppState';
import { InfoHint } from '@/components/ui/info-hint';
import { Activity } from 'lucide-react';
import { hasRenderableTrendData, type TrendDatum } from './chart-utils';

interface TrendChartProps {
  title: string;
  hint?: string;
  data: TrendDatum[];
  color?: string;
  emptyMessage?: string;
}

export function TrendChart({
  title,
  hint,
  data,
  color = 'hsl(var(--chart-1))',
  emptyMessage = 'No activity has been recorded for this period yet.',
}: TrendChartProps) {
  const hasData = hasRenderableTrendData(data);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <CardTitle className="text-base font-semibold">{title}</CardTitle>
          {hint ? <InfoHint label={hint} /> : null}
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[240px] sm:h-[260px]">
          {hasData ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => {
                    const d = new Date(v);
                    return `${d.getMonth() + 1}/${d.getDate()}`;
                  }}
                />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip
                  labelFormatter={(v) => new Date(v as string).toLocaleDateString()}
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: 'var(--radius)',
                    color: 'hsl(var(--foreground))',
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke={color}
                  strokeWidth={2.5}
                  dot={{ r: 2.5 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState
              icon={Activity}
              title="No chart activity yet"
              description={emptyMessage}
              className="h-full justify-center"
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
