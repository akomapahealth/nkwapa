/**
 * Why a portal claim was refused, in words the patient reading them can act on.
 *
 * Claiming a record is the one identity workflow a patient drives themselves, with no staff
 * member beside them to interpret an error. Every refusal here is therefore two things: what
 * happened, and what to do about it. A patient who is told only that something did not work has
 * no move except to give up or call the clinic, and the clinic cannot see what they saw.
 *
 * The same shape the merge findings already use in `patient-merge.ts`, for the same reason:
 * keeping the wording beside the codes stops a screen inventing its own phrasing for a state the
 * API named, and lets the operator QA matrix quote both without copying either.
 *
 * Nothing here talks to a database. It is importable from a browser bundle.
 */

/** Every way a claim can be turned away. */
export const CLAIM_REFUSAL_CODES = [
  'ACCOUNT_INACTIVE',
  'INVITE_NOT_FOUND',
  'INVITE_EXPIRED',
  'INVITE_CANCELLED',
  'INVITE_ALREADY_USED',
  'RECORD_MERGED',
  'CONTACT_MISMATCH',
  'PATIENT_CODE_MISMATCH',
  'DATE_OF_BIRTH_MISSING',
  'DATE_OF_BIRTH_MISMATCH',
  'ACCOUNT_ALREADY_LINKED',
  'RECORD_ALREADY_LINKED',
] as const;

export type ClaimRefusalCode = (typeof CLAIM_REFUSAL_CODES)[number];

/**
 * What happened, addressed to the patient.
 *
 * No system vocabulary, and no detail that would tell someone holding a stolen invitation
 * anything they did not already have. The contact mismatch in particular says an address does not
 * match without naming the address the clinic staged.
 */
export const CLAIM_REFUSAL_LABELS: Record<ClaimRefusalCode, string> = {
  ACCOUNT_INACTIVE: 'We could not find an active account for this sign-in.',
  INVITE_NOT_FOUND: 'This invitation link does not match an invitation we hold.',
  INVITE_EXPIRED: 'This invitation has expired.',
  INVITE_CANCELLED: 'This invitation was cancelled by the clinic.',
  INVITE_ALREADY_USED: 'This invitation has already been used.',
  RECORD_MERGED: 'This record has been combined into another one.',
  CONTACT_MISMATCH: 'This invitation was sent to a different email address or phone number.',
  PATIENT_CODE_MISMATCH: 'Patient code does not match this invitation.',
  DATE_OF_BIRTH_MISSING: 'This record has no date of birth on file, so it cannot be claimed yet.',
  DATE_OF_BIRTH_MISMATCH: 'Date of birth does not match this invitation.',
  ACCOUNT_ALREADY_LINKED: 'This sign-in is already connected to a different patient record.',
  RECORD_ALREADY_LINKED: 'This record is already connected to a different sign-in.',
};

/**
 * What to do next.
 *
 * Every one of these names an action the patient can take on their own, or the one sentence they
 * should say to the clinic. None of them is "try again", because none of these states changes on
 * a retry.
 */
export const CLAIM_REFUSAL_RECOVERY: Record<ClaimRefusalCode, string> = {
  ACCOUNT_INACTIVE: 'Ask the clinic to reactivate your account, then sign in again.',
  INVITE_NOT_FOUND:
    'Open the link from the clinic’s message again, or ask them to send a new invitation.',
  INVITE_EXPIRED: 'Ask the clinic to send you a new invitation.',
  INVITE_CANCELLED: 'Ask the clinic to send you a new invitation.',
  INVITE_ALREADY_USED:
    'If you have not used it yourself, tell the clinic before you sign in again.',
  RECORD_MERGED: 'Ask the clinic for a new invitation to the record they are using now.',
  CONTACT_MISMATCH:
    'Sign in with the account the clinic sent it to, or ask them to send it to this one instead.',
  PATIENT_CODE_MISMATCH:
    'Check the code on your patient card or in the clinic’s message, then enter it again.',
  DATE_OF_BIRTH_MISSING: 'Ask clinic staff to add your date of birth to your record first.',
  DATE_OF_BIRTH_MISMATCH:
    'Enter your date of birth as the clinic recorded it, or ask them to correct it.',
  ACCOUNT_ALREADY_LINKED:
    'Sign out and use the account the clinic invited, or ask them to move the invitation.',
  RECORD_ALREADY_LINKED:
    'Ask the clinic to confirm which sign-in should reach this record before trying again.',
};

/** A refusal, in the shape `ApiExceptionFilter` turns into a coded error body. */
export interface ClaimRefusal {
  code: ClaimRefusalCode;
  message: string;
  recoveryAction: string;
}

/**
 * Build a refusal, taking its wording from the tables above rather than from a call site.
 *
 * `detail` is added as a second sentence when there is something worth adding. It is never a
 * substitute for the recovery: the detail says more about what happened, not about what to do.
 */
export function claimRefusal(code: ClaimRefusalCode, detail?: string): ClaimRefusal {
  const label = CLAIM_REFUSAL_LABELS[code];
  return {
    code,
    message: detail ? `${label.replace(/\.$/, '')}. ${detail}` : label,
    recoveryAction: CLAIM_REFUSAL_RECOVERY[code],
  };
}

/**
 * A lapsed invitation, named by the date it lapsed.
 *
 * "It expired" and "it expired three months ago" lead a patient to different conclusions about
 * whether the clinic already knows, so the date replaces the generic wording rather than being
 * appended to it. An invitation whose expiry instant was never recorded is not expired at all,
 * which is why this takes a date rather than an optional one -- the undated refusal is
 * `claimRefusal('INVITE_EXPIRED')`, for a row a sweep has already settled.
 */
export function expiredInviteRefusal(formattedExpiryDate: string): ClaimRefusal {
  return {
    code: 'INVITE_EXPIRED',
    message: `This invitation expired on ${formattedExpiryDate}.`,
    recoveryAction: CLAIM_REFUSAL_RECOVERY.INVITE_EXPIRED,
  };
}
