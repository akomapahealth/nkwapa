import { createDecipheriv, createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import {
  printable,
  renderReferralReportPdf,
  type ReferralReportContent,
} from './referral-report-pdf';

const content: ReferralReportContent = {
  clinic: { name: 'Test Clinic', contact: 'Ashanti' },
  generatedAt: new Date('2026-11-16T14:05:00Z'),
  timezone: 'Africa/Accra',
  sender: { name: 'Ama Boateng', role: 'Doctor' },
  recipient: { name: null, facility: 'Regional Hospital' },
  reason: 'Raised blood pressure on three visits.',
  urgency: 'Urgent',
  patient: [
    { label: 'Name', value: 'Yaa Asantewaa' },
    { label: 'Patient code', value: 'NKP-2026-000001' },
  ],
  sections: [
    {
      title: 'Readings',
      blocks: [
        {
          kind: 'table',
          caption: 'Blood pressure (last 6)',
          columns: ['Date', 'Blood pressure', 'Pulse'],
          rows: [['15 Nov 2026', '162/98 mmHg', '80 bpm']],
          empty: 'No blood pressure recorded.',
        },
      ],
    },
  ],
};

const hex = (pdf: string, key: string) =>
  Buffer.from(new RegExp(`/${key} <([0-9a-f]+)>`).exec(pdf)![1], 'hex');

/**
 * Open the file the way a reader does, with the Standard security handler revision 5 (ISO 32000
 * extension level 3): check the passcode against /U, unwrap the file key from /UE, then decrypt
 * each stream with AES-256-CBC. Returns the page text, or null when the passcode is wrong.
 */
function openPdf(file: Buffer, passcode: string): string | null {
  const pdf = file.toString('latin1');
  const u = hex(pdf, 'U');
  const password = Buffer.from(passcode, 'utf8').subarray(0, 127);
  const sha = (...parts: Buffer[]) => createHash('sha256').update(Buffer.concat(parts)).digest();
  if (!sha(password, u.subarray(32, 40)).equals(u.subarray(0, 32))) return null;

  const unwrap = createDecipheriv(
    'aes-256-cbc',
    sha(password, u.subarray(40, 48)),
    Buffer.alloc(16),
  );
  unwrap.setAutoPadding(false);
  const key = Buffer.concat([unwrap.update(hex(pdf, 'UE')), unwrap.final()]);

  let text = '';
  const streams = /\/Length (\d+)[^>]*>>\nstream\n/g;
  for (let match = streams.exec(pdf); match; match = streams.exec(pdf)) {
    const start = match.index + match[0].length;
    const data = file.subarray(start, start + Number(match[1]));
    const decipher = createDecipheriv('aes-256-cbc', key, data.subarray(0, 16));
    const plain = Buffer.concat([decipher.update(data.subarray(16)), decipher.final()]);
    let body: Buffer;
    try {
      body = inflateSync(plain);
    } catch {
      continue; // Fonts and metadata that are not page content.
    }
    // Standard-font text is drawn as hex strings of WinAnsi codes.
    for (const run of body.toString('latin1').matchAll(/<([0-9a-f]+)>/g)) {
      text += Buffer.from(run[1], 'hex').toString('latin1');
    }
    text += '\n';
  }
  return text;
}

describe('referral report PDF (#344)', () => {
  it('opens with the passcode and not without it', async () => {
    const file = await renderReferralReportPdf(content, 'K7QMXR4P');
    expect(file.subarray(0, 8).toString()).toBe('%PDF-1.7');
    expect(file.toString('latin1')).toContain('/CFM /AESV3');
    expect(openPdf(file, 'WRONG123')).toBeNull();
    expect(openPdf(file, 'k7qmxr4p')).toBeNull();

    const text = openPdf(file, 'K7QMXR4P')!;
    expect(text).toContain('Yaa Asantewaa');
    expect(text).toContain('162/98 mmHg');
    expect(text).toContain('CONFIDENTIAL');
    expect(text).toContain('Page 1 of 1');
  });

  it('keeps patient detail out of the unencrypted parts of the file', async () => {
    const file = (await renderReferralReportPdf(content, 'K7QMXR4P')).toString('latin1');
    for (const secret of ['Yaa', 'Asantewaa', 'NKP-2026', 'blood pressure', 'K7QMXR4P']) {
      expect(file).not.toContain(secret);
    }
  });

  it('spells letters the standard fonts lack with their nearest Latin letter', () => {
    expect(printable('Ɔsɛe Ŋkansah Akosua')).toBe('Osee Ngkansah Akosua');
    expect(printable('Adèle Müller')).toBe('Adèle Müller');
    expect(printable('Ő')).toBe('O');
  });
});
