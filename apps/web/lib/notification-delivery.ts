/**
 * Presentation rules for the outbound message ledger.
 *
 * Extracted from the pages rather than left inline for two reasons: the reminders page
 * and the appointments schedule had drifted into two different renderings of the same
 * failure codes, and web unit tests run in a node environment with no DOM, so logic
 * only gets covered once it lives outside a component.
 */

export type DeliveryStatus = 'QUEUED' | 'SENT' | 'DELIVERED' | 'FAILED' | string;
export type DeliveryChannel = 'SMS' | 'EMAIL' | string;

export type BadgeTone = 'finalized' | 'secondary' | 'destructive' | 'draft' | 'warning';

export function getStatusVariant(status: DeliveryStatus): BadgeTone {
  if (status === 'DELIVERED') return 'finalized';
  if (status === 'SENT') return 'secondary';
  if (status === 'FAILED') return 'destructive';
  return 'draft';
}

export interface FailureExplanation {
  /** Short label for a chip or table cell. */
  label: string;
  /** What actually happened, in the operator's terms. */
  detail: string;
  /** What to do about it, or null when there is nothing the operator can do. */
  recovery: string | null;
}

const FAILURE_EXPLANATIONS: Record<string, FailureExplanation> = {
  NO_CONTACT_METHOD: {
    label: 'No contact details',
    detail: 'This person has no phone number or email address on record.',
    recovery: 'Add a contact method to the record, then try again.',
  },
  EMAIL_NOT_CONFIGURED: {
    label: 'Email not configured',
    detail: 'The server is set to send real email but the SMTP settings are incomplete.',
    recovery: 'Ask an administrator to finish the SMTP configuration.',
  },
  EMAIL_CHANNEL_UNAVAILABLE: {
    label: 'Email unavailable',
    detail: 'No email provider was available when this message was due to send.',
    recovery: 'Ask an administrator to check the email configuration.',
  },
  EMAIL_SEND_FAILED: {
    label: 'Email rejected',
    detail: 'The mail server refused this message.',
    recovery: 'Check the address is correct, then resend.',
  },
  QUEUE_UNAVAILABLE: {
    label: 'Queue unavailable',
    detail: 'The message was recorded but could not be queued for sending.',
    recovery: 'Ask an administrator to check the background queue, then resend.',
  },
  TEMPLATE_NOT_FOUND: {
    label: 'Template missing',
    detail: 'This message refers to a template that no longer exists.',
    recovery: 'Report this to an administrator; the message cannot be sent as it stands.',
  },
  SEND_FAILED: {
    label: 'Send failed',
    detail: 'The provider rejected this message without a specific reason.',
    recovery: 'Try resending; if it keeps failing, check the recipient details.',
  },
  DELIVERY_FAILED: {
    label: 'Not delivered',
    detail: 'The provider accepted this message but could not deliver it.',
    recovery: 'Check the recipient details are still correct.',
  },
  APPOINTMENT_NOT_FOUND: {
    label: 'Appointment removed',
    detail: 'The appointment this reminder belonged to no longer exists.',
    recovery: null,
  },
  APPOINTMENT_NOT_CONFIRMED: {
    label: 'Appointment not confirmed',
    detail: 'The appointment was no longer confirmed when the reminder was due.',
    recovery: null,
  },
  APPOINTMENT_RESCHEDULED: {
    label: 'Appointment moved',
    detail: 'The appointment moved, so this reminder was replaced by a new one.',
    recovery: null,
  },
  APPOINTMENT_CANCELLED: {
    label: 'Appointment cancelled',
    detail: 'The appointment was cancelled before this reminder was due.',
    recovery: null,
  },
  APPOINTMENT_COMPLETED: {
    label: 'Appointment completed',
    detail: 'The appointment had already happened when this reminder was due.',
    recovery: null,
  },
  APPOINTMENT_NO_SHOW: {
    label: 'Marked no-show',
    detail: 'The appointment was marked a no-show before this reminder was due.',
    recovery: null,
  },
};

