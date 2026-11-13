'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, Cigarette, HeartPulse, Ruler, Thermometer } from 'lucide-react';
import { classifyBloodPressure } from '@nkwapa/db/bp-classification';
import { Button } from '@/components/ui/button';
import { confirmAction } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  RecordSection as Card,
  RecordSectionContent as CardContent,
  RecordSectionHeader as CardHeader,
} from '@/components/patients/RecordSection';
import styles from './vitals-workspace.module.css';
import { BloodPressureSignal } from '@/components/patients/BloodPressureSignal';
import {
  Select,
  SelectContent,
  SelectGroup,
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
import type { VitalsSection } from '@nkwapa/db/clinical-measurements';
import { formatHeight, formatWeight, type BodyMeasureUnit } from '@nkwapa/db/measurement-units';
import { useClinicUnits } from '@/lib/bootstrap-context';
import { cmToHeightEntry, kgToWeightText, weightUnitLabel } from '@/lib/measurement-entry';
import { cn } from '@/lib/utils';
import { useSync } from '@/app/ServiceWorkerAndSyncProvider';
import { isFullySynced } from '@/lib/sync';
import { FieldError, fieldErrorProps, focusFirstInvalid } from '@/components/ui/field';
import { formatOpsDateTime } from '@/lib/ops';

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

function initialVitals(
  data: VitalsRecord | null | undefined,
  bodyUnit: BodyMeasureUnit,
): VitalsFormValues {
  const height = cmToHeightEntry(data?.heightCm);
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
    weight: kgToWeightText(data?.weightKg, bodyUnit),
    height: height.cm,
    heightFeet: height.feet,
    heightInches: height.inches,
    bodyUnit,
    stored: { weightKg: data?.weightKg ?? null, heightCm: data?.heightCm ?? null },
    notes: data?.notes ?? '',
  };
}

