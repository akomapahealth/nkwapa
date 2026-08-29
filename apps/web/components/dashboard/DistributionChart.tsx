'use client';

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/feedback/AppState';
import { InfoHint } from '@/components/ui/info-hint';
import { BarChart3 } from 'lucide-react';
import { hasRenderableDistributionData, toDistributionChartData } from './chart-utils';

const COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
];

interface DistributionChartProps {
  title: string;
  hint?: string;
  data: Record<string, number>;
  type?: 'bar' | 'pie';
  emptyMessage?: string;
}

export function DistributionChart({
  title,
  hint,
  data,
  type = 'bar',
  emptyMessage = 'No records have been classified for this chart yet.',
}: DistributionChartProps) {
  const chartData = toDistributionChartData(data);
  const hasData = hasRenderableDistributionData(chartData);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start gap-2">
          <CardTitle className="text-base font-semibold leading-snug">{title}</CardTitle>
          {hint ? <InfoHint label={hint} /> : null}
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[240px] sm:h-[260px]">
          {hasData ? (
            <ResponsiveContainer width="100%" height="100%">
              {type === 'pie' ? (
                <PieChart>
                  {/*
                    Radii as a share of the box, not pixels. At 50/90px the ring plus its legend
                    needed roughly 240px of height and the box is 220px on a phone, so the bottom
                    of the pie was clipped by the legend on exactly the devices used at a clinic
                    bedside. Percentages let recharts size it against whatever height it is given.
                  */}
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="45%"
                    innerRadius="45%"
                    outerRadius="72%"
                    dataKey="value"
                    nameKey="name"
                    label={false}
                    labelLine={false}
                  >
                    {chartData.map((entry, i) => (
                      <Cell key={entry.name} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ paddingTop: 12, fontSize: 12 }} />
                </PieChart>
              ) : (
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(value) =>
                      String(value).length > 14 ? `${String(value).slice(0, 12)}...` : String(value)
                    }
                  />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {chartData.map((entry, i) => (
                      <Cell key={entry.name} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              )}
            </ResponsiveContainer>
          ) : (
            <EmptyState
              icon={BarChart3}
              title="No chart data yet"
              description={emptyMessage}
              className="h-full justify-center"
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

const tooltipStyle = {
  backgroundColor: 'hsl(var(--card))',
  border: '1px solid hsl(var(--border))',
  borderRadius: 'var(--radius)',
  color: 'hsl(var(--foreground))',
};
