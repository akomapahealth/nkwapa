'use client';

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  LabelList,
} from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/feedback/AppState';
import { InfoHint } from '@/components/ui/info-hint';
import { BarChart3 } from 'lucide-react';
import { hasRenderableDistributionData, toDistributionChartData } from './chart-utils';

/** A clinical reading of a category, for the charts where one exists. */
export type DistributionTone = 'neutral' | 'success' | 'warning' | 'destructive';

const TONE_FILL: Record<DistributionTone, string> = {
  neutral: 'hsl(var(--muted-foreground))',
  success: 'hsl(var(--success))',
  warning: 'hsl(var(--warning))',
  destructive: 'hsl(var(--destructive))',
};

/*
  Recharts renders axis ticks as SVG <text>, which the `tabular-nums` utility cannot reach, so the
  figures have to be asked for here. Without it a count going 9 -> 10 shifts the whole axis.
*/
const TICK = {
  fontSize: 11,
  fontVariantNumeric: 'tabular-nums' as const,
  fill: 'hsl(var(--muted-foreground))',
};

interface DistributionChartProps {
  title: string;
  hint?: string;
  data: Record<string, number>;
  emptyMessage?: string;
  /**
   * Fixed category order. Anything not listed follows in the order it arrived.
   *
   * Ordered categories -- severity bands, stages, tiers -- must not be sorted by count, because
   * the order is itself information.
   */
  order?: readonly string[];
  /** Clinical reading per category. Omit where categories are merely different, not better/worse. */
  tones?: Readonly<Record<string, DistributionTone>>;
  /** Horizontal bars keep long category names readable instead of truncating them to 12 chars. */
  layout?: 'vertical' | 'horizontal';
}

export function DistributionChart({
  title,
  hint,
  data,
  emptyMessage = 'No records have been classified for this chart yet.',
  order,
  tones,
  layout = 'vertical',
}: DistributionChartProps) {
  const unordered = toDistributionChartData(data);
  const chartData = order
    ? [...unordered].sort((a, b) => {
        const ai = order.indexOf(a.name);
        const bi = order.indexOf(b.name);
        return (ai === -1 ? order.length : ai) - (bi === -1 ? order.length : bi);
      })
    : unordered;
  const hasData = hasRenderableDistributionData(chartData);
  const isHorizontal = layout === 'horizontal';

  /*
    One fill for every bar unless a category carries a clinical reading.

    Colouring each bar a different series hue was re-encoding what the bar length and the axis
    label already say, and it spent the identity channel to do it. It also meant that a chart with
    more categories than the five-slot ramp silently drew two of them the same colour: the
    hypertension donut this replaced had six classifications, so NORMAL and UNKNOWN came out the
    same teal, with no direct labels and only legend order to tell them apart.

    That donut is gone rather than recoloured. Blood-pressure classification is ordered data, and
    a pie is the one form where any two slices can touch, which caps a colourblind-safe palette at
    about three series. Bars put the category on an axis, so colour never has to carry identity.
  */
  const fillFor = (name: string) =>
    tones?.[name] ? TONE_FILL[tones[name]] : 'hsl(var(--chart-1))';

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
              <BarChart
                data={chartData}
                layout={isHorizontal ? 'vertical' : 'horizontal'}
                margin={
                  isHorizontal ? { top: 4, right: 36, bottom: 4, left: 4 } : { top: 18, right: 8 }
                }
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="hsl(var(--border))"
                  horizontal={!isHorizontal}
                  vertical={isHorizontal}
                />
                {isHorizontal ? (
                  <>
                    <XAxis type="number" tick={TICK} allowDecimals={false} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      tick={TICK}
                      width={110}
                      interval={0}
                      axisLine={false}
                      tickLine={false}
                    />
                  </>
                ) : (
                  <>
                    <XAxis
                      dataKey="name"
                      tick={TICK}
                      tickFormatter={(value) =>
                        String(value).length > 14
                          ? `${String(value).slice(0, 12)}...`
                          : String(value)
                      }
                    />
                    <YAxis tick={TICK} allowDecimals={false} />
                  </>
                )}
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'hsl(var(--accent))' }} />
                <Bar
                  dataKey="value"
                  radius={isHorizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}
                  // Recharts animates over 1500ms in JavaScript, which the global
                  // prefers-reduced-motion rule cannot reach.
                  isAnimationActive={false}
                >
                  {chartData.map((entry) => (
                    <Cell key={entry.name} fill={fillFor(entry.name)} />
                  ))}
                  {/* The count in text, so the chart is readable without reading the axis --
                      and so no series depends on its fill being distinguishable. */}
                  <LabelList
                    dataKey="value"
                    position={isHorizontal ? 'right' : 'top'}
                    style={{
                      fontSize: 11,
                      fontVariantNumeric: 'tabular-nums',
                      fill: 'hsl(var(--foreground))',
                    }}
                  />
                </Bar>
              </BarChart>
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
