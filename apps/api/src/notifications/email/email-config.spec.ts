import {
  describeEmailUnavailability,
  resolveAppPublicUrl,
  resolveEmailConfig,
} from './email-config';

type EmailEnvKey =
  | 'EMAIL_PROVIDER'
  | 'EMAIL_FROM'
  | 'EMAIL_FROM_NAME'
  | 'EMAIL_REPLY_TO'
  | 'SMTP_HOST'
  | 'SMTP_PORT'
  | 'SMTP_USER'
  | 'SMTP_PASS'
  | 'SMTP_SECURE'
  | 'APP_PUBLIC_URL';

/** Built from a literal so a test can never accidentally read the real environment. */
function env(overrides: Partial<Record<EmailEnvKey, string>>): NodeJS.ProcessEnv {
  return { ...overrides } as NodeJS.ProcessEnv;
}

describe('resolveEmailConfig', () => {
  it('defaults to the fake provider when nothing is configured', () => {
    const config = resolveEmailConfig(env({}));
    expect(config).toMatchObject({ provider: 'fake', readiness: 'fake', missing: [] });
    expect(config.smtp).toBeNull();
  });

  it('treats any unrecognised provider value as fake rather than failing', () => {
    expect(resolveEmailConfig(env({ EMAIL_PROVIDER: 'sendgrid' })).readiness).toBe('fake');
  });

  it('builds an SMTP transport with no auth block when no credentials are given', () => {
    // The defect this guards: requiring SMTP_USER/SMTP_PASS made every unauthenticated
    // relay unreachable, including the Mailpit this repo already runs on port 1025.
    const config = resolveEmailConfig(
      env({
        EMAIL_PROVIDER: 'nodemailer',
        SMTP_HOST: 'localhost',
        SMTP_PORT: '1025',
        EMAIL_FROM: 'info@akomapa.org',
      }),
    );

    expect(config.readiness).toBe('smtp');
    expect(config.smtp?.transport).toMatchObject({ host: 'localhost', port: 1025, secure: false });
    expect(config.smtp?.transport).not.toHaveProperty('auth');
  });

  it('passes credentials through when both are present', () => {
    const config = resolveEmailConfig(
      env({
        EMAIL_PROVIDER: 'nodemailer',
        SMTP_HOST: 'smtp.test',
        SMTP_USER: 'u',
        SMTP_PASS: 'p',
        EMAIL_FROM: 'info@akomapa.org',
      }),
    );

    expect(config.smtp?.transport.auth).toEqual({ user: 'u', pass: 'p' });
  });

  it.each([
    ['SMTP_PASS', { SMTP_USER: 'u' }],
    ['SMTP_USER', { SMTP_PASS: 'p' }],
  ])('reports %s missing when only half a credential is set', (expected, half) => {
    // Half a credential is a misconfiguration, never a deliberate unauthenticated relay.
    // Silently dropping auth here would send unauthenticated to a server expecting it.
    const config = resolveEmailConfig(
      env({
        EMAIL_PROVIDER: 'nodemailer',
        SMTP_HOST: 'smtp.test',
        EMAIL_FROM: 'info@akomapa.org',
        ...half,
      }),
    );

    expect(config.readiness).toBe('unconfigured');
    expect(config.missing).toEqual([expected]);
  });

  it('names every missing variable instead of failing on the first', () => {
    const config = resolveEmailConfig(env({ EMAIL_PROVIDER: 'nodemailer' }));
    expect(config.readiness).toBe('unconfigured');
    expect(config.missing).toEqual(['SMTP_HOST', 'EMAIL_FROM']);
    expect(describeEmailUnavailability(config)).toContain('SMTP_HOST, EMAIL_FROM');
  });

  it('never reports a reason while email is usable', () => {
    expect(describeEmailUnavailability(resolveEmailConfig(env({})))).toBeNull();
  });

  it('defaults to port 587 with STARTTLS and switches to implicit TLS on 465', () => {
    const base = {
      EMAIL_PROVIDER: 'nodemailer',
      SMTP_HOST: 'smtp.test',
      EMAIL_FROM: 'info@akomapa.org',
    };
    expect(resolveEmailConfig(env(base)).smtp?.transport).toMatchObject({
      port: 587,
      secure: false,
    });
    expect(resolveEmailConfig(env({ ...base, SMTP_PORT: '465' })).smtp?.transport).toMatchObject({
      port: 465,
      secure: true,
    });
  });

  // Hosts that block 25/465/587 push you onto the 2xxx aliases. Getting `secure` wrong on
  // 2465 produces a hang that is indistinguishable from the blocked port you moved off.
  it.each([
    [25, false],
    [465, true],
    [587, false],
    [2465, true],
    [2587, false],
    [1025, false],
  ])('derives implicit TLS correctly for port %i', (port, secure) => {
    const config = resolveEmailConfig(
      env({
        EMAIL_PROVIDER: 'nodemailer',
        SMTP_HOST: 'smtp.test',
        EMAIL_FROM: 'info@akomapa.org',
        SMTP_PORT: String(port),
      }),
    );
    expect(config.smtp?.transport).toMatchObject({ port, secure });
  });

  it('lets SMTP_SECURE turn implicit TLS off on an alternate submissions port', () => {
    const config = resolveEmailConfig(
      env({
        EMAIL_PROVIDER: 'nodemailer',
        SMTP_HOST: 'smtp.test',
        EMAIL_FROM: 'info@akomapa.org',
        SMTP_PORT: '2465',
        SMTP_SECURE: 'false',
      }),
    );
    expect(config.smtp?.transport.secure).toBe(false);
  });

  it('bounds every SMTP timeout so one dead relay cannot stall the queue', () => {
    // Nodemailer's defaults are 2 min to connect and 10 min on the socket. The reminders
    // queue runs one job at a time, so those defaults block every other notification.
    const config = resolveEmailConfig(
      env({
        EMAIL_PROVIDER: 'nodemailer',
        SMTP_HOST: 'smtp.test',
        EMAIL_FROM: 'info@akomapa.org',
      }),
    );

    expect(config.smtp?.transport).toMatchObject({
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 30_000,
    });
  });

  it.each(['', 'not-a-number', '0', '70000'])(
    'falls back to 587 for the unusable port %p',
    (port) => {
      const config = resolveEmailConfig(
        env({
          EMAIL_PROVIDER: 'nodemailer',
          SMTP_HOST: 'smtp.test',
          EMAIL_FROM: 'info@akomapa.org',
          SMTP_PORT: port,
        }),
      );
      expect(config.smtp?.transport.port).toBe(587);
    },
  );

  it('lets SMTP_SECURE override the port-derived default', () => {
    const config = resolveEmailConfig(
      env({
        EMAIL_PROVIDER: 'nodemailer',
        SMTP_HOST: 'smtp.test',
        EMAIL_FROM: 'info@akomapa.org',
        SMTP_PORT: '587',
        SMTP_SECURE: 'true',
      }),
    );
    expect(config.smtp?.transport.secure).toBe(true);
  });

  describe('sender name', () => {
    const base = {
      EMAIL_PROVIDER: 'nodemailer',
      SMTP_HOST: 'smtp.test',
      EMAIL_FROM: 'no-reply@akomapa.org',
    };

    it('sends a bare address when no display name is configured', () => {
      const config = resolveEmailConfig(env(base));
      expect(config.smtp?.from).toBe('no-reply@akomapa.org');
      expect(config.fromName).toBeNull();
    });

    it('hands nodemailer a structured pair rather than a pre-joined header', () => {
      // Joining it here would break on a name carrying a comma, a quote or an accent.
      // Nodemailer already knows the RFC 5322 quoting rules, so let it do them.
      const config = resolveEmailConfig(env({ ...base, EMAIL_FROM_NAME: 'Nkwapa' }));
      expect(config.smtp?.from).toEqual({ name: 'Nkwapa', address: 'no-reply@akomapa.org' });
    });

    it('keeps fromAddress bare so the status endpoint still names the mailbox', () => {
      const config = resolveEmailConfig(env({ ...base, EMAIL_FROM_NAME: 'Nkwapa' }));
      expect(config.fromAddress).toBe('no-reply@akomapa.org');
      expect(config.fromName).toBe('Nkwapa');
    });

    it('accepts a display name inlined in EMAIL_FROM, which was the only way before', () => {
      const config = resolveEmailConfig(
        env({ ...base, EMAIL_FROM: 'Akomapa <no-reply@akomapa.org>' }),
      );
      expect(config.readiness).toBe('smtp');
      expect(config.fromAddress).toBe('no-reply@akomapa.org');
      expect(config.smtp?.from).toEqual({ name: 'Akomapa', address: 'no-reply@akomapa.org' });
    });

    it('lets EMAIL_FROM_NAME win over a name inlined in EMAIL_FROM', () => {
      const config = resolveEmailConfig(
        env({
          ...base,
          EMAIL_FROM: 'Akomapa <no-reply@akomapa.org>',
          EMAIL_FROM_NAME: 'Nkwapa',
        }),
      );
      expect(config.smtp?.from).toEqual({ name: 'Nkwapa', address: 'no-reply@akomapa.org' });
    });

    it('strips the quotes from an already-quoted inline display name', () => {
      const config = resolveEmailConfig(
        env({ ...base, EMAIL_FROM: '"Nkwapa Health" <no-reply@akomapa.org>' }),
      );
      expect(config.smtp?.from).toEqual({
        name: 'Nkwapa Health',
        address: 'no-reply@akomapa.org',
      });
    });

    it.each(['Nkwapa', 'no-reply@akomapa.org, info@akomapa.org', 'no-reply@localhost', '@x.org'])(
      'reports EMAIL_FROM unusable for %p rather than failing at send time',
      (value) => {
        const config = resolveEmailConfig(env({ ...base, EMAIL_FROM: value }));
        expect(config.readiness).toBe('unconfigured');
        expect(config.missing).toContain('EMAIL_FROM');
        expect(describeEmailUnavailability(config)).toContain('missing or unusable');
      },
    );
  });

  it('carries a reply-to only when one is configured', () => {
    const base = {
      EMAIL_PROVIDER: 'nodemailer',
      SMTP_HOST: 'smtp.test',
      EMAIL_FROM: 'info@akomapa.org',
    };
    expect(resolveEmailConfig(env(base)).smtp).not.toHaveProperty('replyTo');
    expect(
      resolveEmailConfig(env({ ...base, EMAIL_REPLY_TO: 'support@akomapa.org' })).smtp?.replyTo,
    ).toBe('support@akomapa.org');
  });

  it('treats whitespace-only values as unset', () => {
    const config = resolveEmailConfig(
      env({ EMAIL_PROVIDER: 'nodemailer', SMTP_HOST: '   ', EMAIL_FROM: 'info@akomapa.org' }),
    );
    expect(config.missing).toContain('SMTP_HOST');
  });
});

describe('resolveAppPublicUrl', () => {
  it.each([undefined, '', '   ', 'not a url', 'javascript:alert(1)'])(
    'returns null for %p rather than a value that renders as undefined/claim-record',
    (value) => {
      expect(resolveAppPublicUrl(env({ APP_PUBLIC_URL: value } as never))).toBeNull();
    },
  );

  it('normalises to the origin so templates can append their own path', () => {
    expect(resolveAppPublicUrl(env({ APP_PUBLIC_URL: 'https://app.nkwapa.org/x' } as never))).toBe(
      'https://app.nkwapa.org',
    );
  });
});
