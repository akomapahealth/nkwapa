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
}

export function DistributionChart({ title, hint, data, type = 'bar' }: DistributionChartProps) {
  const chartData = Object.entries(data).map(([name, value]) => ({
    name,
    value,
  }));

  return (
    <Card className="overflow-hidden border-border/80 bg-card/95">
      <CardHeader className="pb-2">
        <div className="flex items-start gap-2">
          <CardTitle className="text-base font-semibold leading-snug">{title}</CardTitle>
          {hint ? <InfoHint label={hint} /> : null}
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[220px] sm:h-[250px]">
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
                  {chartData.map((_, i) => (
                    <Cell key={`cell-${i}`} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: 'var(--radius)',
                    color: 'hsl(var(--foreground))',
                  }}
                />
                <Legend wrapperStyle={{ paddingTop: 12, fontSize: 12 }} />
              </PieChart>
            ) : (
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(value) =>
                    String(value).length > 14 ? `${String(value).slice(0, 12)}…` : String(value)
                  }
                />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: 'var(--radius)',
                    color: 'hsl(var(--foreground))',
                  }}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {chartData.map((_, i) => (
                    <Cell key={`cell-${i}`} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