/**
 * Explain a stored failure code.
 *
 * Codes are stored as `CODE` or `CODE:detail` (a Twilio error number, an appointment
 * status, a template key). Only the part before the colon is meaningful to an operator.
 */
export function explainFailure(reason: string | null | undefined): FailureExplanation | null {
  if (!reason) return null;
  const code = reason.split(':')[0];
  return (
    FAILURE_EXPLANATIONS[code] ?? {
      label: humanizeCode(code),
      detail: 'This message could not be sent.',
      recovery: 'Try again, or report this if it keeps happening.',
    }
  );
}

/** Short label only, for table cells and chips. */
export function formatFailureReason(reason: string | null | undefined): string {
  return explainFailure(reason)?.label ?? '';
}

function humanizeCode(code: string): string {
  return code
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/^\w/, (letter) => letter.toUpperCase());
}

const TYPE_LABELS: Record<string, string> = {
  FOLLOWUP_REMINDER_V1: 'Follow-up reminder',
  APPOINTMENT_REMINDER_V1: 'Appointment reminder',
  PORTAL_INVITE_V1: 'Portal invite',
  APPOINTMENT_CONFIRMED_V1: 'Appointment confirmed',
  APPOINTMENT_RESCHEDULED_V1: 'Appointment moved',
  APPOINTMENT_CANCELLED_V1: 'Appointment cancelled',
  STAFF_ROLE_GRANTED_V1: 'Access granted',
  STAFF_ROLE_REVOKED_V1: 'Access removed',
  STAFF_ACCOUNT_DEACTIVATED_V1: 'Account deactivated',
};

export function formatTemplateLabel(templateKey: string): string {
  return TYPE_LABELS[templateKey] ?? humanizeCode(templateKey.replace(/_V\d+$/, ''));
}

export const NOTIFICATION_TYPE_FILTERS = [
  { value: 'REMINDER', label: 'Reminders' },
  { value: 'INVITE', label: 'Portal invites' },
  { value: 'APPOINTMENT_UPDATE', label: 'Appointment updates' },
  { value: 'STAFF', label: 'Staff access' },
] as const;

/**
 * Why a delivered status may never appear for a channel.
 *
 * SMS reaches DELIVERED through a provider callback. SMTP has no equivalent, so an
 * email that was accepted stops at SENT forever. Saying so is the difference between
 * an operator trusting the column and quietly assuming email is broken.
 */
export function explainTerminalStatus(channel: DeliveryChannel): string | null {
  return channel === 'EMAIL'
    ? 'Email stops at Sent: the mail server confirms it accepted the message, but there is no delivery receipt after that.'
    : null;
}

export interface EmailAvailability {
  available: boolean;
  readiness: 'fake' | 'smtp' | 'unconfigured' | string;
  missingVars: string[];
  fromAddress: string | null;
}

export interface EmailAvailabilityNotice {
  tone: 'warning' | 'info';
  title: string;
  detail: string;
}

/**
 * Turn the email status endpoint into something worth showing an operator.
 *
 * Returns null when email is genuinely working, so a healthy deployment shows no
 * banner at all.
 */
export function describeEmailAvailability(
  status: EmailAvailability | null,
): EmailAvailabilityNotice | null {
  if (!status) return null;

  if (status.readiness === 'fake') {
    return {
      tone: 'info',
      title: 'Email is in test mode',
      detail:
        'Messages are recorded and logged but not delivered to real inboxes. This is the expected setup outside production.',
    };
  }

  if (!status.available) {
    const missing = status.missingVars.length
      ? ` Missing settings: ${status.missingVars.join(', ')}.`
      : '';
    return {
      tone: 'warning',
      title: 'Email cannot be sent',
      detail: `This server is set to send real email but the configuration is incomplete, so invites and email reminders will be recorded as failed.${missing} Ask an administrator to complete the SMTP settings.`,
    };
  }

  return null;
}
