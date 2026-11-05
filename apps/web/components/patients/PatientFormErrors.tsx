'use client';

import { useState, type FormEvent } from 'react';

interface NativeFieldError {
  id: string;
  label: string;
  message: string;
}

/** Present browser constraint failures without replacing or relaxing native validation. */
export function usePatientFormErrors() {
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState<NativeFieldError[]>([]);
  const readErrors = (form: HTMLFormElement) =>
    Array.from(form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea'))
      .filter((field) => field.id && field.willValidate && !field.validity.valid)
      .map((field) => ({
        id: field.id,
        label: field.labels?.[0]?.textContent?.trim() || field.id,
        message: field.validationMessage,
      }));
  return {
    errors,
    submitted,
    clear: (id?: string) => {
      if (!id) setSubmitted(false);
      setErrors((current) => (id ? current.filter((error) => error.id !== id) : []));
    },
    onInvalidCapture: (event: FormEvent<HTMLFormElement>) => {
      setSubmitted(true);
      setErrors(readErrors(event.currentTarget));
    },
    onChange: (event: FormEvent<HTMLFormElement>) => {
      const field = event.target;
      if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) return;
      if (!errors.some((error) => error.id === field.id)) return;
      // The form's bubbling change runs after the control's own onChange. Capture-phase
      // state changes can restore an old controlled value before that handler reads it.
      const id = field.id;
      const message = field.validity.valid ? undefined : field.validationMessage;
      setErrors((current) =>
        current.flatMap((error) => {
          if (error.id !== id) return [error];
          return message ? [{ ...error, message }] : [];
        }),
      );
    },
    fieldProps: (id: string) => ({
      'aria-invalid': errors.some((error) => error.id === id) || undefined,
      'aria-describedby': errors.some((error) => error.id === id) ? `${id}-error` : undefined,
    }),
    fieldMessage: (id: string) => errors.find((error) => error.id === id)?.message,
  };
}

export function PatientFormErrors({
  errors = [],
  message,
}: {
  errors?: NativeFieldError[];
  message?: string | null;
}) {
  if (!errors.length && !message) return null;
  return (
    <section
      role="alert"
      aria-label="Unable to save"
      className="border-y border-destructive py-4 text-sm"
    >
      <h2 className="font-body font-semibold text-destructive">Check before saving</h2>
      {message ? <p className="mt-2">{message}</p> : null}
      {errors.length ? (
        <ul className="mt-2 space-y-1">
          {errors.map(({ id, label, message: detail }) => (
            <li key={id}>
              <a
                href={`#${id}`}
                className="inline-flex min-h-11 items-center text-primary underline underline-offset-4"
                onClick={(event) => {
                  event.preventDefault();
                  document.getElementById(id)?.focus();
                }}
              >
                {label}: {detail}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
