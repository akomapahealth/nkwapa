'use client';

import { Fragment, useState } from 'react';

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
import { isUnasked, useInterviewQuestion } from '@/components/encounters/InterviewFlow';

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
  /**
   * The sentence the volunteer reads aloud to the patient. Shown larger than the label, which
   * stays the field's short name (and its accessible name) for the review screen and the chart.
   */
  ask?: string;
  /** A short note under the question: "Leave blank if the patient is not sure when." */
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
  ask,
  hint,
  error,
  reserveErrorSpace,
  required,
  children,
}: QuestionProps & { children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <FieldLabel
        htmlFor={id}
        required={required}
        className={ask ? 'font-normal text-muted-foreground' : undefined}
      >
        {label}
      </FieldLabel>
      <Ask id={id} ask={ask} />
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

/** Everything that describes the control: the spoken question, the note, then any error. */
function describedBy({ id, ask, hint, error }: QuestionProps) {
  const ids = [
    ask && `${id}-ask`,
    hint && `${id}-hint`,
    error && fieldErrorProps(id, error)['aria-describedby'],
  ];
  return ids.filter(Boolean).join(' ') || undefined;
}

function Ask({ id, ask }: { id: string; ask?: string }) {
  return ask ? (
    <p
      id={`${id}-ask`}
      className="max-w-prose text-pretty text-lg font-medium leading-snug text-foreground"
    >
      {ask}
    </p>
  ) : null;
}

/** Answer sets up to this size render as one row of choices instead of a menu. */
const SEGMENTED_MAX = 5;

/**
 * One answer from a short vocabulary, as a row of native radios styled as choices.
 *
 * Native radios, so arrow keys, the label and the group name come from the platform. Digits 1-9
 * pick the matching choice while the group has focus, for a volunteer typing answers as the
 * patient speaks. "Not asked" is the last, quiet choice and is never shown as picked until the
 * volunteer picks it: an untouched question reads as unanswered, while it still saves as "Not
 * asked" exactly as before.
 */
function SegmentedChoice({
  value,
  onChange,
  options,
  labels,
  ...shell
}: QuestionProps & {
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
  labels: Record<string, string>;
}) {
  const [touched, setTouched] = useState(false);
  const shown = isUnasked(value) && !touched ? '' : value;
  const pick = (option: string) => {
    setTouched(true);
    onChange(option);
  };
  const ordered = [
    ...options.filter((option) => !isUnasked(option)),
    ...options.filter((option) => isUnasked(option)),
  ];
  return (
    <fieldset className="space-y-2" aria-describedby={describedBy({ ...shell, error: undefined })}>
      <legend
        id={`${shell.id}-legend`}
        className={cn('text-sm leading-none', shell.ask ? 'text-muted-foreground' : 'font-medium')}
      >
        {shell.label}
        {shell.required ? <span aria-hidden="true"> *</span> : null}
      </legend>
      <Ask id={shell.id} ask={shell.ask} />
      {shell.hint ? (
        <p id={`${shell.id}-hint`} className="text-sm text-muted-foreground">
          {shell.hint}
        </p>
      ) : null}
      <div
        id={shell.id}
        role="radiogroup"
        aria-labelledby={`${shell.id}-legend`}
        tabIndex={-1}
        className="flex flex-wrap gap-2 rounded-md focus-visible:outline-none"
        onKeyDown={(event) => {
          const n = Number(event.key);
          if (shell.disabled || !Number.isInteger(n) || n < 1 || n > ordered.length) return;
          if (event.altKey || event.ctrlKey || event.metaKey) return;
          event.preventDefault();
          pick(ordered[n - 1]);
          (event.currentTarget.querySelectorAll('input')[n - 1] as HTMLInputElement)?.focus();
        }}
        {...fieldErrorProps(shell.id, shell.error)}
        aria-describedby={describedBy(shell)}
      >
        {ordered.map((option, i) => {
          const optionId = `${shell.id}-${option.toLowerCase().replace(/_/g, '-')}`;
          const quiet = isUnasked(option);
          return (
            <label
              key={option}
              htmlFor={optionId}
              className={cn(
                'group relative flex min-h-10 cursor-pointer items-center gap-2 rounded-md border border-input bg-card px-3 text-sm motion-safe:transition-colors motion-safe:duration-150 hover:border-primary/60 has-[:checked]:border-primary has-[:checked]:bg-primary/10 has-[:checked]:font-medium has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60 [@media(pointer:coarse)]:min-h-11',
                quiet && 'border-dashed text-muted-foreground has-[:checked]:text-foreground',
              )}
            >
              <input
                id={optionId}
                type="radio"
                name={shell.id}
                value={option}
                checked={shown === option}
                onChange={() => pick(option)}
                disabled={shell.disabled}
                className="peer sr-only"
              />
              <span
                aria-hidden="true"
                className="grid size-4 shrink-0 place-items-center rounded-full border border-muted-foreground/60 peer-checked:border-primary"
              >
                <span className="size-2 rounded-full bg-primary opacity-0 group-has-[:checked]:opacity-100" />
              </span>
              {labels[option] ?? option}
              {i < 9 ? (
                <kbd
                  aria-hidden="true"
                  className="ml-1 hidden font-sans text-xs tabular-nums text-muted-foreground [@media(pointer:fine)]:inline"
                >
                  {i + 1}
                </kbd>
              ) : null}
            </label>
          );
        })}
      </div>
      <FieldError id={shell.id} message={shell.error} reserveSpace={shell.reserveErrorSpace} />
    </fieldset>
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
  useInterviewQuestion({
    id: shell.id,
    label: shell.label,
    answered: !isUnasked(value),
    display: labels[value] ?? value,
    invalid: Boolean(shell.error),
  });
  // Short vocabularies are read out and answered in one press; long ones stay a menu.
  const answerable = options.filter((option) => !isUnasked(option));
  if (answerable.length <= SEGMENTED_MAX) {
    return (
      <SegmentedChoice
        value={value}
        onChange={onChange}
        options={options}
        labels={labels}
        {...shell}
      />
    );
  }
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
        <SelectTrigger
          id={shell.id}
          {...fieldErrorProps(shell.id, shell.error)}
          aria-describedby={describedBy(shell)}
        >
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
  useInterviewQuestion({
    id: shell.id,
    label: shell.label,
    answered: value.length > 0,
    display: value.map((v) => labels[v] ?? v).join(', '),
    invalid: Boolean(shell.error),
  });
  // Where the trailing run of exclusive options starts (options.length when there is none).
  let tailStart = options.length;
  while (tailStart > 0 && (exclusive?.includes(options[tailStart - 1]) ?? false)) tailStart -= 1;
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
    <fieldset className="space-y-2" aria-describedby={describedBy({ ...shell, error: undefined })}>
      <legend
        className={cn('text-sm leading-none', shell.ask ? 'text-muted-foreground' : 'font-medium')}
      >
        {shell.label}
      </legend>
      <Ask id={shell.id} ask={shell.ask} />
      {shell.hint ? (
        <p id={`${shell.id}-hint`} className="text-sm text-muted-foreground">
          {shell.hint}
        </p>
      ) : null}
      <div
        id={shell.id}
        className={cn(
          'grid gap-x-4 gap-y-0.5',
          columns === 1 && 'grid-cols-1',
          columns === 2 && 'grid-cols-1 sm:grid-cols-2',
          columns === 3 && 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
        )}
      >
        {options.map((option, index) => {
          const optionId = `${shell.id}-${option.toLowerCase().replace(/_/g, '-')}`;
          return (
            <Fragment key={option}>
              {/* "None"/"Unsure" end the list; a rule sets them apart from the real options. */}
              {index > 0 && index === tailStart ? (
                <div aria-hidden className="col-span-full my-1 border-t border-rule" />
              ) : null}
              <div className="flex min-h-9 items-center gap-2 rounded-md px-2 hover:bg-muted/60 [@media(pointer:coarse)]:min-h-11">
                <Checkbox
                  id={optionId}
                  checked={value.includes(option)}
                  onCheckedChange={() => toggle(option)}
                  disabled={shell.disabled}
                />
                <Label
                  htmlFor={optionId}
                  className="flex-1 cursor-pointer self-stretch py-2 text-sm font-normal leading-5"
                >
                  {labels[option] ?? option}
                </Label>
              </div>
            </Fragment>
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
  decimal,
  ...shell
}: QuestionProps & {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Offer the decimal keypad, for a value such as mmol/L glucose that is not a whole number. */
  decimal?: boolean;
}) {
  useInterviewQuestion({
    id: shell.id,
    label: shell.label,
    answered: value.trim() !== '',
    display: value,
    invalid: Boolean(shell.error),
  });
  return (
    <QuestionShell {...shell}>
      <Input
        id={shell.id}
        inputMode={decimal ? 'decimal' : 'numeric'}
        autoComplete="off"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        disabled={shell.disabled}
        {...fieldErrorProps(shell.id, shell.error)}
        aria-describedby={describedBy(shell)}
      />
    </QuestionShell>
  );
}

/**
 * A calendar date, for "when did that happen".
 *
 * `max` is set to today by callers recording something that already happened, because a screening
 * completed next week is a typo rather than an answer.
 */
export function DateQuestion({
  value,
  onChange,
  max,
  ...shell
}: QuestionProps & {
  value: string;
  onChange: (value: string) => void;
  max?: string;
}) {
  useInterviewQuestion({
    id: shell.id,
    label: shell.label,
    answered: value.trim() !== '',
    display: value,
    invalid: Boolean(shell.error),
  });
  return (
    <QuestionShell {...shell}>
      <Input
        id={shell.id}
        type="date"
        max={max}
        autoComplete="off"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={shell.disabled}
        {...fieldErrorProps(shell.id, shell.error)}
        aria-describedby={describedBy(shell)}
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
  useInterviewQuestion({
    id: shell.id,
    label: shell.label,
    answered: value.trim() !== '',
    display: value,
    invalid: Boolean(shell.error),
  });
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
        aria-describedby={describedBy(shell)}
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