/** The form fields that hold typed text. */
type VitalsTextField = Exclude<keyof VitalsFormValues, 'temperatureUnit' | 'bodyUnit' | 'stored'>;

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
  /**
   * Show and save only these groups (#167). A station records its own measurements into the
   * encounter's shared Vitals row, so its save must not touch the other groups. Tobacco is a whole
   * -encounter screen and is left out in this mode.
   */
  sections?: VitalsSection[];
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
    <div className="flex min-w-0 items-start gap-3">
      <Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div>
        <h3 className="type-section-title">{title}</h3>
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
    <div className="flex min-w-0 flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Select
        value={value || NONE_VALUE}
        onValueChange={(next) => onChange(next === NONE_VALUE ? '' : next)}
        disabled={disabled}
      >
        <SelectTrigger
          id={id}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {optional ? <SelectItem value={NONE_VALUE}>Not recorded</SelectItem> : null}
            {options.map((option) => (
              <SelectItem key={option} value={option}>
                {LABELS[option] ?? option}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <FieldError id={id} message={error} />
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
  const { bodyUnit } = useClinicUnits();
  const groups = [
    {
      title: 'Blood pressure',
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
      title: 'Other measurements',
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
        ['Weight', formatWeight(vitals?.weightKg, bodyUnit) ?? 'Not recorded'],
        ['Height', formatHeight(vitals?.heightCm, bodyUnit) ?? 'Not recorded'],
        ['BMI', displayValue(vitals?.bmi)],
      ],
    },
    {
      title: 'Tobacco use',
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
            ? `${formatOpsDateTime(tobacco.reviewedAt)}`
            : tobacco?.reviewPending
              ? 'Pending sync'
              : 'Not reviewed',
        ],
      ],
    },
  ];

  return (
    <Card className={styles.workspace}>
      <CardHeader>
        <h2 className="type-section-title">Clinical measurements</h2>
        <p className="text-sm text-muted-foreground">Recorded values are preserved as read-only.</p>
      </CardHeader>
      <CardContent className={styles.summary}>
        {groups.map(({ title, icon: Icon, rows }) => (
          <section key={title} className={styles.section}>
            <div className="mb-4 flex items-center gap-2">
              <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
              <h3 className="font-semibold">{title}</h3>
            </div>
            {title === 'Blood pressure' ? (
              <BloodPressureSignal
                systolic={vitals?.systolicBp}
                diastolic={vitals?.diastolicBp}
                compact
              />
            ) : null}
            <dl className="space-y-3">
              {rows.map(([label, value]) => (
                <div
                  key={label}
                  className="flex flex-wrap justify-between gap-2 border-b border-border/50 pb-2 last:border-0"
                >
                  <dt className="text-sm text-muted-foreground">{label}</dt>
                  <dd className="text-right text-sm font-medium tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
        {vitals?.notes ? (
          <section className="col-span-full min-w-0 border-t border-rule py-5">
            <h3 className="font-semibold">Notes</h3>
            <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{vitals.notes}</p>
          </section>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** The order these appear on screen, which is not the order the validator records them in. */
const MEASUREMENT_FIELD_ORDER = [
  'systolicBp',
  'diastolicBp',
  'bloodPressureContext',
  'pulseBpm',
  'respiratoryRate',
  'spo2',
  'temperature',
  'weight',
  'height',
  'notes',
];

/** "182/96" when a saved reading classifies as crisis, otherwise null. */
function crisisKey(record: VitalsRecord | null | undefined): string | null {
  if (!record || classifyBloodPressure(record.systolicBp, record.diastolicBp) !== 'CRISIS') {
    return null;
  }
  return `${record.systolicBp ?? '–'}/${record.diastolicBp ?? '–'}`;
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
  sections,
}: VitalsFormProps) {
  const workspace = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = workspace.current;
    if (!root) return;
    const navigation = document.querySelector<HTMLElement>('nav[aria-label="Primary"]');
    const chat = document.querySelector<HTMLElement>('[data-testid="chat-toggle"]');
    const actions = root.querySelector<HTMLElement>('[data-vitals-actions]');
    const measure = () => {
      root.style.setProperty(
        '--vitals-nav-clearance',
        `${navigation?.getBoundingClientRect().height ?? 0}px`,
      );
      root.style.setProperty(
        '--vitals-chat-clearance',
        `${chat ? Math.max(0, root.getBoundingClientRect().right - chat.getBoundingClientRect().left + 12) : 0}px`,
      );
      root.style.setProperty(
        '--vitals-actions-height',
        `${actions?.getBoundingClientRect().height ?? 0}px`,
      );
      root.style.setProperty(
        '--vitals-chat-height',
        `${chat?.getBoundingClientRect().height ?? 0}px`,
      );
    };
    const observer = new ResizeObserver(measure);
    for (const element of [root, navigation, chat, actions]) if (element) observer.observe(element);
    window.addEventListener('resize', measure);
    measure();
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [canEdit]);
  const shows = (section: VitalsSection) => !sections || sections.includes(section);
  const vitalsId = useRef(initialData?.id ?? generateClinicalId());
  // The crisis reading last alerted on, so editing another field and saving again does not alert
  // a second time, and reopening a visit whose crisis reading was already saved does not either.
  const crisisAlerted = useRef(crisisKey(initialData));
  const tobaccoScreeningId = useRef(initialTobaccoData?.id ?? generateClinicalId());
  const { bodyUnit } = useClinicUnits(clinicId);
  const [vitals, setVitals] = useState(() => initialVitals(initialData, bodyUnit));
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
    setVitals(initialVitals(initialData, bodyUnit));
  }, [initialData, localVitals?.updatedAt, bodyUnit]);

  useEffect(() => {
    if (!initialTobaccoData || initialTobaccoData.updatedAt === localTobacco?.updatedAt) return;
    setLocalTobacco(initialTobaccoData);
    setTobacco(initialTobacco(initialTobaccoData));
  }, [initialTobaccoData, localTobacco?.updatedAt]);

  const updateVital = (field: VitalsTextField, value: string) => {
    setVitals((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      const next = { ...current };
      delete next[field];
      // Feet and inches share one error, keyed by what they make up.
      if (field === 'heightFeet' || field === 'heightInches') delete next.height;
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
          sections,
        });
        if (Object.keys(result.errors).length) {
          setErrors(result.errors);
          /*
            Eleven fields across four sections. Failing without moving focus left a keyboard or
            screen-reader user at the Save button, with the reason somewhere above them and
            nothing saying where.
          */
          focusFirstInvalid(result.errors, MEASUREMENT_FIELD_ORDER);
          throw new Error('Review the highlighted clinical measurement fields.');
        }
        setErrors({});
        setLocalVitals(result.vitalsRecord ?? null);
        if (!sections) setLocalTobacco(result.tobaccoRecord ?? null);
        if (isOnline) {
          const syncResult = await syncNow(clinicId);
          setStatus(
            isFullySynced(syncResult)
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
        // The reading is saved before this, so the alert never holds data back. Awaiting it holds
        // back whatever the page does next (another tab, the next station) until it is answered.
        const key = crisisKey(result.vitalsRecord);
        if (key && key !== crisisAlerted.current) {
          crisisAlerted.current = key;
          await confirmAction({
            acknowledgeOnly: true,
            title: 'This visit needs a clinician now',
            description: `${key} mmHg is in the hypertensive crisis range (180/120 or higher). The reading is saved. Tell a clinician before the patient moves on.`,
            confirmLabel: "I've told a clinician",
          });
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
      sections,
      syncNow,
      tobacco,
      vitals,
    ],
  );

  const handleButtonSave = async (markTobaccoReviewed: boolean) => {
    // An empty first save still writes a record, and the next step then looks done. Ask first.
    const nothingEntered =
      !markTobaccoReviewed &&
      !localVitals &&
      Object.entries(vitals).every(
        ([field, value]) =>
          typeof value !== 'string' ||
          field === 'temperatureUnit' ||
          field === 'bodyUnit' ||
          !value.trim(),
      ) &&
      (sections !== undefined || Object.values(tobacco).every((v) => v === 'NOT_ASSESSED'));
    if (
      nothingEntered &&
      !(await confirmAction({
        title: 'No measurements entered',
        description:
          'Nothing has been entered for this visit yet. Saving now records the measurements as not taken.',
        confirmLabel: 'Save without measurements',
        cancelLabel: 'Enter measurements',
        destructive: false,
      }))
    )
      return;
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

  const numberField = (id: VitalsTextField, label: string, options?: { step?: string }) => (
    <div className="flex min-w-0 flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        step={options?.step}
        value={vitals[id]}
        onChange={(event) => updateVital(id, event.target.value)}
        className="h-11"
        {...fieldErrorProps(id, errors[id])}
      />
      <FieldError id={id} message={errors[id]} />
    </div>
  );

  return (
    <div ref={workspace} className={styles.workspace}>
      <Card>
        <CardHeader>
          <h2 className="type-section-title">
            {sections ? 'Measurements' : 'Vitals and tobacco screening'}
          </h2>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Units are explicit, BMI is calculated from kilograms and centimeters, and every save is
            available offline.
          </p>
        </CardHeader>
        <CardContent>
          {sections && Object.keys(errors).length ? (
            <section
              role="alert"
              aria-label="Check measurements"
              className="border-y border-destructive py-3 text-sm"
            >
              <h3 className="font-semibold">Check before saving</h3>
              <ul>
                {Object.entries(errors).map(([id, message]) => (
                  <li key={id}>
                    <a
                      className="inline-flex min-h-[var(--button-height)] items-center text-primary underline underline-offset-4"
                      href={`#${id}`}
                      onClick={(event) => {
                        event.preventDefault();
                        document.getElementById(id)?.focus();
                      }}
                    >
                      {message}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {shows('bloodPressure') ? (
            <section className={styles.section}>
              <SectionHeading
                icon={HeartPulse}
                title="Blood pressure"
                description="Record the reading and measurement context together."
              />
              <div className={styles.pressure}>
                {numberField('systolicBp', 'Systolic BP (mmHg)')}
                {numberField('diastolicBp', 'Diastolic BP (mmHg)')}
              </div>
              <BloodPressureSignal
                systolic={vitals.systolicBp}
                diastolic={vitals.diastolicBp}
                draft={
                  !(
                    localVitals &&
                    Number(vitals.systolicBp) === localVitals.systolicBp &&
                    Number(vitals.diastolicBp) === localVitals.diastolicBp
                  )
                }
              />
              <div className={styles.fields}>
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
                  <div className="flex min-w-0 flex-col gap-2">
                    <Label htmlFor="bpSiteOther">Other site</Label>
                    <Input
                      id="bpSiteOther"
                      value={vitals.bpSiteOther}
                      onChange={(event) => updateVital('bpSiteOther', event.target.value)}
                      className="h-11"
                      {...fieldErrorProps('bpSiteOther', errors.bpSiteOther)}
                    />
                    <FieldError id="bpSiteOther" message={errors.bpSiteOther} />
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
                  <div className="flex min-w-0 flex-col gap-2">
                    <Label htmlFor="patientPositionOther">Other position</Label>
                    <Input
                      id="patientPositionOther"
                      value={vitals.patientPositionOther}
                      onChange={(event) => updateVital('patientPositionOther', event.target.value)}
                      className="h-11"
                      {...fieldErrorProps('patientPositionOther', errors.patientPositionOther)}
                    />
                    <FieldError id="patientPositionOther" message={errors.patientPositionOther} />
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
                  <div className="flex min-w-0 flex-col gap-2">
                    <Label htmlFor="cuffSizeOther">Other cuff size</Label>
                    <Input
                      id="cuffSizeOther"
                      value={vitals.cuffSizeOther}
                      onChange={(event) => updateVital('cuffSizeOther', event.target.value)}
                      className="h-11"
                      {...fieldErrorProps('cuffSizeOther', errors.cuffSizeOther)}
                    />
                    <FieldError id="cuffSizeOther" message={errors.cuffSizeOther} />
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}

          {shows('otherVitals') ? (
            <section className={styles.section}>
              <SectionHeading
                icon={Thermometer}
                title="Other measurements"
                description="Capture pulse, breathing, oxygen saturation, and temperature."
              />
              <div className={styles.fields}>
                {numberField('pulseBpm', 'Pulse (bpm)')}
                {numberField('respiratoryRate', 'Respiratory rate (/min)')}
                {numberField('spo2Percent', 'SpO₂ (%)')}
                <div className="flex min-w-0 flex-col gap-2">
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
                      aria-describedby={
                        errors.temperatureValue ? 'temperatureValue-error' : undefined
                      }
                    />
                    <Select
                      value={vitals.temperatureUnit}
                      onValueChange={(value: 'CELSIUS' | 'FAHRENHEIT') =>
                        setVitals((current) => ({ ...current, temperatureUnit: value }))
                      }
                    >
                      <SelectTrigger aria-label="Temperature unit" className="w-24 shrink-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="CELSIUS">°C</SelectItem>
                          <SelectItem value="FAHRENHEIT">°F</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                  <FieldError id="temperatureValue" message={errors.temperatureValue} />
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
                  <div className="flex min-w-0 flex-col gap-2">
                    <Label htmlFor="temperatureSourceOther">Other temperature source</Label>
                    <Input
                      id="temperatureSourceOther"
                      value={vitals.temperatureSourceOther}
                      onChange={(event) =>
                        updateVital('temperatureSourceOther', event.target.value)
                      }
                      className="h-11"
                      {...fieldErrorProps('temperatureSourceOther', errors.temperatureSourceOther)}
                    />
                    <FieldError
                      id="temperatureSourceOther"
                      message={errors.temperatureSourceOther}
                    />
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}

          {shows('anthropometry') ? (
            <section className={styles.section}>
              <SectionHeading
                icon={Ruler}
                title="Anthropometrics"
                description="BMI is derived from canonical weight and height."
              />
              <div className={styles.fields}>
                {numberField('weight', `Weight (${weightUnitLabel(vitals.bodyUnit)})`, {
                  step: '0.1',
                })}
                {vitals.bodyUnit === 'US' ? (
                  <fieldset className="space-y-2">
                    <legend className="text-sm font-medium leading-none">Height (ft and in)</legend>
                    <div className="flex gap-2">
                      <Input
                        id="height"
                        aria-label="Height, feet"
                        type="number"
                        inputMode="numeric"
                        // Unit names, not example values: example numbers read as recorded data.
                        placeholder="ft"
                        value={vitals.heightFeet}
                        onChange={(event) => updateVital('heightFeet', event.target.value)}
                        className="h-11 min-w-0"
                        {...fieldErrorProps('height', errors.height)}
                      />
                      <Input
                        aria-label="Height, inches"
                        type="number"
                        inputMode="decimal"
                        step="0.1"
                        placeholder="in"
                        value={vitals.heightInches}
                        onChange={(event) => updateVital('heightInches', event.target.value)}
                        className="h-11 min-w-0"
                        aria-invalid={Boolean(errors.height)}
                      />
                    </div>
                    <FieldError id="height" message={errors.height} />
                  </fieldset>
                ) : (
                  numberField('height', 'Height (cm)', { step: '0.1' })
                )}
                <div className="flex min-w-0 flex-col gap-2">
                  <Label>BMI (kg/m²)</Label>
                  <div
                    className="flex min-h-11 items-center border-b border-rule py-2 text-sm font-medium tabular-nums"
                    aria-live="polite"
                  >
                    {bmi ?? 'Calculated after weight and height'}
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          {!sections ? (
            <section className={styles.section}>
              <SectionHeading
                icon={Cigarette}
                title="Tobacco use"
                description="Not assessed remains distinct from a negative response."
              />
              <div className={styles.fields}>
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
                  'rounded-lg border p-4 text-sm',
                  localTobacco?.reviewedAt
                    ? 'border-primary/30 bg-primary/5'
                    : 'border-border/70 bg-muted/30',
                )}
              >
                {localTobacco?.reviewPending
                  ? 'Tobacco review is pending sync.'
                  : localTobacco?.reviewedAt
                    ? `Reviewed ${formatOpsDateTime(localTobacco.reviewedAt)}.`
                    : 'This tobacco screening has not been explicitly reviewed.'}
              </div>
            </section>
          ) : null}

          {shows('notes') ? (
            <section className={styles.section}>
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
              <div
                id="notes-help"
                className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground"
              >
                <span>Optional clinical context. No automated diagnosis is generated.</span>
                <span className="tabular-nums">{vitals.notes.length}/2000</span>
              </div>
              <FieldError id="notes" message={errors.notes} />
            </section>
          ) : null}

          {status ? (
            <p
              role={statusIsError ? 'alert' : 'status'}
              className={cn(
                'rounded-lg border p-3 text-sm',
                statusIsError
                  ? 'border-destructive/30 bg-destructive/5 text-destructive-ink'
                  : 'border-primary/25 bg-primary/5 text-foreground',
              )}
            >
              {status}
            </p>
          ) : null}
          <div className={styles.actions} data-vitals-actions data-sticky-actions>
            {!sections ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleButtonSave(true)}
                disabled={saving}
              >
                Mark tobacco reviewed
              </Button>
            ) : null}
            <Button type="button" onClick={() => void handleButtonSave(false)} disabled={saving}>
              {saving ? 'Saving…' : 'Save measurements'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
