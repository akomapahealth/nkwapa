'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, Cigarette, HeartPulse, Ruler, Thermometer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { TobaccoScreeningRecord, VitalsRecord } from '@/lib/db';
import {
  BP_SITES,
  CUFF_SIZES,
  derivedBmi,
  generateClinicalId,
  PATIENT_POSITIONS,
  READINESS_OPTIONS,
  saveClinicalMeasurementsOffline,
  SCREENING_ANSWERS,
  TEMPERATURE_SOURCES,
  TOBACCO_USE_STATUSES,
  type ClinicalFieldErrors,
  type TobaccoFormValues,
  type VitalsFormValues,
} from '@/lib/clinical-measurements';
import { cn } from '@/lib/utils';
import { useSync } from '@/app/ServiceWorkerAndSyncProvider';

const NONE_VALUE = '__NONE__';

const LABELS: Record<string, string> = {
  LEFT_ARM: 'Left arm',
  RIGHT_ARM: 'Right arm',
  LEFT_LEG: 'Left leg',
  RIGHT_LEG: 'Right leg',
  OTHER: 'Other',
  SITTING: 'Sitting',
  STANDING: 'Standing',
  SUPINE: 'Supine',
  INFANT: 'Infant',
  CHILD: 'Child',
  SMALL_ADULT: 'Small adult',
  ADULT: 'Adult',
  LARGE_ADULT: 'Large adult',
  THIGH: 'Thigh',
  ORAL: 'Oral',
  AXILLARY: 'Axillary',
  TYMPANIC: 'Tympanic',
  TEMPORAL: 'Temporal',
  RECTAL: 'Rectal',
  NOT_ASSESSED: 'Not assessed',
  NEVER: 'Never',
  FORMER: 'Former',
  CURRENT: 'Current',
  NO: 'No',
  YES: 'Yes',
  NOT_READY: 'Not ready',
  CONSIDERING: 'Considering quitting',
  READY: 'Ready to quit',
  NOT_APPLICABLE: 'Not applicable',
};

function displayValue(value?: string | number | null, suffix = '') {
  return value == null || value === ''
    ? 'Not recorded'
    : `${LABELS[String(value)] ?? value}${suffix}`;
}

function initialVitals(data?: VitalsRecord | null): VitalsFormValues {
  return {
    systolicBp: String(data?.systolicBp ?? ''),
    diastolicBp: String(data?.diastolicBp ?? ''),
    bpSite: data?.bpSite ?? '',
    bpSiteOther: data?.bpSiteOther ?? '',
    patientPosition: data?.patientPosition ?? '',
    patientPositionOther: data?.patientPositionOther ?? '',
    cuffSize: data?.cuffSize ?? '',
    cuffSizeOther: data?.cuffSizeOther ?? '',
    pulseBpm: String(data?.pulseBpm ?? data?.heartRate ?? ''),
    temperatureValue: String(data?.temperatureCelsius ?? ''),
    temperatureUnit: 'CELSIUS',
    temperatureSource: data?.temperatureSource ?? '',
    temperatureSourceOther: data?.temperatureSourceOther ?? '',
    respiratoryRate: String(data?.respiratoryRate ?? ''),
    spo2Percent: String(data?.spo2Percent ?? ''),
    weightKg: String(data?.weightKg ?? ''),
    heightCm: String(data?.heightCm ?? ''),
    notes: data?.notes ?? '',
  };
}

function initialTobacco(data?: TobaccoScreeningRecord | null): TobaccoFormValues {
  return {
    smokingStatus: data?.smokingStatus ?? 'NOT_ASSESSED',
    smokelessTobaccoStatus: data?.smokelessTobaccoStatus ?? 'NOT_ASSESSED',
    passiveExposure: data?.passiveExposure ?? 'NOT_ASSESSED',
    readinessToQuit: data?.readinessToQuit ?? 'NOT_ASSESSED',
    counselingGiven: data?.counselingGiven ?? 'NOT_ASSESSED',
  };
}

