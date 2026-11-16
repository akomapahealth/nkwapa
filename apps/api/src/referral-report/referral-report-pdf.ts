import { randomBytes } from 'node:crypto';
import PDFDocument from 'pdfkit';

/**
 * What a referral report prints (#344), already labelled. The service decides what goes in; this
 * file only lays it out, so it has no idea what a permission is.
 */
export interface ReferralReportContent {
  clinic: { name: string; contact: string | null };
  generatedAt: Date;
  timezone: string;
  sender: { name: string; role: string };
  recipient: { name: string | null; facility: string | null };
  reason: string;
  urgency: string | null;
  patient: Array<{ label: string; value: string }>;
  sections: ReportSection[];
}

export interface ReportSection {
  title: string;
  blocks: ReportBlock[];
}

export type ReportBlock =
  /** Labelled lines, like the chart's "At a glance". */
  | { kind: 'lines'; rows: Array<{ label: string; text: string; muted?: boolean }> }
  /** A table, or its `empty` sentence when there are no rows: never a table of nothing. */
  | { kind: 'table'; caption: string; columns: string[]; rows: string[][]; empty: string }
  | { kind: 'paragraphs'; items: Array<{ heading?: string; text: string }> };

// A4 in points. Black, greys and weight only, so it photocopies and prints in black and white.
const PAGE = { width: 595.28, height: 841.89 };
const MARGIN = { top: 54, bottom: 72, x: 54 };
const WIDTH = PAGE.width - MARGIN.x * 2;
const INK = '#111111';
const MUTED = '#555555';
const RULE = '#b3b3b3';
const SHADE = '#f0f0f0';
const BODY = 'Helvetica';
const BOLD = 'Helvetica-Bold';

/*
  shortcut: the standard PDF fonts cover Latin-1 only, so letters outside it are spelled with their
  nearest Latin-1 letter (Akan and Ewe ɛ, ɔ, ŋ) rather than printed as empty boxes. Embed a font
  with IPA coverage (Noto Sans) if names in other scripts need printing as written.
*/
const FALLBACK: Record<string, string> = {
  ɛ: 'e',
  Ɛ: 'E',
  ɔ: 'o',
  Ɔ: 'O',
  ŋ: 'ng',
  Ŋ: 'Ng',
  ƒ: 'f',
};
// Tab, newlines, printable ASCII and Latin-1, plus the WinAnsi punctuation the text uses.
const isLatin1 = (char: string) => {
  const code = char.codePointAt(0)!;
  return (
    code === 9 ||
    code === 10 ||
    code === 13 ||
    (code >= 0x20 && code <= 0x7e) ||
    (code >= 0xa0 && code <= 0xff) ||
    [0x2013, 0x2014, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2026].includes(code)
  );
};

export function printable(text: string): string {
  return [...text.normalize('NFC')]
    .map((char) => {
      if (isLatin1(char)) return char;
      if (FALLBACK[char]) return FALLBACK[char];
      const stripped = char.normalize('NFKD').replace(/[̀-ͯ]/g, '');
      return [...stripped].every((c) => isLatin1(c)) ? stripped : '?';
    })
    .join('');
}

function stamp(date: Date, timeZone: string, withTime: boolean): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' } : {}),
  }).format(date);
}

/**
 * Render and encrypt the report in memory: AES-256 (PDF 1.7 extension level 3, the Standard
 * security handler revision 5), opened with `passcode`. Nothing touches the disk.
 */
