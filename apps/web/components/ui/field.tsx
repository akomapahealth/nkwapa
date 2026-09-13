'use client';

import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/**
 * The shared pieces of the clinical form contract in MASTER.md section 10.
 *
 * `FieldError` existed before this, privately, inside VitalsForm. It was the only field error in
 * the product wired to `role="alert"`; every other form re-implemented a bare
 * `<p className="text-sm text-destructive">` that no screen reader announced. One copy, exported.
 */

/** The id convention that ties a control's `aria-describedby` to its message. */
export const fieldErrorId = (fieldId: string) => `${fieldId}-error`;

export function FieldError({
  id,
  message,
  className,
  reserveSpace = false,
}: {
  /** The field's own id. The message element gets `${id}-error`. */
  id: string;
  message?: string;
  className?: string;
  /**
   * Hold one line of vertical space whether or not there is a message.
   *
   * Pass the form's "has been submitted at least once" flag, not a constant. The shift this
   * prevents is not the one at submit -- that one happens once, and `focusFirstInvalid` takes the
   * user to it. It is the shift *afterwards*: MASTER.md section 10 revalidates each field as it is
   * corrected, so fixing one field removes its message and pulls every field below it upwards,
   * including the one the user was reaching for. On a sixty-field interview that happens once per
   * correction.
   *
   * Reserving unconditionally would instead add a blank line under every field of every form,
   * which on the same sixty-field interview is about a screen and a half of dead space a user has
   * to scroll past before any error exists. Gating on submitted-once costs nothing until the first
   * failed submit and then holds the layout still for the whole correction pass.
   *
   * One line is reserved, matching `leading-5`. A message that wraps to two lines still shifts;
   * that is rare enough, and reserving two lines everywhere is the dead-space problem again.
   */
  reserveSpace?: boolean;
}) {
  if (!message && !reserveSpace) return null;
  /*
    Rendered even when empty, rather than mounted when the message arrives.

    A `role="alert"` element that is already in the document is a live region the browser is
    watching, so inserting text into it announces reliably. Assistive technology is less consistent
    about announcing an alert node that appears and carries its text in the same paint.
  */
  return (
    <p
      id={fieldErrorId(id)}
      role="alert"
      className={cn('text-sm leading-5 text-destructive', reserveSpace && 'min-h-5', className)}
    >
      {message}
    </p>
  );
}

/** Props a control needs so its error is announced and styled. Spread onto the input. */
export function fieldErrorProps(id: string, message?: string) {
  return {
    'aria-invalid': message ? (true as const) : undefined,
    'aria-describedby': message ? fieldErrorId(id) : undefined,
  };
}

/**
 * A required field's label, with the marker rendered *outside* the labelling element.
 *
 * That placement is the point. The control itself carries `required`, which is what assistive
 * technology announces; the asterisk is a visual shorthand and nothing more. Putting it inside
 * the `<label>` makes it part of the label's text either way -- `aria-hidden` does not remove it
 * from `textContent`, so the field's accessible name became "First name*" and every
 * `getByLabel('First name')` in the E2E suite either missed it or matched some other control
 * whose help text mentioned the same words.
 *
 * Mark what is required, not what is optional: on these forms most fields are optional, and
 * annotating the majority is noise. Pair this with one `<RequiredLegend />` per form, because an
 * asterisk with nothing explaining it is a convention the reader has to already know.
 */
export function FieldLabel({
  htmlFor,
  required = false,
  className,
  children,
}: {
  htmlFor: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-baseline gap-0.5">
      <Label htmlFor={htmlFor} className={className}>
        {children}
      </Label>
      {required ? <RequiredMark /> : null}
    </span>
  );
}

export function RequiredMark() {
  return (
    <span aria-hidden="true" className="text-destructive">
      *
    </span>
  );
}

export function RequiredLegend({ className }: { className?: string }) {
  return (
    <p className={cn('text-sm text-muted-foreground', className)}>
      Fields marked <span className="text-destructive">*</span> are required.
    </p>
  );
}

/**
 * Moves focus to the first control that failed validation.
 *
 * No form in the product did this. On a long form -- VitalsForm is eleven fields across four
 * sections -- a submit that fails silently leaves a keyboard or screen-reader user at the button,
 * with the reason somewhere above them and nothing saying where.
 *
 * `order` matters: iterating the error object gives insertion order, which is the order the
 * validator happened to run, not the order the fields appear on screen.
 */
export function focusFirstInvalid(errors: Record<string, string | undefined>, order?: string[]) {
  if (typeof document === 'undefined') return;
  const ids = order ?? Object.keys(errors);
  for (const id of ids) {
    if (!errors[id]) continue;
    const element = document.getElementById(id);
    if (element) {
      element.focus({ preventScroll: false });
      return;
    }
  }
}