interface VitalsFormProps {
  clinicId: string;
  encounterId: string;
  recordedByUserId: string;
  initialData?: VitalsRecord | null;
  initialTobaccoData?: TobaccoScreeningRecord | null;
  canEdit?: boolean;
  onSaved?: () => void;
  saveRef?: React.MutableRefObject<(() => Promise<void>) | null>;
}

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p id={id} role="alert" className="text-sm text-destructive">
      {message}
    </p>
  ) : null;
}

function SectionHeading({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof HeartPulse;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="rounded-2xl bg-primary/10 p-2.5 text-primary">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
      <div>
        <h3 className="font-heading text-base font-semibold">{title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function SelectField({
  id,
  label,
  value,
  options,
  onChange,
  error,
  optional = false,
  disabled = false,
}: {
  id: string;
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
  error?: string;
  optional?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Select
        value={value || NONE_VALUE}
        onValueChange={(next) => onChange(next === NONE_VALUE ? '' : next)}
        disabled={disabled}
      >
        <SelectTrigger
          id={id}
          className="h-11"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {optional ? <SelectItem value={NONE_VALUE}>Not recorded</SelectItem> : null}
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {LABELS[option] ?? option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}

function ReadOnlyMeasurements({
  vitals,
  tobacco,
}: {
  vitals?: VitalsRecord | null;
  tobacco?: TobaccoScreeningRecord | null;
}) {
  const groups = [
    {
      title: 'Blood Pressure',
      icon: HeartPulse,
      rows: [
        [
          'Reading',
          vitals?.systolicBp != null && vitals.diastolicBp != null
            ? `${vitals.systolicBp}/${vitals.diastolicBp} mmHg`
            : 'Not recorded',
        ],
        ['Site', displayValue(vitals?.bpSiteOther || vitals?.bpSite)],
        ['Position', displayValue(vitals?.patientPositionOther || vitals?.patientPosition)],
        ['Cuff size', displayValue(vitals?.cuffSizeOther || vitals?.cuffSize)],
      ],
    },
    {
      title: 'Other Measurements',
      icon: Thermometer,
      rows: [
        ['Pulse', displayValue(vitals?.pulseBpm ?? vitals?.heartRate, ' bpm')],
        ['Temperature', displayValue(vitals?.temperatureCelsius, ' °C')],
        [
          'Temperature source',
          displayValue(vitals?.temperatureSourceOther || vitals?.temperatureSource),
        ],
        ['Respiratory rate', displayValue(vitals?.respiratoryRate, '/min')],
        ['SpO₂', displayValue(vitals?.spo2Percent, '%')],
      ],
    },
    {
      title: 'Anthropometrics',
      icon: Ruler,
      rows: [
        ['Weight', displayValue(vitals?.weightKg, ' kg')],
        ['Height', displayValue(vitals?.heightCm, ' cm')],
        ['BMI', displayValue(vitals?.bmi)],
      ],
    },
    {
      title: 'Tobacco Use',
      icon: Cigarette,
      rows: [
        ['Smoking', displayValue(tobacco?.smokingStatus)],
        ['Smokeless tobacco', displayValue(tobacco?.smokelessTobaccoStatus)],
        ['Passive exposure', displayValue(tobacco?.passiveExposure)],
        ['Readiness to quit', displayValue(tobacco?.readinessToQuit)],
        ['Counseling given', displayValue(tobacco?.counselingGiven)],
        [
          'Reviewed',
          tobacco?.reviewedAt
            ? `${new Date(tobacco.reviewedAt).toLocaleString()}`
            : tobacco?.reviewPending
              ? 'Pending sync'
              : 'Not reviewed',
        ],
      ],
    },
  ];

  return (
    <Card className="rounded-[28px] border-border/80 bg-card/90 shadow-lg shadow-black/5">
      <CardHeader>
        <h2 className="font-heading text-xl font-semibold">Clinical measurements</h2>
        <p className="text-sm text-muted-foreground">Recorded values are preserved as read-only.</p>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-2">
        {groups.map(({ title, icon: Icon, rows }) => (
          <section
            key={title}
            className="rounded-3xl border border-border/70 bg-background/60 p-4 sm:p-5"
          >
            <div className="mb-4 flex items-center gap-2">
              <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
              <h3 className="font-semibold">{title}</h3>
            </div>
            <dl className="space-y-3">
              {rows.map(([label, value]) => (
                <div
                  key={label}
                  className="flex flex-wrap justify-between gap-2 border-b border-border/50 pb-2 last:border-0"
                >
                  <dt className="text-sm text-muted-foreground">{label}</dt>
                  <dd className="text-right text-sm font-medium">{value}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
        {vitals?.notes ? (
          <section className="rounded-3xl border border-border/70 bg-background/60 p-4 sm:p-5 lg:col-span-2">
            <h3 className="font-semibold">Notes</h3>
            <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{vitals.notes}</p>
          </section>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function VitalsForm({
  clinicId,
  encounterId,
  recordedByUserId: _recordedByUserId,
  initialData,
  initialTobaccoData,
  canEdit = true,
  onSaved,
  saveRef,
}: VitalsFormProps) {
  const vitalsId = useRef(initialData?.id ?? generateClinicalId());
  const tobaccoScreeningId = useRef(initialTobaccoData?.id ?? generateClinicalId());
  const [vitals, setVitals] = useState(() => initialVitals(initialData));
  const [tobacco, setTobacco] = useState(() => initialTobacco(initialTobaccoData));
  const [localVitals, setLocalVitals] = useState<VitalsRecord | null>(initialData ?? null);
  const [localTobacco, setLocalTobacco] = useState<TobaccoScreeningRecord | null>(
    initialTobaccoData ?? null,
  );
  const [errors, setErrors] = useState<ClinicalFieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [statusIsError, setStatusIsError] = useState(false);
  const { isOnline, syncNow } = useSync();
  const bmi = useMemo(() => derivedBmi(vitals), [vitals]);

  useEffect(() => {
    if (!initialData || initialData.updatedAt === localVitals?.updatedAt) return;
    setLocalVitals(initialData);
    setVitals(initialVitals(initialData));
  }, [initialData, localVitals?.updatedAt]);

  useEffect(() => {
    if (!initialTobaccoData || initialTobaccoData.updatedAt === localTobacco?.updatedAt) return;
    setLocalTobacco(initialTobaccoData);
    setTobacco(initialTobacco(initialTobaccoData));
  }, [initialTobaccoData, localTobacco?.updatedAt]);

  const updateVital = (field: keyof VitalsFormValues, value: string) => {
    setVitals((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      const next = { ...current };
      delete next[field];
      return next;
    });
    setStatus(null);
    setStatusIsError(false);
  };
  const updateTobacco = (field: keyof TobaccoFormValues, value: string) => {
    setTobacco((current) => ({ ...current, [field]: value }));
    setStatus(null);
    setStatusIsError(false);
  };

  const handleSave = useCallback(
    async (markTobaccoReviewed = false) => {
      if (!canEdit) return;
      setSaving(true);
      setStatus(null);
      setStatusIsError(false);
      try {
        const result = await saveClinicalMeasurementsOffline({
          clinicId,
          encounterId,
          vitalsId: vitalsId.current,
          tobaccoScreeningId: tobaccoScreeningId.current,
          vitals,
          tobacco,
          markTobaccoReviewed,
          existingVitals: localVitals,
          existingTobacco: localTobacco,
        });
        if (Object.keys(result.errors).length) {
          setErrors(result.errors);
          throw new Error('Review the highlighted clinical measurement fields.');
        }
        setErrors({});
        setLocalVitals(result.vitalsRecord ?? null);
        setLocalTobacco(result.tobaccoRecord ?? null);
        if (isOnline) {
          const syncResult = await syncNow(clinicId);
          setStatus(
            syncResult.success
              ? markTobaccoReviewed
                ? 'Tobacco screening reviewed and synced.'
                : 'Measurements saved and synced.'
              : markTobaccoReviewed
                ? 'Review saved on this device and pending sync.'
                : 'Measurements saved on this device and pending sync.',
          );
        } else {
          setStatus(
            markTobaccoReviewed
              ? 'Review saved on this device and pending sync.'
              : 'Measurements saved on this device and pending sync.',
          );
        }
        onSaved?.();
      } finally {
        setSaving(false);
      }
    },
    [
      canEdit,
      clinicId,
      encounterId,
      isOnline,
      localTobacco,
      localVitals,
      onSaved,
      syncNow,
      tobacco,
      vitals,
    ],
  );

  const handleButtonSave = async (markTobaccoReviewed: boolean) => {
    try {
      await handleSave(markTobaccoReviewed);
    } catch (error) {
      setStatusIsError(true);
      setStatus(error instanceof Error ? error.message : 'Unable to save measurements.');
    }
  };

  useEffect(() => {
    if (!saveRef) return;
    saveRef.current = canEdit ? () => handleSave(false) : null;
    return () => {
      saveRef.current = null;
    };
  }, [canEdit, handleSave, saveRef]);

  if (!canEdit) return <ReadOnlyMeasurements vitals={initialData} tobacco={initialTobaccoData} />;

  const numberField = (
    id: keyof VitalsFormValues,
    label: string,
    options?: { step?: string; placeholder?: string },
  ) => (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        step={options?.step}
        placeholder={options?.placeholder}
        value={vitals[id]}
        onChange={(event) => updateVital(id, event.target.value)}
        className="h-11"
        aria-invalid={Boolean(errors[id])}
        aria-describedby={errors[id] ? `${id}-error` : undefined}
      />
      <FieldError id={`${id}-error`} message={errors[id]} />
    </div>
  );

  return (
    <Card className="rounded-[28px] border-border/80 bg-card/90 shadow-lg shadow-black/5">
      <CardHeader className="space-y-2">
        <h2 className="font-heading text-xl font-semibold">Vitals and tobacco screening</h2>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Units are explicit, BMI is calculated from kilograms and centimeters, and every save is
          available offline.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <section className="space-y-5 rounded-3xl border border-border/70 bg-background/60 p-4 sm:p-6">
          <SectionHeading
            icon={HeartPulse}
            title="Blood Pressure"
            description="Record the reading and measurement context together."
          />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {numberField('systolicBp', 'Systolic BP (mmHg)', { placeholder: '120' })}
            {numberField('diastolicBp', 'Diastolic BP (mmHg)', { placeholder: '80' })}
            <SelectField
              id="bpSite"
              label="Measurement site"
              value={vitals.bpSite}
              options={BP_SITES}
              onChange={(value) => updateVital('bpSite', value)}
              error={errors.bpSite}
              optional
            />
            {vitals.bpSite === 'OTHER' ? (
              <div className="space-y-2">
                <Label htmlFor="bpSiteOther">Other site</Label>
                <Input
                  id="bpSiteOther"
                  value={vitals.bpSiteOther}
                  onChange={(event) => updateVital('bpSiteOther', event.target.value)}
                  className="h-11"
                  aria-invalid={Boolean(errors.bpSiteOther)}
                />
                <FieldError id="bpSiteOther-error" message={errors.bpSiteOther} />
              </div>
            ) : null}
            <SelectField
              id="patientPosition"
              label="Patient position"
              value={vitals.patientPosition}
              options={PATIENT_POSITIONS}
              onChange={(value) => updateVital('patientPosition', value)}
              error={errors.patientPosition}
              optional
            />
            {vitals.patientPosition === 'OTHER' ? (
              <div className="space-y-2">
                <Label htmlFor="patientPositionOther">Other position</Label>
                <Input
                  id="patientPositionOther"
                  value={vitals.patientPositionOther}
                  onChange={(event) => updateVital('patientPositionOther', event.target.value)}
                  className="h-11"
                  aria-invalid={Boolean(errors.patientPositionOther)}
                />
                <FieldError id="patientPositionOther-error" message={errors.patientPositionOther} />
              </div>
            ) : null}
            <SelectField
              id="cuffSize"
              label="Cuff size"
              value={vitals.cuffSize}
              options={CUFF_SIZES}
              onChange={(value) => updateVital('cuffSize', value)}
              error={errors.cuffSize}
              optional
            />
            {vitals.cuffSize === 'OTHER' ? (
              <div className="space-y-2">
                <Label htmlFor="cuffSizeOther">Other cuff size</Label>
                <Input
                  id="cuffSizeOther"
                  value={vitals.cuffSizeOther}
                  onChange={(event) => updateVital('cuffSizeOther', event.target.value)}
                  className="h-11"
                  aria-invalid={Boolean(errors.cuffSizeOther)}
                />
                <FieldError id="cuffSizeOther-error" message={errors.cuffSizeOther} />
              </div>
            ) : null}
          </div>
        </section>

        <section className="space-y-5 rounded-3xl border border-border/70 bg-background/60 p-4 sm:p-6">
          <SectionHeading
            icon={Thermometer}
            title="Other Measurements"
            description="Capture pulse, breathing, oxygen saturation, and temperature."
          />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {numberField('pulseBpm', 'Pulse (bpm)', { placeholder: '72' })}
            {numberField('respiratoryRate', 'Respiratory rate (/min)', { placeholder: '16' })}
            {numberField('spo2Percent', 'SpO₂ (%)', { placeholder: '98' })}
            <div className="space-y-2">
              <Label htmlFor="temperatureValue">
                Temperature ({vitals.temperatureUnit === 'CELSIUS' ? '°C' : '°F'})
              </Label>
              <div className="flex gap-2">
                <Input
                  id="temperatureValue"
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  value={vitals.temperatureValue}
                  onChange={(event) => updateVital('temperatureValue', event.target.value)}
                  className="h-11 min-w-0"
                  aria-invalid={Boolean(errors.temperatureValue)}
                  aria-describedby={errors.temperatureValue ? 'temperatureValue-error' : undefined}
                />
                <Select
                  value={vitals.temperatureUnit}
                  onValueChange={(value: 'CELSIUS' | 'FAHRENHEIT') =>
                    setVitals((current) => ({ ...current, temperatureUnit: value }))
                  }
                >
                  <SelectTrigger aria-label="Temperature unit" className="h-11 w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CELSIUS">°C</SelectItem>
                    <SelectItem value="FAHRENHEIT">°F</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <FieldError id="temperatureValue-error" message={errors.temperatureValue} />
            </div>
            <SelectField
              id="temperatureSource"
              label="Temperature source"
              value={vitals.temperatureSource}
              options={TEMPERATURE_SOURCES}
              onChange={(value) => updateVital('temperatureSource', value)}
              error={errors.temperatureSource}
              optional
            />
            {vitals.temperatureSource === 'OTHER' ? (
              <div className="space-y-2">
                <Label htmlFor="temperatureSourceOther">Other temperature source</Label>
                <Input
                  id="temperatureSourceOther"
                  value={vitals.temperatureSourceOther}
                  onChange={(event) => updateVital('temperatureSourceOther', event.target.value)}
                  className="h-11"
                  aria-invalid={Boolean(errors.temperatureSourceOther)}
                />
                <FieldError
                  id="temperatureSourceOther-error"
                  message={errors.temperatureSourceOther}
                />
              </div>
            ) : null}
          </div>
        </section>

        <section className="space-y-5 rounded-3xl border border-border/70 bg-background/60 p-4 sm:p-6">
          <SectionHeading
            icon={Ruler}
            title="Anthropometrics"
            description="BMI is derived from canonical weight and height."
          />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {numberField('weightKg', 'Weight (kg)', { step: '0.1', placeholder: '70' })}
            {numberField('heightCm', 'Height (cm)', { step: '0.1', placeholder: '170' })}
            <div className="space-y-2">
              <Label>BMI (kg/m²)</Label>
              <div
                className="flex h-11 items-center rounded-md border bg-muted/40 px-3 text-sm font-medium"
                aria-live="polite"
              >
                {bmi ?? 'Calculated after weight and height'}
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-5 rounded-3xl border border-border/70 bg-background/60 p-4 sm:p-6">
          <SectionHeading
            icon={Cigarette}
            title="Tobacco Use"
            description="Not assessed remains distinct from a negative response."
          />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <SelectField
              id="smokingStatus"
              label="Smoking status"
              value={tobacco.smokingStatus}
              options={TOBACCO_USE_STATUSES}
              onChange={(value) => updateTobacco('smokingStatus', value)}
            />
            <SelectField
              id="smokelessTobaccoStatus"
              label="Smokeless tobacco"
              value={tobacco.smokelessTobaccoStatus}
              options={TOBACCO_USE_STATUSES}
              onChange={(value) => updateTobacco('smokelessTobaccoStatus', value)}
            />
            <SelectField
              id="passiveExposure"
              label="Passive exposure"
              value={tobacco.passiveExposure}
              options={SCREENING_ANSWERS}
              onChange={(value) => updateTobacco('passiveExposure', value)}
            />
            <SelectField
              id="readinessToQuit"
              label="Readiness to quit"
              value={tobacco.readinessToQuit}
              options={READINESS_OPTIONS}
              onChange={(value) => updateTobacco('readinessToQuit', value)}
            />
            <SelectField
              id="counselingGiven"
              label="Counseling given"
              value={tobacco.counselingGiven}
              options={SCREENING_ANSWERS}
              onChange={(value) => updateTobacco('counselingGiven', value)}
            />
          </div>
          <div
            className={cn(
              'rounded-2xl border p-4 text-sm',
              localTobacco?.reviewedAt
                ? 'border-primary/30 bg-primary/5'
                : 'border-border/70 bg-muted/30',
            )}
          >
            {localTobacco?.reviewPending
              ? 'Tobacco review is pending sync.'
              : localTobacco?.reviewedAt
                ? `Reviewed ${new Date(localTobacco.reviewedAt).toLocaleString()}.`
                : 'This tobacco screening has not been explicitly reviewed.'}
          </div>
        </section>

        <section className="space-y-2 rounded-3xl border border-border/70 bg-background/60 p-4 sm:p-6">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" aria-hidden="true" />
            <Label htmlFor="notes" className="text-base font-semibold">
              Notes
            </Label>
          </div>
          <Textarea
            id="notes"
            value={vitals.notes}
            onChange={(event) => updateVital('notes', event.target.value)}
            maxLength={2000}
            rows={4}
            aria-invalid={Boolean(errors.notes)}
            aria-describedby={errors.notes ? 'notes-error' : 'notes-help'}
          />
          <div id="notes-help" className="flex justify-between text-xs text-muted-foreground">
            <span>Optional clinical context. No automated diagnosis is generated.</span>
            <span>{vitals.notes.length}/2000</span>
          </div>
          <FieldError id="notes-error" message={errors.notes} />
        </section>

        {status ? (
          <p
            role={statusIsError ? 'alert' : 'status'}
            className={cn(
              'rounded-2xl border p-3 text-sm',
              statusIsError
                ? 'border-destructive/30 bg-destructive/5 text-destructive'
                : 'border-primary/25 bg-primary/5 text-foreground',
            )}
          >
            {status}
          </p>
        ) : null}
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            className="h-11 rounded-2xl"
            onClick={() => void handleButtonSave(true)}
            disabled={saving}
          >
            Mark tobacco reviewed
          </Button>
          <Button
            type="button"
            className="h-11 rounded-2xl"
            onClick={() => void handleButtonSave(false)}
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Save measurements'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
