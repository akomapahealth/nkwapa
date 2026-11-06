'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Activity, ArrowLeft, HeartPulse, Scale, Syringe } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useBootstrap, useClinicUnits } from '@/lib/bootstrap-context';
import type { GlucoseUnit } from '@nkwapa/db/measurement-units';
import {
  convertGlucoseText,
  glucoseEntryError,
  glucoseTextToMgDl,
  glucoseUnitLabel,
  weightEntryError,
  weightTextToKg,
  weightUnitLabel,
} from '@/lib/measurement-entry';
import { GlucoseUnitSelect } from '@/components/GlucoseUnitSelect';
import {
  createMeasurement,
  fetchMeasurements,
  formatMeasurementValue,
  formatPortalDateTime,
  getPortalClinicId,
  getPortalClinicName,
  getPortalErrorMessage,
  measurementTypeFromPreset,
  type MeasurementRecord,
} from '@/lib/patient-portal';
import { cn } from '@/lib/utils';
import { EmptyState, InlineErrorState, SectionSkeleton } from '@/components/feedback/AppState';
import { ResourceState } from '@/components/feedback/ResourceState';
import { PortalFact, PortalHero, PortalPanel } from '@/components/portal/PortalPanels';
import { PortalWriteGateNotice, usePortalWriteGate } from '@/components/portal/PortalWriteGate';
import { usePortalResource } from '@/components/portal/use-portal-resource';
import { RouteGuard } from '@/components/RouteGuard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

const MEASUREMENT_OPTIONS = [
  {
    value: 'BP' as const,
    label: 'Blood pressure',
    description: 'Share the top and bottom numbers from your reading.',
    icon: HeartPulse,
  },
  {
    value: 'GLUCOSE' as const,
    label: 'Glucose',
    description: 'Share fasting or random blood sugar readings.',
    icon: Syringe,
  },
  {
    value: 'WEIGHT' as const,
    label: 'Weight',
    description: 'Capture weight trends between clinic visits.',
    icon: Scale,
  },
] as const;

function toLocalDateTimeValue(date: Date) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

function getTypeTips(type: MeasurementRecord['type']) {
  switch (type) {
    case 'BP':
      return 'Sit quietly for a few minutes first and enter both numbers from the same reading.';
    case 'GLUCOSE':
      return 'Choose whether the value was fasting or random so your clinic can interpret it correctly.';
    case 'WEIGHT':
      return 'Use the same scale when possible to keep your trend consistent over time.';
  }
}

