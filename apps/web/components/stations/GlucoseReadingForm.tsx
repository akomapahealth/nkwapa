'use client';

import { useMemo, useState } from 'react';
import { Droplet } from 'lucide-react';
import { evaluateGlucoseSuspicion, isHypoglycemic } from '@nkwapa/db/diabetes-thresholds';
import type { GlucoseUnit } from '@nkwapa/db/measurement-units';
import { useClinicUnits } from '@/lib/bootstrap-context';
import {
  convertGlucoseText,
  glucoseEntryError,
  glucoseTextToMgDl,
  glucoseUnitLabel,
  mgDlToGlucoseText,
} from '@/lib/measurement-entry';
import { GlucoseUnitSelect } from '@/components/GlucoseUnitSelect';
import { useSync } from '@/app/ServiceWorkerAndSyncProvider';
import { isFullySynced } from '@/lib/sync';
import {
  GLUCOSE_READING_TYPES,
  saveGlucoseReadingOffline,
  type GlucoseReadingType,
} from '@/lib/glucose-reading';
import type { DiabetesScreeningRecord } from '@/lib/db';
import { Button } from '@/components/ui/button';
import {
  RecordSection as Card,
  RecordSectionContent as CardContent,
  RecordSectionDescription as CardDescription,
  RecordSectionHeader as CardHeader,
  RecordSectionTitle as CardTitle,
} from '@/components/patients/RecordSection';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { InlineNotice } from '@/components/ops/OpsShared';

const TYPE_LABELS: Record<GlucoseReadingType, string> = {
  FASTING: 'Fasting',
  BEFORE_MEAL: 'Before a meal',
  POST_PRANDIAL_2H: '2 hours after a meal',
  RANDOM: 'Random',
  UNKNOWN: 'Not known',
};

const SUSPICION_LABELS: Record<string, string> = {
  SUSPECTED: 'Above the screening threshold. Flag it for the review station.',
  NOT_SUSPECTED: 'Within the screening range.',
};

/**
 * The glucose station (#167): today's reading and its timing, and nothing else. Saved on its own
 * so it never resets a guided diabetes interview recorded elsewhere. Works offline.
 */
export function GlucoseReadingForm({
  clinicId,
  encounterId,
  initialData,
  onSaved,
}: {
  clinicId: string;
  encounterId: string;
  initialData?: DiabetesScreeningRecord | null;
  onSaved?: () => void;
}) {
  const { isOnline, syncNow } = useSync();
  const clinicUnit = useClinicUnits(clinicId).glucoseUnit;
  const storedMgDl = initialData?.glucoseMgDl ?? null;
  const [unit, setUnit] = useState<GlucoseUnit>(clinicUnit);
  const [value, setValue] = useState(() => mgDlToGlucoseText(storedMgDl, clinicUnit));
  const [type, setType] = useState<GlucoseReadingType>(
    (initialData?.glucoseType as GlucoseReadingType | undefined) ?? 'RANDOM',
  );
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const error = glucoseEntryError(value, unit);
  const invalid = error !== null;
  // Always whole mg/dL: the unit on screen never reaches the outbox.
  const reading = glucoseTextToMgDl(value, unit, storedMgDl);

  function changeUnit(next: GlucoseUnit) {
    setValue((current) => convertGlucoseText(current, unit, next, storedMgDl));
    setUnit(next);
  }
  const suspicion = useMemo(
    () => (reading !== null && !invalid ? evaluateGlucoseSuspicion(reading, type) : null),
    [reading, invalid, type],
  );

  async function save() {
    if (invalid) return;
    setSaving(true);
    setStatus(null);
    try {
      await saveGlucoseReadingOffline({
        clinicId,
        encounterId,
        reading: { glucoseMgDl: reading, glucoseType: type, collectedAt: new Date().toISOString() },
      });
      const synced = isOnline ? await syncNow(clinicId) : null;
      setStatus({
        tone: 'success',
        text: isFullySynced(synced)
          ? 'Glucose reading saved and synced.'
          : 'Glucose reading saved on this device and pending sync.',
      });
      onSaved?.();
    } catch (error) {
      setStatus({
        tone: 'error',
        text: error instanceof Error ? error.message : 'The reading could not be saved.',
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <Droplet className="h-5 w-5 text-primary" aria-hidden="true" />
          Blood glucose
        </CardTitle>
        <CardDescription>Record the reading and when the patient last ate.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="glucoseMgDl">Glucose ({glucoseUnitLabel(unit)})</Label>
            <div className="flex gap-2">
              <Input
                id="glucoseMgDl"
                type="number"
                inputMode={unit === 'MMOL_L' ? 'decimal' : 'numeric'}
                step={unit === 'MMOL_L' ? '0.1' : '1'}
                value={value}
                onChange={(event) => setValue(event.target.value)}
                aria-invalid={invalid}
                aria-describedby={invalid ? 'glucoseMgDl-error' : undefined}
                className="h-11 min-w-0"
              />
              <GlucoseUnitSelect value={unit} onChange={changeUnit} />
            </div>
            {error ? (
              <p id="glucoseMgDl-error" className="text-sm text-destructive-ink">
                {error}
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="glucoseType">Timing</Label>
            <Select value={type} onValueChange={(next) => setType(next as GlucoseReadingType)}>
              <SelectTrigger id="glucoseType">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GLUCOSE_READING_TYPES.map((option) => (
                  <SelectItem key={option} value={option}>
                    {TYPE_LABELS[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {reading !== null && !invalid && isHypoglycemic(reading) ? (
          <InlineNotice tone="error" live={false}>
            This reading is low. Tell a clinician now.
          </InlineNotice>
        ) : null}
        {suspicion && SUSPICION_LABELS[suspicion] ? (
          <InlineNotice tone={suspicion === 'NOT_SUSPECTED' ? 'info' : 'warning'} live={false}>
            {SUSPICION_LABELS[suspicion]}
          </InlineNotice>
        ) : null}
        {status ? <InlineNotice tone={status.tone}>{status.text}</InlineNotice> : null}
        <div className="flex justify-end">
          <Button type="button" onClick={() => void save()} disabled={saving || invalid}>
            {saving ? 'Saving…' : 'Save reading'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
