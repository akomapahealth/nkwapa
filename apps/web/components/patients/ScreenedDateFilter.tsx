'use client';

import { useState } from 'react';
import { InfoHint } from '@/components/ui/info-hint';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  SCREENED_PRESET_LABELS,
  describeScreening,
  presetFor,
  presetRange,
  type MatchingScreening,
  type ScreenedPreset,
} from '@/lib/patient-registry-screened';

export interface ScreenedDateValue {
  from: string;
  to: string;
}

const PRESETS = Object.keys(SCREENED_PRESET_LABELS) as ScreenedPreset[];

/**
 * "Who completed a screening on…" for the registry. Presets cover session prep; a custom range
 * uses two plain date inputs. Dates are clinic-local, and the helper text says which zone.
 *
 * `error` is shown under the inputs and wired to them with aria-describedby, whether it came from
 * the client-side check or from the API refusing the range.
 */
export function ScreenedDateFilter({
  value,
  onChange,
  today,
  timeZone,
  error,
}: {
  value: ScreenedDateValue;
  onChange: (next: ScreenedDateValue) => void;
  today: string;
  timeZone: string;
  error?: { field: 'from' | 'to'; message: string } | null;
}) {
  /*
    Choosing Custom shows the inputs even while the dates still read as a preset, or are empty,
    which presetFor alone cannot tell. The parent remounts this when it clears the filter itself.
  */
  const [customChosen, setCustomChosen] = useState(false);
  const preset: ScreenedPreset = customChosen ? 'custom' : presetFor(value.from, value.to, today);
  const helpId = 'filter-screened-help';
  const errorId = 'filter-screened-error';
  const describedBy = error ? `${helpId} ${errorId}` : helpId;

  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium text-foreground">Completed screening</legend>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-2">
          <Label htmlFor="filter-screened">Screened</Label>
          <Select
            value={preset}
            onValueChange={(next) => {
              const chosen = next as ScreenedPreset;
              setCustomChosen(chosen === 'custom');
              // Custom keeps whatever range is showing, so it can be adjusted rather than retyped.
              if (chosen !== 'custom') onChange(presetRange(chosen, today));
            }}
          >
            <SelectTrigger id="filter-screened" aria-describedby={helpId}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRESETS.map((option) => (
                <SelectItem key={option} value={option}>
                  {SCREENED_PRESET_LABELS[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {preset === 'custom' ? (
          <>
            <div className="space-y-2">
              <Label htmlFor="filter-screened-from">From</Label>
              <Input
                id="filter-screened-from"
                type="date"
                value={value.from}
                max={value.to || undefined}
                onChange={(event) => onChange({ ...value, from: event.target.value })}
                aria-invalid={error?.field === 'from' || undefined}
                aria-describedby={describedBy}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="filter-screened-to">
                To <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="filter-screened-to"
                type="date"
                value={value.to}
                min={value.from || undefined}
                onChange={(event) => onChange({ ...value, to: event.target.value })}
                aria-invalid={error?.field === 'to' || undefined}
                aria-describedby={describedBy}
              />
            </div>
          </>
        ) : null}
      </div>
      <p id={helpId} className="text-xs text-muted-foreground">
        Dates are in {timeZone} time. Leave “To” empty for a single day.
      </p>
      {error ? (
        <p id={errorId} role="alert" className="text-sm font-medium text-destructive">
          {error.message}
        </p>
      ) : null}
    </fieldset>
  );
}

/**
 * A patient's matching screenings in a table cell: up to two lines, or the newest one and
 * "+N more" with the full list in a popover.
 */
export function ScreenedDates({
  screenings,
  timeZone,
}: {
  screenings: MatchingScreening[];
  timeZone: string;
}) {
  if (screenings.length === 0) return <span className="text-muted-foreground">—</span>;
  const lines = screenings.map((screening) => describeScreening(screening, timeZone));
  if (lines.length <= 2) {
    return (
      <ul className="space-y-0.5 tabular-nums">
        {lines.map((line, index) => (
          <li key={screenings[index].checkInId + line}>{line}</li>
        ))}
      </ul>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 tabular-nums">
      {lines[0]}
      <span className="text-muted-foreground">+{lines.length - 1} more</span>
      <InfoHint label={`All ${lines.length} matching screenings`} size="sm">
        <ul className="space-y-0.5 tabular-nums">
          {lines.map((line, index) => (
            <li key={screenings[index].checkInId + line}>{line}</li>
          ))}
        </ul>
      </InfoHint>
    </span>
  );
}
