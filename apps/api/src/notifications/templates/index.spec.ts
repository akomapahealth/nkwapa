import { EMAIL_TEMPLATES, UnknownTemplateError, isTemplateKey, renderMessage } from './index';
import { escapeHtml, formatDate, formatDateTime, optionalUrl } from './partials';

const KEYS = Object.keys(EMAIL_TEMPLATES);

describe('email template registry', () => {
  it('exposes every template the reminder ledger can reference', () => {
    expect(KEYS).toEqual(
      expect.arrayContaining(['FOLLOWUP_REMINDER_V1', 'APPOINTMENT_REMINDER_V1']),
    );
  });

  it('refuses an unknown key loudly instead of rendering an empty message', () => {
    expect(() => renderMessage('NOPE_V1', {})).toThrow(UnknownTemplateError);
    expect(isTemplateKey('NOPE_V1')).toBe(false);
  });

  // Table-driven over the registry itself, so a template added later cannot skip these.
  describe.each(KEYS)('%s', (key) => {
    it('renders from an empty payload rather than throwing', () => {
      // Payloads are read back from rows written by older deploys, so a template must
      // tolerate a field that did not exist when the row was created.
      const message = renderMessage(key, {});
      expect(message.subject.trim().length).toBeGreaterThan(0);
      expect(message.text.trim().length).toBeGreaterThan(0);
      expect(message.html).toContain('<!doctype html>');
    });

    it('leaves no unresolved placeholders', () => {
      const message = renderMessage(key, {});
      expect(message.html).not.toContain('{{');
      expect(message.text).not.toContain('{{');
    });

    it('carries a plain-text alternative that is not just markup', () => {
      const message = renderMessage(key, {});
      expect(message.text).not.toContain('<td');
      expect(message.text).not.toContain('<!doctype');
    });

    it('escapes operator-supplied values instead of interpolating markup', () => {
      // The defect this guards: the previous templates did a raw String.replace of
      // {{clinicName}}, so a clinic named with a `<` injected markup into patient mail.
      const message = renderMessage(key, {
        clinicName: '<script>alert(1)</script>Clinic',
        patientCode: '<img src=x onerror=alert(1)>',
      });
      // Escaped text may still read "onerror=" as literal characters; what matters is
      // that no tag is ever opened from a supplied value.
      expect(message.html).not.toContain('<script');
      expect(message.html).not.toContain('<img');
      expect(message.html).toContain('&lt;script&gt;');
    });

    it('renders a preheader so the inbox preview is not a wall of style attributes', () => {
      expect(renderMessage(key, {}).html).toMatch(/visibility:hidden/);
    });
  });
});

describe('reminder templates', () => {
  it('renders the appointment time in the clinic timezone, not the server timezone', () => {
    // 08:30 UTC is 08:30 in Accra and 09:30 in Lagos. A UTC container previously told
    // every patient the server's time.
    const payload = { startsAt: '2026-06-15T08:30:00.000Z', clinicName: 'Cape Coast' };
    const accra = renderMessage('APPOINTMENT_REMINDER_V1', {
      ...payload,
      timezone: 'Africa/Accra',
    });
    const lagos = renderMessage('APPOINTMENT_REMINDER_V1', {
      ...payload,
      timezone: 'Africa/Lagos',
    });

    expect(accra.text).toContain('08:30');
    expect(lagos.text).toContain('09:30');
  });

  it('keeps an SMS body for the two templates that also go out over SMS', () => {
    for (const key of ['FOLLOWUP_REMINDER_V1', 'APPOINTMENT_REMINDER_V1']) {
      const message = renderMessage(key, { patientCode: 'NKP-2026-000001' });
      expect(message.smsBody).toContain('NKP-2026-000001');
      expect(message.smsBody).not.toContain('<');
    }
  });

  it('falls back to a readable phrase when a date is missing or unparseable', () => {
    expect(renderMessage('FOLLOWUP_REMINDER_V1', {}).text).toContain('the scheduled date');
    expect(renderMessage('APPOINTMENT_REMINDER_V1', { startsAt: 'not-a-date' }).text).toContain(
      'the scheduled time',
    );
  });
});

describe('template partials', () => {
  it('escapes every HTML-significant character', () => {
    expect(escapeHtml(`<>&"'`)).toBe('&lt;&gt;&amp;&quot;&#39;');
  });

  it('falls back to the default timezone rather than throwing on an unknown zone', () => {
    expect(() => formatDateTime('2026-06-15T08:30:00.000Z', 'Mars/Olympus')).not.toThrow();
    expect(formatDate('2026-06-15T08:30:00.000Z', 'Mars/Olympus')).toContain('2026');
  });

  it.each(['javascript:alert(1)', 'data:text/html,x', 'not a url', ''])(
    'refuses to turn %p into a link',
    (candidate) => {
      expect(optionalUrl(candidate)).toBeNull();
    },
  );

  it('accepts an absolute http(s) url', () => {
    expect(optionalUrl('https://app.nkwapa.org/claim-record')).toBe(
      'https://app.nkwapa.org/claim-record',
    );
  });
});
