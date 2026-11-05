'use client';

import { GLUCOSE_UNITS, GLUCOSE_UNIT_LABELS, type GlucoseUnit } from '@nkwapa/db/measurement-units';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/**
 * The per-entry glucose unit, beside the reading. It starts on the clinic's unit and is there for
 * a meter that reads the other one. Switching converts what was typed, so the reading on screen
 * keeps its meaning; it never reinterprets the number.
 */
export function GlucoseUnitSelect({
  value,
  onChange,
  disabled,
}: {
  value: GlucoseUnit;
  onChange: (unit: GlucoseUnit) => void;
  disabled?: boolean;
}) {
  return (
    <Select
      value={value}
      onValueChange={(next) => onChange(next as GlucoseUnit)}
      disabled={disabled}
    >
      <SelectTrigger aria-label="Glucose unit" className="h-11 w-28 shrink-0">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {GLUCOSE_UNITS.map((unit) => (
          <SelectItem key={unit} value={unit}>
            {GLUCOSE_UNIT_LABELS[unit]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
