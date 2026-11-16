/**
 * Consent text for v1 (English-only) - RESEARCH_DEIDENTIFIED.
 * Must be persisted exactly as consent_text_snapshot.
 */
export const CONSENT_TEXT_V1_EN = `Research Consent – De-identified Data Use

By signing below, you confirm that you understand and agree to the following:

• Your personal information (name, date of birth, contact details) will NOT be used in research. Only de-identified health data may be used.

• Any data used for research will be anonymized so that you cannot be identified.

• You may refuse consent without affecting your care in any way.

• You may revoke this consent at any time by informing clinic staff.`;

/**
 * Consent text for v1 (English-only) - REFERRAL_SHARING (#344). Separate from research consent:
 * a referral sends a named record, so a patient can agree to one and refuse the other.
 * Must be persisted exactly as consent_text_snapshot.
 */
export const REFERRAL_CONSENT_TEXT_V1_EN = `Referral Consent – Sharing Your Record

By agreeing, you confirm that you understand and agree to the following:

• When clinic staff refer you to another clinician or facility for further care, they may send them a report from your record. It can include your name, date of birth, contact details, health history, readings, medicines and care plan.

• The report is sent only for your care, only to the clinician or facility you are referred to, and it is locked with a passcode.

• Every report sent is recorded, including who sent it and where it went.

• You may refuse without affecting your care at this clinic in any way.

• You may withdraw this consent at any time by informing clinic staff. Reports already sent cannot be recalled.`;

export type ConsentDocumentType = 'RESEARCH_DEIDENTIFIED' | 'REFERRAL_SHARING';

/** What each consent is called and says, for the recording screen and the chart's Consent tab. */
export const CONSENT_DOCUMENTS: Record<
  ConsentDocumentType,
  {
    name: string;
    text: string;
    summary: string;
    help: string;
    granted: string;
    revokeDescription: string;
  }
> = {
  RESEARCH_DEIDENTIFIED: {
    name: 'Research consent',
    text: CONSENT_TEXT_V1_EN,
    summary: 'De-identified research',
    help: 'Consent covers de-identified research use only, it is recorded against this clinic, and the patient may withdraw it later.',
    granted: "De-identified data from this patient's visits can be used in research exports.",
    revokeDescription:
      'This patient will be left out of every research export built from now on. Record it only when the patient has asked to withdraw. Consent can be recorded again later, but exports already released are not recalled.',
  },
  REFERRAL_SHARING: {
    name: 'Referral consent',
    text: REFERRAL_CONSENT_TEXT_V1_EN,
    summary: 'Sharing a named record for referral',
    help: 'Consent covers sending a locked report from this record to a clinician or facility the patient is referred to. It is recorded against this clinic, and the patient may withdraw it later.',
    granted:
      'Referral reports can be sent without asking again each time. Each one is still recorded.',
    revokeDescription:
      'Each referral report will need the patient’s agreement on the day again. Reports already sent are not recalled.',
  },
};

export const CONSENT_DOCUMENT_TYPES = Object.keys(CONSENT_DOCUMENTS) as ConsentDocumentType[];

/** The consent a recording link asks for; anything unknown is research, the original screen. */
export function consentDocumentType(value: string | null | undefined): ConsentDocumentType {
  return value === 'REFERRAL_SHARING' ? 'REFERRAL_SHARING' : 'RESEARCH_DEIDENTIFIED';
}
