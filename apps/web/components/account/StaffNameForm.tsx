'use client';

import { useState } from 'react';
import { WifiOff } from 'lucide-react';
import { normalizeMiddleInitial } from '@nkwapa/db/staff-name';
import {
  STAFF_NAME_FIELDS,
  previewStaffName,
  staffNameErrorsFrom,
  validateStaffName,
  type StaffNameErrors,
  type StaffNameField,
  type StaffNameInput,
} from '@/lib/account-name';
import { getErrorMessage } from '@/lib/api';
import { useSync } from '@/app/ServiceWorkerAndSyncProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  FieldError,
  FieldLabel,
  RequiredLegend,
  fieldErrorProps,
  focusFirstInvalid,
} from '@/components/ui/field';
import { InlineNotice } from '@/components/feedback/InlineNotice';
import { cn } from '@/lib/utils';

/**
 * First name, middle initial and last name, as one controlled group.
 *
 * Shared by the name step, the admin correction dialog and the invite form, so all three label,
 * autofill and explain errors the same way. One column on a phone; on wider screens the initial
 * sits narrow between the two names, the order people write them in.
 */
export function StaffNameFields({
  idPrefix,
  value,
  onChange,
  errors,
  required = true,
  autoFocus = false,
  reserveErrorSpace = false,
  disabled = false,
}: {
  idPrefix: string;
  value: StaffNameInput;
  onChange: (next: StaffNameInput, changed: StaffNameField) => void;
  errors: StaffNameErrors;
  /** False on the invite form, where the inviter may leave the name blank. */
  required?: boolean;
  autoFocus?: boolean;
  reserveErrorSpace?: boolean;
  disabled?: boolean;
}) {
  const id = (field: StaffNameField) => `${idPrefix}-${field}`;
  const set = (field: StaffNameField, next: string) => onChange({ ...value, [field]: next }, field);

  const field = (
    name: StaffNameField,
    label: string,
    autoComplete: string,
    extra: React.ComponentProps<typeof Input> = {},
  ) => (
    <div className="space-y-2">
      <FieldLabel htmlFor={id(name)} required={required && name !== 'middleInitial'}>
        {label}
      </FieldLabel>
      <Input
        id={id(name)}
        name={name}
        value={value[name]}
        onChange={(event) => set(name, event.target.value)}
        autoComplete={autoComplete}
        autoCapitalize="words"
        spellCheck={false}
        required={required && name !== 'middleInitial'}
        disabled={disabled}
        className="h-12 text-base md:text-base"
        {...fieldErrorProps(id(name), errors[name])}
        {...extra}
      />
      <FieldError id={id(name)} message={errors[name]} reserveSpace={reserveErrorSpace} />
    </div>
  );

  return (
    <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_6.5rem_minmax(0,1fr)] sm:items-start">
      {field('firstName', 'First name', 'given-name', { autoFocus, maxLength: 120 })}
      {field('middleInitial', 'Middle initial', 'additional-name', {
        maxLength: 2,
        placeholder: 'Optional',
        onBlur: () => set('middleInitial', normalizeMiddleInitial(value.middleInitial) ?? ''),
      })}
      {field('lastName', 'Last name', 'family-name', { maxLength: 120 })}
    </div>
  );
}

/**
 * The whole name form: fields, a live preview of how the name will show, inline errors, and a
 * submit that keeps the input on failure. The caller decides what saving means.
 */
export function StaffNameForm({
  idPrefix,
  initial,
  email,
  onSubmit,
  submitLabel = 'Save name',
  secondaryAction,
  className,
}: {
  idPrefix: string;
  initial: StaffNameInput;
  /** The account's email, which a name may not repeat. */
  email?: string | null;
  onSubmit: (value: StaffNameInput) => Promise<void>;
  submitLabel?: string;
  secondaryAction?: React.ReactNode;
  className?: string;
}) {
  const { isOnline } = useSync();
  const [value, setValue] = useState(initial);
  const [errors, setErrors] = useState<StaffNameErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const preview = previewStaffName(value);
  const order = STAFF_NAME_FIELDS.map((field) => `${idPrefix}-${field}`);

  const focusErrors = (next: StaffNameErrors) =>
    focusFirstInvalid(
      Object.fromEntries(
        Object.entries(next).map(([field, message]) => [`${idPrefix}-${field}`, message]),
      ),
      order,
    );

  const handleChange = (next: StaffNameInput) => {
    setValue(next);
    // Revalidate as they correct, once a submit has shown them what is wrong.
    if (submitted) setErrors(validateStaffName(next, { email }));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    setFailure(null);
    const nextErrors = validateStaffName(value, { email });
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      focusErrors(nextErrors);
      return;
    }
    setSaving(true);
    try {
      await onSubmit(value);
    } catch (error) {
      const serverErrors = staffNameErrorsFrom(error);
      if (Object.keys(serverErrors).length > 0) {
        setErrors(serverErrors);
        focusErrors(serverErrors);
      } else {
        setFailure(getErrorMessage(error, 'Your name could not be saved. Try again.'));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      noValidate
      onSubmit={(event) => void submit(event)}
      className={cn('space-y-5', className)}
    >
      {!isOnline ? (
        <InlineNotice tone="warning">
          <span className="inline-flex items-center gap-2 font-medium">
            <WifiOff className="h-4 w-4" aria-hidden="true" />
            You&apos;re offline.
          </span>{' '}
          Saving your name needs a connection. Your typing is kept; save once you&apos;re back
          online.
        </InlineNotice>
      ) : null}
      {failure ? <InlineNotice tone="error">{failure}</InlineNotice> : null}

      <StaffNameFields
        idPrefix={idPrefix}
        value={value}
        onChange={handleChange}
        errors={errors}
        autoFocus
        reserveErrorSpace={submitted}
        disabled={saving}
      />

      <div
        className="rounded-lg border border-dashed border-border bg-muted/40 px-4 py-3 text-sm"
        aria-live="polite"
      >
        <span className="text-muted-foreground">Shows on records as </span>
        <span className="font-semibold text-foreground">{preview ?? '…'}</span>
      </div>

      <RequiredLegend />

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
        {secondaryAction}
        <Button
          type="submit"
          size="lg"
          className="w-full sm:w-auto"
          disabled={saving || !isOnline}
          aria-busy={saving}
        >
          {saving ? 'Saving…' : submitLabel}
        </Button>
      </div>
    </form>
  );
}
