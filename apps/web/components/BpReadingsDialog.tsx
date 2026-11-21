'use client';

import { useState } from 'react';
import { averageBpReadings, BP_MAX_READINGS } from '@nkwapa/db/bp-classification';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export type BpReading = { systolic: number; diastolic: number };

type Row = { systolic: string; diastolic: string };

const blankRows = (): Row[] =>
  Array.from({ length: BP_MAX_READINGS }, () => ({ systolic: '', diastolic: '' }));

/** A row counts once both numbers are plausible and systolic is above diastolic. */
function toReading(row: Row): BpReading | null {
  const systolic = Number(row.systolic);
  const diastolic = Number(row.diastolic);
  if (!row.systolic || !row.diastolic) return null;
  if (!Number.isInteger(systolic) || !Number.isInteger(diastolic)) return null;
  if (systolic < 40 || systolic > 300 || diastolic < 20 || diastolic > 200) return null;
  return systolic > diastolic ? { systolic, diastolic } : null;
}

/**
 * Several readings at one sitting, averaged (screening-day feedback, 2026-11-21).
 *
 * WHO HEARTS and ISH 2020 ask for two or three readings a minute or so apart, using the average
 * of the last two. The average fills the form's BP fields; the readings are saved alongside it.
 */
export function BpReadingsDialog({
  open,
  onOpenChange,
  initial,
  onUse,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: BpReading[];
  onUse: (readings: BpReading[], average: BpReading) => void;
}) {
  const [rows, setRows] = useState<Row[]>(blankRows);
  const [seeded, setSeeded] = useState(false);
  // Reopening shows the readings already taken, so a third can be added to two.
  if (open && !seeded) {
    setSeeded(true);
    setRows(
      blankRows().map((blank, index) =>
        initial?.[index]
          ? {
              systolic: String(initial[index].systolic),
              diastolic: String(initial[index].diastolic),
            }
          : blank,
      ),
    );
  } else if (!open && seeded) {
    setSeeded(false);
  }

  // Readings count in order: a gap stops the count, so "the last two" means what was taken last.
  const readings: BpReading[] = [];
  for (const row of rows) {
    const reading = toReading(row);
    if (!reading) break;
    readings.push(reading);
  }
  const average = readings.length >= 2 ? averageBpReadings(readings) : null;
  const update = (index: number, field: keyof Row, value: string) =>
    setRows((current) => current.map((row, i) => (i === index ? { ...row, [field]: value } : row)));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="form">
        <DialogHeader>
          <DialogTitle>Take several readings</DialogTitle>
          <DialogDescription>
            Seat the patient, then take two or three readings about a minute apart. With three, the
            first is left out because it usually runs high.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {rows.map((row, index) => (
            <fieldset key={index} className="grid grid-cols-2 gap-3">
              <legend className="mb-1 text-sm font-medium">
                Reading {index + 1}
                {index === BP_MAX_READINGS - 1 ? ' (optional)' : ''}
              </legend>
              <div className="flex min-w-0 flex-col gap-2">
                <Label htmlFor={`bp-reading-${index}-systolic`}>Systolic (mmHg)</Label>
                <Input
                  id={`bp-reading-${index}-systolic`}
                  type="number"
                  inputMode="numeric"
                  value={row.systolic}
                  onChange={(event) => update(index, 'systolic', event.target.value)}
                />
              </div>
              <div className="flex min-w-0 flex-col gap-2">
                <Label htmlFor={`bp-reading-${index}-diastolic`}>Diastolic (mmHg)</Label>
                <Input
                  id={`bp-reading-${index}-diastolic`}
                  type="number"
                  inputMode="numeric"
                  value={row.diastolic}
                  onChange={(event) => update(index, 'diastolic', event.target.value)}
                />
              </div>
            </fieldset>
          ))}
          <p className="text-sm" aria-live="polite" data-testid="bp-readings-average">
            {average
              ? `Average used: ${average.systolic}/${average.diastolic} mmHg${
                  readings.length >= 3 ? ' (readings 2 and 3)' : ''
                }`
              : 'Enter at least two complete readings to see the average.'}
          </p>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!average}
            onClick={() => {
              if (!average) return;
              onUse(readings, average);
              onOpenChange(false);
            }}
          >
            Use average
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