export function MeasurementComposerScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const getToken = useAuth();
  const bootstrap = useBootstrap()?.bootstrap ?? null;
  const clinicId = getPortalClinicId(bootstrap);
  const clinicName = getPortalClinicName(bootstrap, clinicId);

  const [type, setType] = useState<MeasurementRecord['type']>('BP');
  const [recordedAt, setRecordedAt] = useState(() => toLocalDateTimeValue(new Date()));
  const [notes, setNotes] = useState('');
  const [systolic, setSystolic] = useState('');
  const [diastolic, setDiastolic] = useState('');
  const [pulse, setPulse] = useState('');
  const units = useClinicUnits(clinicId);
  const [glucoseUnit, setGlucoseUnit] = useState<GlucoseUnit>(units.glucoseUnit);
  const [glucoseValue, setGlucoseValue] = useState('');
  const [glucoseType, setGlucoseType] = useState<'FASTING' | 'RANDOM'>('FASTING');
  const [weight, setWeight] = useState('');
  const [submitting, setSubmitting] = useState(false);
  /*
    Only the form's own problems live here now.

    A failed read of the previous reading used to land in this same string and render as a bare
    red box with no way to retry, which meant a patient on one bar of signal could not recover and
    could not tell a validation mistake apart from a network failure. The read owns its own five
    states below; this is validation and save failures only.
  */
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const requestedType = measurementTypeFromPreset(searchParams.get('type'));
    setType(requestedType);
  }, [searchParams]);

  const latest = usePortalResource<MeasurementRecord[]>({
    resourceKey: `${clinicId ?? 'no-clinic'}:${type}`,
    enabled: Boolean(clinicId),
    errorMessage: 'Your previous reading could not be loaded.',
    fetcher: async (token) => {
      const from = new Date();
      from.setDate(from.getDate() - 180);
      return fetchMeasurements(clinicId!, token, { type, from: from.toISOString() });
    },
  });

  const activeOption = useMemo(
    () => MEASUREMENT_OPTIONS.find((option) => option.value === type)!,
    [type],
  );

  // Typing a reading offline is fine; sending it is not. The draft stays in the form until then.
  const writeGate = usePortalWriteGate();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!writeGate.canWrite) return;

    if (!clinicId || !getToken) {
      setError('An active clinic is required before you can save a reading.');
      return;
    }

    const parsedRecordedAt = recordedAt ? new Date(recordedAt) : new Date();
    if (Number.isNaN(parsedRecordedAt.getTime())) {
      setError('Please enter a valid date and time for this reading.');
      return;
    }

    let payload: Record<string, number | string>;

    if (type === 'BP') {
      if (!systolic || !diastolic) {
        setError('Please enter both systolic and diastolic values.');
        return;
      }
      payload = {
        systolic: Number(systolic),
        diastolic: Number(diastolic),
      };
      if (pulse) {
        payload.pulse = Number(pulse);
      }
    } else if (type === 'GLUCOSE') {
      if (!glucoseValue) {
        setError('Please enter your glucose value.');
        return;
      }
      const glucoseError = glucoseEntryError(glucoseValue, glucoseUnit);
      const mgDl = glucoseTextToMgDl(glucoseValue, glucoseUnit);
      if (glucoseError || mgDl === null) {
        setError(glucoseError ?? 'Please enter your glucose value.');
        return;
      }
      // Always mg/dL: the portal API stores one unit whatever the patient's meter reads.
      payload = {
        value: mgDl,
        glucoseType,
      };
    } else {
      const kg = weightTextToKg(weight, units.bodyUnit);
      const weightError = weightEntryError(weight, units.bodyUnit);
      if (weightError || kg === null) {
        setError(weightError ?? 'Please enter your weight.');
        return;
      }
      payload = { kg };
    }

    setSubmitting(true);
    setError(null);

    try {
      await createMeasurement(clinicId, getToken, {
        type,
        payload,
        notes: notes.trim() || undefined,
        recordedAt: parsedRecordedAt.toISOString(),
      });
      router.push('/portal/health');
    } catch (err) {
      setError(getPortalErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <RouteGuard requiredPermission="PATIENT.PORTAL.WRITE_SELF_REPORT">
      <div className="space-y-6">
        <Button asChild variant="ghost" size="default">
          <Link href="/portal/health">
            <ArrowLeft aria-hidden="true" className="mr-2 h-4 w-4" />
            Back to health trends
          </Link>
        </Button>

        <PortalHero
          clinicName={clinicName}
          title="Log a reading"
          description="Choose a reading to share with your care team."
          contentClassName="grid gap-3 md:grid-cols-3"
        >
          {MEASUREMENT_OPTIONS.map((option) => {
            const Icon = option.icon;
            const isActive = option.value === type;

            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={isActive}
                onClick={() => setType(option.value)}
                className={cn(
                  'border-b px-2 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  isActive ? 'border-primary bg-primary/10' : 'border-border hover:bg-accent',
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <Icon aria-hidden="true" className="h-5 w-5 text-primary" />
                  <span className="mr-auto font-medium text-foreground">{option.label}</span>
                  {isActive && (
                    <Badge variant="secondary" className="rounded-full">
                      Selected
                    </Badge>
                  )}
                </div>
                <p
                  className={cn(
                    'mt-1 text-sm leading-6',
                    isActive ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {option.description}
                </p>
              </button>
            );
          })}
        </PortalHero>

        {/*
          role="alert" so a validation message reaches a screen reader at the moment it appears.
          The submit button is below the form, and without this the only signal that nothing was
          saved is a box the user has already scrolled past.
        */}
        {error ? (
          <div id="measurement-error" role="alert">
            <InlineErrorState title="This reading was not saved" description={error} />
          </div>
        ) : null}

        <PortalPanel
          title="Measurement details"
          description="Record your reading and add notes if there is anything unusual your care team should know."
        >
          <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="recordedAt">Date and time</Label>
                  <Input
                    id="recordedAt"
                    type="datetime-local"
                    className="tabular-nums"
                    value={recordedAt}
                    onChange={(event) => setRecordedAt(event.target.value)}
                    required
                  />
                </div>
              </div>

              {type === 'BP' && (
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="systolic">Systolic (mmHg)</Label>
                    <Input
                      id="systolic"
                      type="number"
                      className="tabular-nums"
                      min={50}
                      max={300}
                      value={systolic}
                      onChange={(event) => setSystolic(event.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="diastolic">Diastolic (mmHg)</Label>
                    <Input
                      id="diastolic"
                      type="number"
                      className="tabular-nums"
                      min={30}
                      max={200}
                      value={diastolic}
                      onChange={(event) => setDiastolic(event.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pulse">Pulse in beats per minute (optional)</Label>
                    <Input
                      id="pulse"
                      type="number"
                      className="tabular-nums"
                      min={20}
                      max={250}
                      value={pulse}
                      onChange={(event) => setPulse(event.target.value)}
                    />
                  </div>
                </div>
              )}

              {type === 'GLUCOSE' && (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="glucoseValue">Glucose ({glucoseUnitLabel(glucoseUnit)})</Label>
                    <div className="flex gap-2">
                      <Input
                        id="glucoseValue"
                        type="number"
                        inputMode={glucoseUnit === 'MMOL_L' ? 'decimal' : 'numeric'}
                        step={glucoseUnit === 'MMOL_L' ? '0.1' : '1'}
                        className="min-w-0 tabular-nums"
                        value={glucoseValue}
                        onChange={(event) => setGlucoseValue(event.target.value)}
                        required
                      />
                      <GlucoseUnitSelect
                        value={glucoseUnit}
                        onChange={(next) => {
                          setGlucoseValue((current) =>
                            convertGlucoseText(current, glucoseUnit, next),
                          );
                          setGlucoseUnit(next);
                        }}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="glucoseType">Reading type</Label>
                    <Select
                      value={glucoseType}
                      onValueChange={(value) => setGlucoseType(value as 'FASTING' | 'RANDOM')}
                    >
                      <SelectTrigger id="glucoseType">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="FASTING">Fasting</SelectItem>
                        <SelectItem value="RANDOM">Random</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {type === 'WEIGHT' && (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="weightKg">Weight ({weightUnitLabel(units.bodyUnit)})</Label>
                    <Input
                      id="weightKg"
                      type="number"
                      inputMode="decimal"
                      className="tabular-nums"
                      step="0.1"
                      value={weight}
                      onChange={(event) => setWeight(event.target.value)}
                      required
                    />
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Optional context, such as symptoms, timing, or anything unusual about the reading."
                  rows={5}
                  maxLength={2000}
                />
              </div>
            </div>

            <div className="space-y-4">
              <div className="border-t border-border py-4">
                <h3 className="flex items-center gap-2 font-medium text-foreground">
                  <Activity aria-hidden="true" className="h-4 w-4 text-primary" />
                  What will be saved
                </h3>
                <div className="mt-4 space-y-4">
                  <PortalFact label="Measurement type" value={activeOption.label} />
                  <PortalFact
                    label="Recorded at"
                    value={
                      recordedAt
                        ? formatPortalDateTime(new Date(recordedAt).toISOString())
                        : 'Choose the reading time'
                    }
                    valueClassName="font-normal text-muted-foreground"
                  />
                  <PortalFact
                    label="Notes"
                    value={notes.trim() || 'No additional notes'}
                    valueClassName="font-normal leading-6 text-muted-foreground"
                  />
                </div>
              </div>

              <PortalWriteGateNotice gate={writeGate} />

              <Button type="submit" disabled={submitting || !writeGate.canWrite} className="w-full">
                {submitting
                  ? 'Saving measurement...'
                  : `Save ${activeOption.label.toLowerCase()} reading`}
              </Button>
            </div>
          </form>
        </PortalPanel>

        <div className="grid gap-6 lg:grid-cols-2">
          <PortalPanel
            title={`Latest ${activeOption.label.toLowerCase()}`}
            description="Recent portal reading for quick comparison."
          >
            <ResourceState
              state={latest}
              errorTitle="Your previous reading could not be loaded"
              // The empty case is rendered below rather than through `empty`, because this panel
              // sits in a side column where the comfortable density would push the form off the
              // fold. Same component, the density the contract asks for in a card.
              skeleton={
                <SectionSkeleton lines={1} className="border-0 bg-transparent p-0 shadow-none" />
              }
            >
              {(measurements) =>
                measurements.length === 0 ? (
                  <EmptyState
                    density="compact"
                    icon={activeOption.icon}
                    title="No saved reading yet"
                    description={`Your most recent ${activeOption.label.toLowerCase()} reading will appear here once you save one.`}
                  />
                ) : (
                  <div className="border-b border-border py-3">
                    <p className="font-medium tabular-nums text-foreground">
                      {formatMeasurementValue(measurements[0], units)}
                    </p>
                    <p className="mt-2 text-sm tabular-nums text-muted-foreground">
                      Recorded {formatPortalDateTime(measurements[0].recordedAt)}
                    </p>
                  </div>
                )
              }
            </ResourceState>
          </PortalPanel>

          <PortalPanel
            title="Helpful tip"
            contentClassName="text-sm leading-6 text-muted-foreground"
          >
            {getTypeTips(type)}
          </PortalPanel>
        </div>
      </div>
    </RouteGuard>
  );
}
