'use client';

import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FieldError, FieldLabel, fieldErrorProps } from '@/components/ui/field';
import { cn } from '@/lib/utils';

/**
 * The question shapes the chronic-disease interviews are built from.
 *
 * Sixty fields written out as bespoke JSX is sixty chances to forget the `htmlFor`, the
 * `aria-describedby`, or the `disabled` that Radix's Select does not inherit from a fieldset. The
 * repetition is the actual risk here, so the contract in MASTER.md section 10 is satisfied once,
 * in these four components, and every question is a line of configuration.
 */

/**
 * Radix's Select cannot hold an empty string as an item value, and an empty string is how "not
 * chosen" is represented in form state. This stands in for it on the wire between the two.
 */
const UNSET = '__UNSET__';

export interface QuestionProps {
  id: string;
  label: string;
  /** Rendered under the label, for the phrasing a volunteer should actually say aloud. */
  hint?: string;
  error?: string;
  disabled?: boolean;
  /**
   * Hold a line of space for the error. Bound to "the form has been submitted once", never to
   * true -- see the note on `FieldError`.
   */
  reserveErrorSpace?: boolean;
  required?: boolean;
}

function QuestionShell({
  id,
  label,
  hint,
  error,
  reserveErrorSpace,
  required,
  children,
}: QuestionProps & { children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <FieldLabel htmlFor={id} required={required}>
        {label}
      </FieldLabel>
      {hint ? (
        <p id={`${id}-hint`} className="text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {children}
      <FieldError id={id} message={error} reserveSpace={reserveErrorSpace} />
    </div>
  );
}

/** One answer from a closed vocabulary. */
export function ChoiceQuestion({
  value,
  onChange,
  options,
  labels,
  placeholder,
  ...shell
}: QuestionProps & {
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
  labels: Record<string, string>;
  placeholder?: string;
}) {
  return (
    <QuestionShell {...shell}>
      {/*
        The id belongs on the trigger, and `disabled` has to be repeated here: Radix's Select is
        not a native control, so it inherits neither the label nor a surrounding `fieldset
        disabled`. A finalized assessment whose Select was still changeable is exactly the bug
        MASTER.md section 10 records.
      */}
      <Select
        value={value || UNSET}
        onValueChange={(next) => onChange(next === UNSET ? '' : next)}
        disabled={shell.disabled}
      >
        <SelectTrigger id={shell.id} {...fieldErrorProps(shell.id, shell.error)}>
          <SelectValue placeholder={placeholder ?? 'Select an answer'} />
        </SelectTrigger>
        <SelectContent>
          {placeholder ? <SelectItem value={UNSET}>{placeholder}</SelectItem> : null}
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {labels[option] ?? option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </QuestionShell>
  );
}

/**
 * Any number of answers from a closed vocabulary.
 *
 * Rendered as a fieldset with its own legend rather than a label plus loose checkboxes: a screen
 * reader reaching the third checkbox of a ten-option symptom list otherwise has no way to hear
 * which question it belongs to.
 */
export function MultiChoiceQuestion({
  value,
  onChange,
  options,
  labels,
  exclusive,
  columns = 2,
  ...shell
}: QuestionProps & {
  value: string[];
  onChange: (value: string[]) => void;
  options: readonly string[];
  labels: Record<string, string>;
  /**
   * Options that mean "and nothing else" -- None, None known, No intervention completed.
   * Selecting one clears the rest, so the volunteer never has to undo the list by hand.
   */
  exclusive?: readonly string[];
  columns?: 1 | 2 | 3;
}) {
  const toggle = (option: string) => {
    const isExclusive = exclusive?.includes(option) ?? false;
    if (value.includes(option)) {
      onChange(value.filter((entry) => entry !== option));
      return;
    }
    if (isExclusive) {
      onChange([option]);
      return;
    }
    onChange([...value.filter((entry) => !(exclusive?.includes(entry) ?? false)), option]);
  };

  return (
    <fieldset className="space-y-2" aria-describedby={shell.hint ? `${shell.id}-hint` : undefined}>
      <legend className="text-sm font-medium leading-none">{shell.label}</legend>
      {shell.hint ? (
        <p id={`${shell.id}-hint`} className="text-sm text-muted-foreground">
          {shell.hint}
        </p>
      ) : null}
      <div
        id={shell.id}
        className={cn(
          'grid gap-2',
          columns === 1 && 'grid-cols-1',
          columns === 2 && 'grid-cols-1 sm:grid-cols-2',
          columns === 3 && 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
        )}
      >
        {options.map((option) => {
          const optionId = `${shell.id}-${option.toLowerCase().replace(/_/g, '-')}`;
          return (
            <div key={option} className="flex items-start gap-2">
              <Checkbox
                id={optionId}
                checked={value.includes(option)}
                onCheckedChange={() => toggle(option)}
                disabled={shell.disabled}
              />
              <Label htmlFor={optionId} className="cursor-pointer text-sm font-normal leading-5">
                {labels[option] ?? option}
              </Label>
            </div>
          );
        })}
      </div>
      <FieldError id={shell.id} message={shell.error} reserveSpace={shell.reserveErrorSpace} />
    </fieldset>
  );
}

/**
 * A number, with its unit in the label.
 *
 * `inputMode="numeric"` rather than `type="number"`: a spinner is useless for a blood pressure, and
 * `type="number"` silently discards a partially typed value on some browsers, which loses the
 * keystroke a volunteer just made.
 */
export function NumberQuestion({
  value,
  onChange,
  placeholder,
  ...shell
}: QuestionProps & {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <QuestionShell {...shell}>
      <Input
        id={shell.id}
        inputMode="numeric"
        autoComplete="off"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        disabled={shell.disabled}
        {...fieldErrorProps(shell.id, shell.error)}
      />
    </QuestionShell>
  );
}

/** Free text, for the answers a vocabulary cannot hold. */
export function TextQuestion({
  value,
  onChange,
  placeholder,
  maxLength,
  ...shell
}: QuestionProps & {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
}) {
  return (
    <QuestionShell {...shell}>
      <Input
        id={shell.id}
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
        disabled={shell.disabled}
        {...fieldErrorProps(shell.id, shell.error)}
      />
    </QuestionShell>
  );
}

/** A single yes/no the interview asks alongside another control. */
export function CheckboxQuestion({
  checked,
  onChange,
  label,
  id,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  id: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(next) => onChange(!!next)}
        disabled={disabled}
      />
      <Label htmlFor={id} className="cursor-pointer text-sm font-normal">
        {label}
      </Label>
    </div>
  );
}
