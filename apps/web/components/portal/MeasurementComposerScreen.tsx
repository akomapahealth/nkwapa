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
  measurementTypeFromPreset,
  type MeasurementRecord,
} from '@/lib/patient-portal';
import { cn } from '@/lib/utils';
import { RouteGuard } from '@/components/RouteGuard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
  const [latestMeasurement, setLatestMeasurement] = useState<MeasurementRecord | null>(null);
  const [loadingLatest, setLoadingLatest] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const requestedType = measurementTypeFromPreset(searchParams.get('type'));
    setType(requestedType);
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;

    async function loadLatest() {
      if (!clinicId || !getToken) {
        setLoadingLatest(false);
        return;
      }

      setLoadingLatest(true);
      try {
        const from = new Date();
        from.setDate(from.getDate() - 180);
        const measurements = await fetchMeasurements(clinicId, getToken, {
          type,
          from: from.toISOString(),
        });
        if (!cancelled) {
          setLatestMeasurement(measurements[0] ?? null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) {
          setLoadingLatest(false);
        }
      }
    }

    loadLatest();

    return () => {
      cancelled = true;
    };
  }, [clinicId, getToken, type]);

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
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <RouteGuard requiredPermission="PATIENT.PORTAL.WRITE_SELF_REPORT">
      <div className="space-y-6">
        <Button asChild variant="ghost" size="sm">
          <Link href="/portal/health">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to health trends
          </Link>
        </Button>

        <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          <Card className="overflow-hidden border-border/70 bg-gradient-to-br from-card via-card to-secondary/10">
            <CardHeader className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="rounded-full px-3 py-1">
                  Structured measurements
                </Badge>
                {clinicName && (
                  <Badge variant="outline" className="rounded-full bg-background/80 px-3 py-1">
                    {clinicName}
                  </Badge>
                )}
              </div>
              <div className="space-y-2">
                <CardTitle className="text-2xl md:text-3xl">
                  Log a reading your care team can use right away.
                </CardTitle>
                <CardDescription className="max-w-2xl text-sm md:text-base">
                  Add blood pressure, glucose, or weight measurements in a clean format that is easy
                  to review during follow-up.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-3">
              {MEASUREMENT_OPTIONS.map((option) => {
                const Icon = option.icon;
                const isActive = option.value === type;

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setType(option.value)}
                    className={cn(
                      'rounded-2xl border p-4 text-left transition',
                      isActive
                        ? 'border-primary bg-primary/10 shadow-sm'
                        : 'border-border/70 bg-background/80 hover:border-primary/40',
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <Icon className="h-5 w-5 text-primary" />
                      {isActive && (
                        <Badge variant="secondary" className="rounded-full">
                          Selected
                        </Badge>
                      )}
                    </div>
                    <p className="mt-4 font-medium">{option.label}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{option.description}</p>
                  </button>
                );
              })}
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card className="border-border/70 bg-card/95">
              <CardHeader>
                <CardTitle className="text-lg">Latest {activeOption.label}</CardTitle>
                <CardDescription>Recent portal reading for quick comparison.</CardDescription>
              </CardHeader>
              <CardContent>
                {loadingLatest ? (
                  <div className="h-28 animate-pulse rounded-2xl border border-border/70 bg-muted/30" />
                ) : latestMeasurement ? (
                  <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
                    <p className="font-medium">{formatMeasurementValue(latestMeasurement)}</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Recorded {formatPortalDateTime(latestMeasurement.recordedAt)}
                    </p>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 p-4 text-sm text-muted-foreground">
                    No saved {activeOption.label.toLowerCase()} reading yet.
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-border/70 bg-card/95">
              <CardHeader>
                <CardTitle className="text-lg">Helpful tip</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {getTypeTips(type)}
              </CardContent>
            </Card>
          </div>
        </section>

        {error && (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {error}
          </div>
        )}

        <Card className="border-border/70 bg-card/95">
          <CardHeader>
            <CardTitle className="text-lg">Measurement details</CardTitle>
            <CardDescription>
              Record your reading and add notes if there is anything unusual your care team should
              know.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="space-y-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="recordedAt">Date and time</Label>
                    <Input
                      id="recordedAt"
                      type="datetime-local"
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
                        min={30}
                        max={200}
                        value={diastolic}
                        onChange={(event) => setDiastolic(event.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pulse">Pulse (optional)</Label>
                      <Input
                        id="pulse"
                        type="number"
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
                <div className="rounded-3xl border border-border/70 bg-gradient-to-br from-primary/10 via-background to-background p-5">
                  <div className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-primary" />
                    <p className="font-medium">What will be saved</p>
                  </div>
                  <div className="mt-4 space-y-4 text-sm">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        Measurement type
                      </p>
                      <p className="mt-2">{activeOption.label}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        Recorded at
                      </p>
                      <p className="mt-2 text-muted-foreground">
                        {recordedAt
                          ? formatPortalDateTime(new Date(recordedAt).toISOString())
                          : 'Choose the reading time'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        Notes
                      </p>
                      <p className="mt-2 text-muted-foreground">
                        {notes.trim() || 'No additional notes'}
                      </p>
                    </div>
                  </div>
                </div>

                <Button type="submit" disabled={submitting} className="w-full">
                  {submitting
                    ? 'Saving measurement...'
                    : `Save ${activeOption.label.toLowerCase()} reading`}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </RouteGuard>
  );
}
