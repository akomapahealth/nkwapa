"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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

export function MeasurementTrendChart({
  title,
  description,
  emptyMessage,
  lines,
  data,
  valueSuffix = "",
}: MeasurementTrendChartProps) {
  return (
    <Card className="border-border/70 bg-card/95">
      <CardHeader className="space-y-2">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="flex h-[240px] items-center justify-center rounded-2xl border border-dashed border-border/70 bg-muted/20 px-6 text-center text-sm text-muted-foreground">
            {emptyMessage}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              {lines.map((line) => (
                <div key={line.key} className="flex items-center gap-2">
                  <span
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
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11 }}
                    stroke="hsl(var(--muted-foreground))"
                  />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    stroke="hsl(var(--muted-foreground))"
                    domain={["auto", "auto"]}
                  />
                  <Tooltip
                    formatter={(value, key) => {
                      if (value == null) return ["No value", key];
                      return [`${value}${valueSuffix}`, String(key ?? "")];
                    }}
                    labelFormatter={(value) => `${value}`}
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "1rem",
                      color: "hsl(var(--foreground))",
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
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
