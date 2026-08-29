'use client';

import { Activity, Cigarette, ClipboardCheck, Ruler, Thermometer, Wind } from 'lucide-react';
import { DistributionChart } from './DistributionChart';
import { AppMetricCard } from '@/components/app-shell/AppMetricCard';
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
      {/*
        These eight tiles were a hand-rolled copy of AppMetricCard, close enough to look the same
        and different enough to drift: a smaller value, no tabular numerals, and a label that was
        sentence case where every other metric in the product is a small-caps eyebrow.

        The units stay welded to the value rather than moving into `detail`. A clinical average is
        not a number with a footnote; "128 mmHg" is the reading, and splitting it lets someone
        read the figure without seeing what it measures.
      */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {workflowCards.map(({ label, value, icon }) => (
          <AppMetricCard key={label} title={label} value={value} icon={icon} />
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {measurementCards.map(({ label, aggregate, suffix, icon }) => (
          <AppMetricCard
            key={label}
            title={`Average ${label.toLowerCase()}`}
            value={aggregate.average == null ? 'No data' : `${aggregate.average}${suffix}`}
            detail={`${aggregate.count} ${aggregate.count === 1 ? 'reading' : 'readings'}`}
            icon={icon}
          />
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
