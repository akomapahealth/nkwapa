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

describe('portal invite template', () => {
  const base = {
    clinicName: 'Cape Coast Clinic',
    patientCode: 'NKP-2026-000001',
    patientFirstName: 'Ama',
    timezone: 'Africa/Accra',
  };

  it('carries the patient code, which the claim flow requires', () => {
    // Claiming matches on email, patient code and date of birth. Omitting the code
    // would strand every invited patient who was not also handed it on paper.
    const message = renderMessage('PORTAL_INVITE_V1', base);
    expect(message.text).toContain('NKP-2026-000001');
    expect(message.html).toContain('NKP-2026-000001');
  });

  it('renders a sign-in button only when a public origin is configured', () => {
    const withLink = renderMessage('PORTAL_INVITE_V1', {
      ...base,
      claimUrl: 'https://app.nkwapa.org/claim-record',
    });
    expect(withLink.html).toContain('https://app.nkwapa.org/claim-record');

    // The defect this guards: building the link from an unset base URL would email
    // patients an anchor pointing at "undefined/claim-record".
    const withoutLink = renderMessage('PORTAL_INVITE_V1', base);
    expect(withoutLink.html).not.toContain('undefined');
    expect(withoutLink.html).not.toContain('<a href');
    expect(withoutLink.text).toContain('Your clinic can tell you where to sign in');
  });

  it('refuses to turn a non-http payload value into a link', () => {
    const message = renderMessage('PORTAL_INVITE_V1', {
      ...base,
      claimUrl: 'javascript:alert(1)',
    });
    expect(message.html).not.toContain('javascript:');
  });

  it('distinguishes a resend so a patient does not read it as a second invitation', () => {
    const first = renderMessage('PORTAL_INVITE_V1', base);
    const again = renderMessage('PORTAL_INVITE_V1', { ...base, resend: true });
    expect(first.subject).not.toContain('Reminder');
    expect(again.subject).toContain('Reminder');
  });

  it('names no clinical detail beyond the code needed to claim', () => {
    // The address is patient-supplied and unverified until the account is claimed.
    const message = renderMessage('PORTAL_INVITE_V1', { ...base, patientLastName: 'Mensah' });
    expect(message.html).not.toContain('Mensah');
  });

  it('states the expiry when the invite has one', () => {
    const message = renderMessage('PORTAL_INVITE_V1', { ...base, expiresAt: '2026-07-01' });
    expect(message.text).toContain('Jul 2026');
  });
});
