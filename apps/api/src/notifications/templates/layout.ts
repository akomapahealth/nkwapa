import { escapeHtml } from './partials';

export interface DetailRow {
  label: string;
  value: string;
}

export interface CallToAction {
  label: string;
  url: string;
}

export interface LayoutInput {
  /** Shown in the mail client's preview line, before the body is opened. */
  preheader: string;
  heading: string;
  /** Leading sentences. Plain strings; escaped here, never by the caller. */
  paragraphs: string[];
  details?: DetailRow[];
  callToAction?: CallToAction;
  /** Closing sentences, after any details or button. */
  footnotes?: string[];
  clinicName: string;
}

const BRAND = '#0f766e';
const INK = '#111827';
const MUTED = '#4b5563';
const BORDER = '#e5e7eb';
const SURFACE = '#f9fafb';

/**
 * The single branded shell every message renders through.
 *
 * Table-based with inline styles on purpose: Outlook and most webmail clients strip
 * `<style>` blocks and have no grid or flex support, so the layout rules that work in
 * the web app are exactly the ones that fail here.
 */
export function renderLayout(input: LayoutInput): string {
  const paragraphs = input.paragraphs
    .map(
      (text) =>
        `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:${INK}">${escapeHtml(text)}</p>`,
    )
    .join('');

  const details = input.details?.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 24px;border:1px solid ${BORDER};border-radius:8px;background:${SURFACE}">
${input.details
  .map(
    (row, index) =>
      `<tr><td style="padding:12px 16px;font-size:14px;color:${MUTED};${index > 0 ? `border-top:1px solid ${BORDER};` : ''}width:45%">${escapeHtml(row.label)}</td><td style="padding:12px 16px;font-size:14px;font-weight:600;color:${INK};${index > 0 ? `border-top:1px solid ${BORDER};` : ''}">${escapeHtml(row.value)}</td></tr>`,
  )
  .join('\n')}
</table>`
    : '';

  const callToAction = input.callToAction
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px"><tr><td style="border-radius:8px;background:${BRAND}"><a href="${escapeHtml(input.callToAction.url)}" style="display:inline-block;padding:12px 24px;font-size:16px;font-weight:600;color:#ffffff;text-decoration:none">${escapeHtml(input.callToAction.label)}</a></td></tr></table>`
    : '';

  const footnotes = (input.footnotes ?? [])
    .map(
      (text) =>
        `<p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:${MUTED}">${escapeHtml(text)}</p>`,
    )
    .join('');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(input.heading)}</title>
  </head>
  <body style="margin:0;padding:0;background:${SURFACE};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif">
    <span style="display:none!important;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden">${escapeHtml(input.preheader)}</span>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${SURFACE}">
      <tr>
        <td align="center" style="padding:24px 12px">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;background:#ffffff;border:1px solid ${BORDER};border-radius:12px">
            <tr>
              <td style="padding:24px 28px 0">
                <p style="margin:0 0 24px;font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${BRAND}">${escapeHtml(input.clinicName)}</p>
                <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:${INK}">${escapeHtml(input.heading)}</h1>
                ${paragraphs}
                ${details}
                ${callToAction}
                ${footnotes}
              </td>
            </tr>
            <tr>
              <td style="padding:0 28px 24px">
                <p style="margin:24px 0 0;padding-top:16px;border-top:1px solid ${BORDER};font-size:12px;line-height:1.6;color:${MUTED}">
                  This message was sent by ${escapeHtml(input.clinicName)} through Nkwapa. Please do not reply to this email; contact your clinic directly if you need help.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/** The plain-text counterpart, built from the same input so the two cannot drift. */
export function renderText(input: LayoutInput): string {
  const lines: string[] = [input.clinicName.toUpperCase(), '', input.heading, ''];
  lines.push(...input.paragraphs, '');
  for (const row of input.details ?? []) {
    lines.push(`${row.label}: ${row.value}`);
  }
  if (input.details?.length) lines.push('');
  if (input.callToAction) {
    lines.push(`${input.callToAction.label}: ${input.callToAction.url}`, '');
  }
  if (input.footnotes?.length) lines.push(...input.footnotes, '');
  lines.push(
    `This message was sent by ${input.clinicName} through Nkwapa. Please do not reply to this email; contact your clinic directly if you need help.`,
  );
  return lines.join('\n').replace(/\n{3,}/g, '\n\n');
}
