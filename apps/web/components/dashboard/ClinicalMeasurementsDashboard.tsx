'use client';

import { Activity, Cigarette, ClipboardCheck, Ruler, Thermometer, Wind } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DistributionChart } from './DistributionChart';
import { DashboardSectionHeader } from './DashboardSectionHeader';

export interface MeasurementAggregate {
  count: number;
  average: number | null;
}

export interface ClinicalMeasurementMetrics {
  windowDays: 30;
  sampleSize: number;
  vitalsCaptureRate: number;
  tobaccoAssessmentRate: number;
  counselingDocumentationRate: number;
  pendingTobaccoReviews: number;
  measurements: {
    temperatureCelsius: MeasurementAggregate;
    respiratoryRate: MeasurementAggregate;
    spo2Percent: MeasurementAggregate;
    bmi: MeasurementAggregate;
  };
  tobaccoStatusDistribution: Record<string, number>;
}

const LABELS: Record<string, string> = {
  NOT_ASSESSED: 'Not assessed',
  NEVER: 'Never',
  FORMER: 'Former',
  CURRENT: 'Current',
};

export function ClinicalMeasurementsDashboard({
  metrics,
}: {
  metrics: ClinicalMeasurementMetrics;
}) {
  const workflowCards = [
    { label: 'Vitals captured', value: `${metrics.vitalsCaptureRate}%`, icon: ClipboardCheck },
    { label: 'Tobacco assessed', value: `${metrics.tobaccoAssessmentRate}%`, icon: Cigarette },
    {
      label: 'Counseling documented',
      value: `${metrics.counselingDocumentationRate}%`,
      icon: Activity,
    },
    {
      label: 'Pending tobacco reviews',
      value: metrics.pendingTobaccoReviews,
      icon: ClipboardCheck,
    },
  ];
  const measurementCards = [
    {
      label: 'Temperature',
      aggregate: metrics.measurements.temperatureCelsius,
      suffix: ' °C',
      icon: Thermometer,
    },
    {
      label: 'Respiratory rate',
      aggregate: metrics.measurements.respiratoryRate,
      suffix: '/min',
      icon: Wind,
    },
    {
      label: 'SpO₂',
      aggregate: metrics.measurements.spo2Percent,
      suffix: '%',
      icon: Activity,
    },
    { label: 'BMI', aggregate: metrics.measurements.bmi, suffix: '', icon: Ruler },
  ];
  const tobaccoDistribution = Object.fromEntries(
    Object.entries(metrics.tobaccoStatusDistribution).map(([key, value]) => [
      LABELS[key] ?? key,
      value,
    ]),
  );

  return (
    <section className="space-y-5">
      <DashboardSectionHeader
        title="Clinical measurement coverage"
        hint={`Descriptive clinic metrics from ${metrics.sampleSize} encounters in the last ${metrics.windowDays} days. These summaries do not provide diagnosis.`}
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {workflowCards.map(({ label, value, icon: Icon }) => (
          <Card key={label} className="border-border/70 bg-card/95">
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{label}</CardTitle>
              <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {measurementCards.map(({ label, aggregate, suffix, icon: Icon }) => (
          <Card key={label} className="border-border/70 bg-card/95">
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Average {label.toLowerCase()}</CardTitle>
              <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">
                {aggregate.average == null ? 'No data' : `${aggregate.average}${suffix}`}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{aggregate.count} readings</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <DistributionChart
        title="Smoking status documentation"
        data={tobaccoDistribution}
        type="bar"
        hint="Recorded smoking status counts for the same 30-day clinic window."
        emptyMessage="No tobacco screening statuses were recorded in this timeframe."
      />
    </section>
  );
}
