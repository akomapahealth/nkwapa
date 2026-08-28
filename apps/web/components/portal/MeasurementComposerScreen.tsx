'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Activity, ArrowLeft, HeartPulse, Scale, Syringe } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useBootstrap } from '@/lib/bootstrap-context';
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
import {
  PORTAL_HERO_GRID,
  PortalFact,
  PortalHero,
  PortalPanel,
} from '@/components/portal/PortalPanels';
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
    description: 'Track systolic and diastolic values from home.',
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
  const [glucoseValue, setGlucoseValue] = useState('');
  const [glucoseType, setGlucoseType] = useState<'FASTING' | 'RANDOM'>('FASTING');
  const [weightKg, setWeightKg] = useState('');
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

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

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
      payload = {
        value: Number(glucoseValue),
        glucoseType,
      };
    } else {
      if (!weightKg) {
        setError('Please enter your weight in kilograms.');
        return;
      }
      payload = {
        kg: Number(weightKg),
      };
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
        <Button asChild variant="ghost" size="sm">
          <Link href="/portal/health">
            <ArrowLeft aria-hidden="true" className="mr-2 h-4 w-4" />
            Back to health trends
          </Link>
        </Button>

        <section className={PORTAL_HERO_GRID}>
          <PortalHero
            eyebrow="Home readings"
            clinicName={clinicName}
            title="Log a reading your care team can use right away."
            description="Add blood pressure, glucose, or weight measurements in a clean format that is easy to review during follow-up."
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
                    'rounded-lg border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                    isActive
                      ? 'border-primary bg-primary/10'
                      : 'border-input bg-background hover:bg-accent',
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <Icon aria-hidden="true" className="h-5 w-5 text-primary" />
                    {isActive && (
                      <Badge variant="secondary" className="rounded-full">
                        Selected
                      </Badge>
                    )}
                  </div>
                  <p className="mt-4 font-medium text-foreground">{option.label}</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {option.description}
                  </p>
                </button>
              );
            })}
          </PortalHero>

          <div className="space-y-4">
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
                    <div className="rounded-lg border border-border bg-background p-4">
                      <p className="font-medium tabular-nums text-foreground">
                        {formatMeasurementValue(measurements[0])}
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
        </section>

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
                    <Label htmlFor="glucoseValue">Glucose (mg/dL)</Label>
                    <Input
                      id="glucoseValue"
                      type="number"
                      className="tabular-nums"
                      min={20}
                      max={600}
                      value={glucoseValue}
                      onChange={(event) => setGlucoseValue(event.target.value)}
                      required
                    />
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
                    <Label htmlFor="weightKg">Weight (kg)</Label>
                    <Input
                      id="weightKg"
                      type="number"
                      className="tabular-nums"
                      min={1}
                      max={500}
                      step="0.1"
                      value={weightKg}
                      onChange={(event) => setWeightKg(event.target.value)}
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
              <div className="rounded-lg border border-border bg-background p-5">
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

              <Button type="submit" disabled={submitting} className="w-full">
                {submitting
                  ? 'Saving measurement...'
                  : `Save ${activeOption.label.toLowerCase()} reading`}
              </Button>
            </div>
          </form>
        </PortalPanel>
      </div>
    </RouteGuard>
  );
}
