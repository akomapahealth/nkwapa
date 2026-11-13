'use client';

import { useEffect, useState } from 'react';
import styles from '@/components/vitals-workspace.module.css';
import { cn } from '@/lib/utils';
import { Activity, HeartPulse, Scale, Thermometer, Wind } from 'lucide-react';
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
import { SegmentedControl } from '@/components/app-shell/SegmentedControl';
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
  // Only measurements with a reading in the window get a tile; a row of "No data" said nothing.
  const measured = EXPANDED_MEASUREMENTS.flatMap((item) => {
    const latest = expandedVitalInUnits(
      item.key,
      getLatestExpandedVital(expandedMeasurements, item.key) as number | null,
      units,
    );
    return latest == null ? [] : [{ ...item, latest }];
  });
  const selectedConfig =
    measured.find((item) => item.key === selectedMeasurement) ??
    measured[0] ??
    EXPANDED_MEASUREMENTS[0];
  const selectedTrend = buildExpandedVitalsTrendData(
    expandedMeasurements,
    selectedConfig.key,
    units,
  );

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Card className={styles.workspace}>
        <CardHeader className="space-y-4">
          <div className="space-y-2">
            <h2 className="type-section-title">Trends</h2>
            <CardDescription className="max-w-3xl text-sm">
              Clinic readings and the patient&apos;s home readings on one timeline. A visit&apos;s
              readings appear as soon as they are saved, before the visit is finalized.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <SegmentedControl
            label="Time window"
            value={String(rangeDays)}
            onChange={(value) => setRangeDays(Number(value) as TrendRangeDays)}
            options={TREND_RANGE_OPTIONS.map((days) => ({
              value: String(days),
              label: `${days} days`,
            }))}
            className="w-full max-w-[24rem]"
          />
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
          {measured.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No temperature, breathing, SpO₂, weight or BMI readings in this timeframe.
            </p>
          ) : (
            <section className={cn(styles.workspace, 'flex flex-col gap-4')}>
              <div className={styles.fields}>
                {measured.map(({ key, label, suffix, icon: Icon, latest }) => {
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSelectedMeasurement(key)}
                      className={cn(
                        'min-h-24 cursor-pointer border-b-2 p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        selectedConfig.key === key
                          ? 'border-primary bg-selected'
                          : 'border-input [@media(hover:hover)]:hover:bg-muted',
                      )}
                      aria-pressed={selectedConfig.key === key}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="type-label font-normal text-muted-foreground">
                          {label}
                        </span>
                        <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                      </div>
                      <p className="mt-3 type-section-title tabular-nums">
                        {`${latest}${suffixFor(key, suffix)}`}
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
                lines={[
                  { key: 'value', label: selectedConfig.label, color: 'hsl(var(--chart-3))' },
                ]}
                data={selectedTrend}
              />
            </section>
          )}

          <section className="grid min-w-0 grid-cols-1 gap-4">
            <div className="min-w-0">
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
          </section>
        </>
      )}
    </div>
  );
}
