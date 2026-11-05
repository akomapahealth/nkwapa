'use client';

import { useEffect, useState } from 'react';
import {
  Activity,
  CalendarClock,
  HeartPulse,
  Scale,
  Syringe,
  Thermometer,
  Wind,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useClinicUnits } from '@/lib/bootstrap-context';
import { glucoseUnitLabel, weightUnitLabel } from '@/lib/measurement-entry';
import { fetchStaffPatientTrends, type PatientTrendsResponse } from '@/lib/patient-portal';
import {
  TREND_RANGE_OPTIONS,
  buildBloodPressureTrendData,
  buildExpandedVitalsTrendData,
  expandedVitalInUnits,
  buildGlucoseTrendData,
  formatTrendRangeFrom,
  getLatestExpandedVital,
  type ExpandedMeasurementKey,
  type TrendRangeDays,
} from '@/lib/patient-trends';
import { MeasurementTrendChart } from '@/components/portal/MeasurementTrendChart';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  RecordSection as Card,
  RecordSectionContent as CardContent,
  RecordSectionDescription as CardDescription,
  RecordSectionHeader as CardHeader,
} from '@/components/patients/RecordSection';
import {
  ChartSectionError,
  ChartSectionLoading,
} from '@/components/patients/chart/ChartSectionState';

const FOLLOW_UP_LABELS: Array<{
  key: keyof PatientTrendsResponse['followUp'];
  label: string;
}> = [
  { key: 'requested', label: 'Requested' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'completed', label: 'Completed' },
  { key: 'noShow', label: 'No-show' },
  { key: 'closed', label: 'Closed' },
];

const EXPANDED_MEASUREMENTS: Array<{
  key: ExpandedMeasurementKey;
  label: string;
  suffix: string;
  icon: typeof Thermometer;
}> = [
  { key: 'temperatureCelsius', label: 'Temperature', suffix: ' °C', icon: Thermometer },
  { key: 'respiratoryRate', label: 'Respiratory rate', suffix: '/min', icon: Wind },
  { key: 'spo2Percent', label: 'SpO₂', suffix: '%', icon: Activity },
  // The suffix is the clinic's weight unit, filled in where the units are known.
  { key: 'weightKg', label: 'Weight', suffix: '', icon: Scale },
  { key: 'bmi', label: 'BMI', suffix: '', icon: HeartPulse },
];

interface PatientTrendsPanelProps {
  patientId: string;
  clinicId: string;
}

