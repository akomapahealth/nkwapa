import type { EmailTemplate, RenderedMessage } from './types';
import { APPOINTMENT_REMINDER_V1 } from './appointment-reminder';
import { FOLLOWUP_REMINDER_V1 } from './followup-reminder';
import { PORTAL_INVITE_V1 } from './portal-invite';

/**
 * Every message the app can send, keyed by the value stored in `Reminder.templateKey`.
 *
 * These are TypeScript modules rather than `.html` files on purpose. The previous
 * templates were read with `readFileSync` from `__dirname/templates`, and `nest build`
 * never copied them into `dist`, so every production email silently fell back to a
 * one-line stub inside a `catch`. Compiled modules cannot go missing.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const EMAIL_TEMPLATES: Record<string, EmailTemplate<any>> = {
  [FOLLOWUP_REMINDER_V1.key]: FOLLOWUP_REMINDER_V1,
  [APPOINTMENT_REMINDER_V1.key]: APPOINTMENT_REMINDER_V1,
  [PORTAL_INVITE_V1.key]: PORTAL_INVITE_V1,
};

export type TemplateKey = keyof typeof EMAIL_TEMPLATES;

/** The scheduled reminders a patient sees in their own portal feed. */
export const PATIENT_REMINDER_TEMPLATE_KEYS = [
  FOLLOWUP_REMINDER_V1.key,
  APPOINTMENT_REMINDER_V1.key,
] as const;

/** The 24-hour appointment reminder, the only template the schedule's counts summarise. */
export const APPOINTMENT_REMINDER_TEMPLATE_KEY = APPOINTMENT_REMINDER_V1.key;

export function isTemplateKey(key: string): boolean {
  return Object.prototype.hasOwnProperty.call(EMAIL_TEMPLATES, key);
}

export class UnknownTemplateError extends Error {
  constructor(readonly templateKey: string) {
    super(`Unsupported message template: ${templateKey}`);
    this.name = 'UnknownTemplateError';
  }
}

export function renderMessage(
  templateKey: string,
  payload: Record<string, unknown>,
): RenderedMessage {
  const template = EMAIL_TEMPLATES[templateKey];
  if (!template) {
    throw new UnknownTemplateError(templateKey);
  }
  return template.render(template.parse(payload));
}

export * from './types';
