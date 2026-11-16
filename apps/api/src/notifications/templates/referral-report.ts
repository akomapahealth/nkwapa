import { renderLayout, renderText, type LayoutInput } from './layout';
import type { RenderedMessage } from './types';

/**
 * The cover note that carries a referral report (#344).
 *
 * It names the clinic and nothing about the patient: no name, no condition, no reason. The note is
 * read in inboxes, previews and mail logs the report itself is locked against, and the passcode
 * goes by another route, so a misdirected email shows a stranger only that a clinic sent a file.
 *
 * Sent at once rather than through the reminder ledger: the ledger stores payloads, and the report
 * is never stored.
 */
export function renderReferralEmail(input: {
  clinicName: string;
  recipientName: string | null;
}): RenderedMessage {
  const layout: LayoutInput = {
    preheader: `${input.clinicName} has sent you a referral report.`,
    heading: 'A referral report for you',
    clinicName: input.clinicName,
    paragraphs: [
      input.recipientName ? `Hello ${input.recipientName},` : 'Hello,',
      `${input.clinicName} has sent you a referral report about a patient. It is attached to this email as a PDF.`,
      'The PDF is locked with a passcode. The clinician who referred the patient will give you the passcode separately, by phone or text message. It is not in this email.',
    ],
    footnotes: [
      'If you were not expecting this report, delete this email and let the clinic know. Without the passcode the file cannot be opened.',
    ],
  };
  return {
    subject: `Referral report from ${input.clinicName}`,
    html: renderLayout(layout),
    text: renderText(layout),
  };
}