export function PatientTrendsPanel({ patientId, clinicId }: PatientTrendsPanelProps) {
  const getToken = useAuth();
  const units = useClinicUnits(clinicId);
  const suffixFor = (key: string, suffix: string) =>
    key === 'weightKg' ? ` ${weightUnitLabel(units.bodyUnit)}` : suffix;
  const [rangeDays, setRangeDays] = useState<TrendRangeDays>(90);
  const [trends, setTrends] = useState<PatientTrendsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMeasurement, setSelectedMeasurement] =
    useState<ExpandedMeasurementKey>('spo2Percent');
  // A failed load must be recoverable without a full page reload; bumping this re-runs the fetch.
  const [reloadNonce, setReloadNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!clinicId || !patientId || !getToken) return;

      setLoading(true);
      setError(null);
      try {
        const response = await fetchStaffPatientTrends(patientId, clinicId, getToken, {
          from: formatTrendRangeFrom(rangeDays),
        });

        if (!cancelled) {
          setTrends(response);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [clinicId, getToken, patientId, rangeDays, reloadNonce]);

  const bpTrend = buildBloodPressureTrendData(trends?.bp ?? []);
  const glucoseTrend = buildGlucoseTrendData(trends?.glucose ?? [], units.glucoseUnit);
  const expandedMeasurements = trends?.measurements ?? [];
  const selectedConfig =
    EXPANDED_MEASUREMENTS.find((item) => item.key === selectedMeasurement) ??
    EXPANDED_MEASUREMENTS[0];
  const selectedTrend = buildExpandedVitalsTrendData(
    expandedMeasurements,
    selectedMeasurement,
    units,
  );
  const followUp = trends?.followUp ?? {
    requested: 0,
    confirmed: 0,
    completed: 0,
    noShow: 0,
    closed: 0,
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="rounded-full px-3 py-1">
              Trends
            </Badge>
            <Badge variant="outline" className="rounded-full bg-background/80 px-3 py-1">
              Patient + encounter readings
            </Badge>
          </div>
          <div className="space-y-2">
            <h2 className="type-section-title">Trend view for clinic and home readings</h2>
            <CardDescription className="max-w-3xl text-sm md:text-base">
              Blood pressure and glucose combine patient-entered logs with encounter data for this
              clinic. Staff views include in-progress encounter readings so the timeline stays
              useful during the visit.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {TREND_RANGE_OPTIONS.map((days) => (
              <Button
                key={days}
                type="button"
                variant={days === rangeDays ? 'default' : 'outline'}
                size="sm"
                className="min-h-11"
                aria-pressed={days === rangeDays}
                onClick={() => setRangeDays(days)}
              >
                {days} days
              </Button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {FOLLOW_UP_LABELS.map((item) => (
              <div key={item.key} className="border-b border-rule py-3">
                <p className="type-metric">{followUp[item.key]}</p>
                <p className="mt-1 type-label font-normal text-muted-foreground">{item.label}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {loading && <ChartSectionLoading label="patient trends" lines={6} />}

      {error && (
        <ChartSectionError
          title="Unable to load trends"
          description={error}
          onRetry={() => setReloadNonce((nonce) => nonce + 1)}
        />
      )}

      {!loading && !error && (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader className="space-y-3">
                <div className="flex items-center justify-between">
                  <HeartPulse className="h-5 w-5 text-muted-foreground" />
                  <Badge variant="outline" className="rounded-full">
                    Blood pressure
                  </Badge>
                </div>
                <div>
                  <p className="type-metric">{trends?.bp.length ?? 0}</p>
                  <CardDescription>
                    Blood pressure readings in the selected timeframe.
                  </CardDescription>
                </div>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="space-y-3">
                <div className="flex items-center justify-between">
                  <Syringe className="h-5 w-5 text-muted-foreground" />
                  <Badge variant="outline" className="rounded-full">
                    Glucose
                  </Badge>
                </div>
                <div>
                  <p className="type-metric">{trends?.glucose.length ?? 0}</p>
                  <CardDescription>Glucose readings in the selected timeframe.</CardDescription>
                </div>
              </CardHeader>
            </Card>
          </div>

          <section className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {EXPANDED_MEASUREMENTS.map(({ key, label, suffix, icon: Icon }) => {
                const latest = expandedVitalInUnits(
                  key,
                  getLatestExpandedVital(expandedMeasurements, key) as number | null,
                  units,
                );
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelectedMeasurement(key)}
                    className={`min-h-24 cursor-pointer border-b-2 p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      selectedMeasurement === key
                        ? 'border-primary bg-primary/10'
                        : 'border-input hover:bg-muted/40'
                    }`}
                    aria-pressed={selectedMeasurement === key}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="type-label font-normal text-muted-foreground">{label}</span>
                      <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    </div>
                    <p className="mt-3 type-metric">
                      {latest == null ? 'No data' : `${latest}${suffixFor(key, suffix)}`}
                    </p>
                  </button>
                );
              })}
            </div>
            <MeasurementTrendChart
              staffRecord
              title={`${selectedConfig.label} trend`}
              description="Encounter measurements recorded by clinic staff across the selected range."
              emptyMessage={`No ${selectedConfig.label.toLowerCase()} readings were recorded in this timeframe.`}
              valueSuffix={suffixFor(selectedConfig.key, selectedConfig.suffix)}
              lines={[{ key: 'value', label: selectedConfig.label, color: 'hsl(var(--chart-3))' }]}
              data={selectedTrend}
            />
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <div className="lg:col-span-2">
              <MeasurementTrendChart
                staffRecord
                title="Blood pressure trend"
                description="Encounter and patient-entered systolic/diastolic values across the selected range."
                emptyMessage="No blood pressure readings were recorded in this timeframe."
                valueSuffix=" mmHg"
                lines={[
                  { key: 'systolic', label: 'Systolic', color: 'hsl(var(--chart-1))' },
                  { key: 'diastolic', label: 'Diastolic', color: 'hsl(var(--chart-2))' },
                ]}
                data={bpTrend}
              />
            </div>
            <MeasurementTrendChart
              staffRecord
              title="Glucose trend"
              description="Encounter and patient-entered glucose values across the selected range."
              emptyMessage="No glucose readings were recorded in this timeframe."
              valueSuffix={` ${glucoseUnitLabel(units.glucoseUnit)}`}
              lines={[{ key: 'glucose', label: 'Glucose', color: 'hsl(var(--chart-2))' }]}
              data={glucoseTrend}
            />
            <Card>
              <CardHeader>
                <h3 className="font-body text-base font-semibold">How to read this panel</h3>
                <CardDescription>
                  Use this trend view to compare clinic intake readings with patient logs before or
                  after the visit.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <div className="flex items-start gap-3 border-b border-rule py-3">
                  <Activity className="mt-0.5 h-4 w-4 text-muted-foreground" />
                  <p>
                    Encounter readings appear as soon as the visit data exists in this clinic,
                    including draft and review-stage encounters.
                  </p>
                </div>
                <div className="flex items-start gap-3 border-b border-rule py-3">
                  <CalendarClock className="mt-0.5 h-4 w-4 text-muted-foreground" />
                  <p>
                    Follow-up counts summarize requests and appointment outcomes for the selected
                    date range.
                  </p>
                </div>
              </CardContent>
            </Card>
          </section>
        </>
      )}
    </div>
  );
}
