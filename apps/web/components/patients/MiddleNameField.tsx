'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MIDDLE_NAME_HINT, MIDDLE_NAME_LABEL } from '@/lib/person-name';

/**
 * The optional "Middle name(s)" field on the patient forms (#342): one box for any number of
 * names, between first and last. `describedBy` is the form's own error wiring, if any; the hint
 * is joined to it so a screen reader hears both.
 */
export function MiddleNameField({
  id = 'middleName',
  value,
  onChange,
  invalid,
  describedBy,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  describedBy?: string;
}) {
  const hintId = `${id}-hint`;
  return (
    <div className="min-w-0 space-y-2">
      <Label htmlFor={id}>{MIDDLE_NAME_LABEL}</Label>
      <Input
        id={id}
        name="middleName"
        value={value}
        maxLength={120}
        autoComplete="additional-name"
        autoCapitalize="words"
        spellCheck={false}
        aria-invalid={invalid || undefined}
        aria-describedby={[hintId, describedBy].filter(Boolean).join(' ')}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
      <p id={hintId} className="text-sm leading-5 text-muted-foreground">
        {MIDDLE_NAME_HINT}
      </p>
    </div>
  );
}
