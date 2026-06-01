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
    <Card className="border-border/80 bg-card/95">
      <CardHeader className="pb-2">
        <div className="flex items-start gap-2">
          <CardTitle className="text-base font-semibold leading-snug">{title}</CardTitle>
          {hint ? <InfoHint label={hint} /> : null}
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[220px] sm:h-[250px]">
          {hasData ? (
            <ResponsiveContainer width="100%" height="100%">
              {type === 'pie' ? (
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={90}
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
            <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-border/80 bg-muted/30 p-5 text-center">
              <div className="max-w-xs space-y-2">
                <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <BarChart3 className="h-4 w-4" />
                </span>
                <p className="text-sm font-medium text-foreground">No chart data yet</p>
                <p className="text-sm leading-6 text-muted-foreground">{emptyMessage}</p>
              </div>
            </div>
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