export function renderReferralReportPdf(
  content: ReferralReportContent,
  passcode: string,
): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: MARGIN.top, bottom: MARGIN.bottom, left: MARGIN.x, right: MARGIN.x },
    bufferPages: true,
    pdfVersion: '1.7ext3',
    userPassword: passcode,
    // Random and discarded: nobody can lift the print-only restrictions.
    ownerPassword: randomBytes(24).toString('base64url'),
    permissions: {
      printing: 'highResolution',
      modifying: false,
      copying: false,
      annotating: false,
      fillingForms: false,
      contentAccessibility: true,
      documentAssembly: false,
    },
    // Generic on purpose: some viewers show the title before the passcode is entered.
    info: { Title: 'Referral report', Producer: 'Nkwapa', Creator: 'Nkwapa' },
    lang: 'en-GB',
    displayTitle: true,
  });

  const done = new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const write = (
    text: string,
    options: PDFKit.Mixins.TextOptions & { font?: string; size?: number; color?: string } = {},
  ) => {
    const { font = BODY, size = 10, color = INK, ...rest } = options;
    doc.font(font).fontSize(size).fillColor(color).text(printable(text), rest);
  };
  const heightOf = (text: string, font: string, size: number, width: number) =>
    doc.font(font).fontSize(size).heightOfString(printable(text), { width });
  const bottom = () => PAGE.height - MARGIN.bottom;
  const ensure = (height: number) => {
    if (doc.y + height > bottom()) doc.addPage();
  };
  const rule = (y = doc.y, color = RULE, weight = 0.75) =>
    doc
      .moveTo(MARGIN.x, y)
      .lineTo(MARGIN.x + WIDTH, y)
      .lineWidth(weight)
      .strokeColor(color)
      .stroke();

  // 1. Header: the clinic on the left, what this is and when on the right.
  const top = doc.y;
  write(content.clinic.name, { font: BOLD, size: 15, width: WIDTH * 0.6 });
  if (content.clinic.contact) {
    write(content.clinic.contact, { size: 9, color: MUTED, width: WIDTH * 0.6 });
  }
  const leftBottom = doc.y;
  doc.y = top;
  write('Referral report', { font: BOLD, size: 15, width: WIDTH, align: 'right' });
  write(stamp(content.generatedAt, content.timezone, false), {
    size: 9,
    color: MUTED,
    width: WIDTH,
    align: 'right',
  });
  doc.y = Math.max(doc.y, leftBottom) + 10;
  rule(doc.y, INK, 1.25);
  doc.moveDown(0.6);

  const pair = (label: string, value: string, x: number, width: number) => {
    doc.x = x;
    write(label.toUpperCase(), {
      font: BOLD,
      size: 7.5,
      color: MUTED,
      width,
      characterSpacing: 0.6,
    });
    doc.x = x;
    write(value, { size: 10, width });
  };
  const columnWidth = (WIDTH - 24) / 2;
  const fromY = doc.y;
  pair('Referred by', `${content.sender.name}, ${content.sender.role}`, MARGIN.x, columnWidth);
  const leftY = doc.y;
  doc.y = fromY;
  const to = [content.recipient.name, content.recipient.facility].filter(Boolean).join(', ');
  pair('Referred to', to || 'Not named', MARGIN.x + columnWidth + 24, columnWidth);
  doc.x = MARGIN.x;
  doc.y = Math.max(leftY, doc.y) + 14;

  // 2. Patient, as a shaded two-column grid that reads as one block.
  const cells = content.patient;
  const cellWidth = (WIDTH - 32) / 2;
  const rowHeights: number[] = [];
  for (let i = 0; i < cells.length; i += 2) {
    const height = (cell?: { value: string }) =>
      cell ? 11 + heightOf(cell.value, BODY, 10, cellWidth) : 0;
    rowHeights.push(Math.max(height(cells[i]), height(cells[i + 1])) + 8);
  }
  const boxHeight = 30 + rowHeights.reduce((sum, h) => sum + h, 0);
  ensure(boxHeight);
  const boxTop = doc.y;
  doc.rect(MARGIN.x, boxTop, WIDTH, boxHeight).fillColor(SHADE).fill();
  doc.x = MARGIN.x + 12;
  doc.y = boxTop + 10;
  write('Patient', { font: BOLD, size: 11 });
  let rowTop = doc.y + 4;
  for (let i = 0, row = 0; i < cells.length; i += 2, row++) {
    for (const [offset, cell] of [cells[i], cells[i + 1]].entries()) {
      if (!cell) continue;
      doc.y = rowTop;
      pair(cell.label, cell.value, MARGIN.x + 12 + offset * (cellWidth + 8), cellWidth);
    }
    rowTop += rowHeights[row];
  }
  doc.x = MARGIN.x;
  doc.y = boxTop + boxHeight + 16;

  // 3. Reason and urgency, set apart by a heavy left rule.
  const reasonHeight =
    heightOf(content.reason, BODY, 10.5, WIDTH - 14) + (content.urgency ? 32 : 18);
  ensure(reasonHeight);
  const reasonTop = doc.y;
  doc.rect(MARGIN.x, reasonTop, 3, reasonHeight).fillColor(INK).fill();
  doc.x = MARGIN.x + 14;
  write('REASON FOR REFERRAL', { font: BOLD, size: 7.5, color: MUTED, characterSpacing: 0.6 });
  write(content.reason, { size: 10.5, width: WIDTH - 14 });
  if (content.urgency) {
    doc.moveDown(0.3);
    write(`Urgency: ${content.urgency}`, { font: BOLD, size: 10, width: WIDTH - 14 });
  }
  doc.x = MARGIN.x;
  doc.y = Math.max(doc.y, reasonTop + reasonHeight) + 18;

  // 4 onwards: the chosen sections.
  for (const section of content.sections) {
    ensure(48);
    write(section.title, { font: BOLD, size: 12 });
    rule(doc.y + 3);
    doc.y += 9;
    for (const block of section.blocks) renderBlock(block);
    doc.moveDown(0.9);
  }

  function renderBlock(block: ReportBlock) {
    if (block.kind === 'lines') {
      const labelWidth = 110;
      for (const row of block.rows) {
        const height = heightOf(row.text, BODY, 10, WIDTH - labelWidth);
        ensure(height + 4);
        const y = doc.y;
        write(row.label, { font: BOLD, size: 9.5, width: labelWidth - 10 });
        doc.y = y;
        doc.x = MARGIN.x + labelWidth;
        write(row.text, { size: 10, width: WIDTH - labelWidth, color: row.muted ? MUTED : INK });
        doc.x = MARGIN.x;
        doc.y = Math.max(doc.y, y + height) + 4;
      }
      return;
    }
    if (block.kind === 'paragraphs') {
      for (const item of block.items) {
        ensure(30);
        if (item.heading) write(item.heading, { font: BOLD, size: 10 });
        write(item.text, { size: 10, width: WIDTH, lineGap: 1.5 });
        doc.moveDown(0.5);
      }
      return;
    }
    renderTable(block);
  }

  function renderTable(block: Extract<ReportBlock, { kind: 'table' }>) {
    ensure(40);
    write(block.caption, { font: BOLD, size: 10 });
    doc.moveDown(0.2);
    if (block.rows.length === 0) {
      write(block.empty, { size: 10, color: MUTED });
      doc.moveDown(0.6);
      return;
    }
    // The first column (a date) is narrow; the rest share the width.
    const first = Math.min(110, WIDTH / block.columns.length);
    const rest = (WIDTH - first) / (block.columns.length - 1 || 1);
    const widths = block.columns.map((_, i) => (i === 0 ? first : rest));
    const xs = widths.map((_, i) => MARGIN.x + widths.slice(0, i).reduce((a, b) => a + b, 0));
    const drawRow = (cells: string[], header: boolean) => {
      const font = header ? BOLD : BODY;
      const size = header ? 8.5 : 9.5;
      const height =
        Math.max(...cells.map((cell, i) => heightOf(cell, font, size, widths[i] - 8))) + 8;
      if (doc.y + height > bottom()) {
        doc.addPage();
        if (!header) drawRow(block.columns, true);
      }
      const y = doc.y;
      cells.forEach((cell, i) => {
        doc.y = y + 4;
        doc.x = xs[i];
        write(cell, { font, size, width: widths[i] - 8, color: header ? MUTED : INK });
      });
      doc.x = MARGIN.x;
      doc.y = y + height;
      rule(doc.y, header ? INK : RULE, header ? 0.75 : 0.5);
    };
    drawRow(block.columns, true);
    for (const row of block.rows) drawRow(row, false);
    doc.moveDown(0.8);
  }

  // Footer on every page, drawn once the page count is known.
  const range = doc.bufferedPageRange();
  const generated = `Generated ${stamp(content.generatedAt, content.timezone, true)} (${content.timezone})`;
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const footerY = PAGE.height - MARGIN.bottom + 24;
    // Writing below the bottom margin would open a new page; lift it while the footer is drawn.
    doc.page.margins.bottom = 0;
    rule(footerY - 6, RULE, 0.5);
    doc
      .font(BOLD)
      .fontSize(8)
      .fillColor(INK)
      .text('CONFIDENTIAL', MARGIN.x, footerY, { width: WIDTH / 3, characterSpacing: 0.6 });
    doc
      .font(BODY)
      .fontSize(8)
      .fillColor(MUTED)
      .text(generated, MARGIN.x + WIDTH / 3, footerY, { width: WIDTH / 3, align: 'center' });
    doc.text(`Page ${i - range.start + 1} of ${range.count}`, MARGIN.x + (WIDTH * 2) / 3, footerY, {
      width: WIDTH / 3,
      align: 'right',
    });
    doc.page.margins.bottom = MARGIN.bottom;
  }

  doc.end();
  return done;
}
