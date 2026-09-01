import { NodemailerEmailProvider, type SmtpTransportConfig } from './nodemailer-email.provider';
import { FakeEmailProvider } from './fake-email.provider';

function createTransporterSpy(overrides: Partial<{ sendMail: jest.Mock; verify: jest.Mock }> = {}) {
  return {
    sendMail: overrides.sendMail ?? jest.fn().mockResolvedValue({ messageId: '<abc@relay>' }),
    verify: overrides.verify ?? jest.fn().mockResolvedValue(true),
  };
}

describe('NodemailerEmailProvider', () => {
  it('sends html, text, and reply-to through the transport', async () => {
    const transporter = createTransporterSpy();
    const provider = new NodemailerEmailProvider(
      {
        transport: { host: 'smtp.test', port: 587, secure: false },
        from: 'info@akomapa.org',
        replyTo: 'support@akomapa.org',
      },
      () => transporter as never,
    );

    const result = await provider.send('p@example.org', 'Subject', '<p>Hi</p>', 'Hi');

    expect(result).toEqual({ success: true, providerMessageId: '<abc@relay>' });
    expect(transporter.sendMail).toHaveBeenCalledWith({
      from: 'info@akomapa.org',
      to: 'p@example.org',
      subject: 'Subject',
      html: '<p>Hi</p>',
      text: 'Hi',
      replyTo: 'support@akomapa.org',
    });
  });

  it('omits optional fields rather than sending them empty', async () => {
    const transporter = createTransporterSpy();
    const provider = new NodemailerEmailProvider(
      { transport: { host: 'smtp.test', port: 587, secure: false }, from: 'info@akomapa.org' },
      () => transporter as never,
    );

    await provider.send('p@example.org', 'Subject', '<p>Hi</p>');

    const payload = transporter.sendMail.mock.calls[0][0];
    expect(payload).not.toHaveProperty('text');
    expect(payload).not.toHaveProperty('replyTo');
  });

  it('builds a transport with no auth block when no credentials are configured', () => {
    // The defect this guards: passing `auth: { user: '', pass: '' }` makes nodemailer
    // attempt AUTH against relays that accept unauthenticated mail, so local Mailpit
    // and internal relays reject every message.
    let seen: SmtpTransportConfig | null = null;
    new NodemailerEmailProvider(
      { transport: { host: 'localhost', port: 1025, secure: false }, from: 'info@akomapa.org' },
      (config) => {
        seen = config;
        return createTransporterSpy() as never;
      },
    );

    expect(seen).not.toBeNull();
    expect(seen!).not.toHaveProperty('auth');
  });

  it('passes credentials through when they are configured', () => {
    let seen: SmtpTransportConfig | null = null;
    new NodemailerEmailProvider(
      {
        transport: {
          host: 'smtp.test',
          port: 465,
          secure: true,
          auth: { user: 'u', pass: 'p' },
        },
        from: 'info@akomapa.org',
      },
      (config) => {
        seen = config;
        return createTransporterSpy() as never;
      },
    );

    expect(seen!.auth).toEqual({ user: 'u', pass: 'p' });
  });

  it('reports a stable failure code and never leaks the transport error', async () => {
    // SMTP rejections routinely quote the envelope, and the recipient address is PHI.
    const transporter = createTransporterSpy({
      sendMail: jest.fn().mockRejectedValue(new Error('550 5.1.1 <p@example.org> unknown')),
    });
    const provider = new NodemailerEmailProvider(
      { transport: { host: 'smtp.test', port: 587, secure: false }, from: 'info@akomapa.org' },
      () => transporter as never,
    );

    const result = await provider.send('p@example.org', 'Subject', '<p>Hi</p>');

    expect(result).toEqual({ success: false, error: 'EMAIL_SEND_FAILED' });
    expect(JSON.stringify(result)).not.toContain('p@example.org');
  });

  it('reports verification failure without throwing, so a bad host cannot stop boot', async () => {
    const transporter = createTransporterSpy({
      verify: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    });
    const provider = new NodemailerEmailProvider(
      { transport: { host: 'nope.invalid', port: 587, secure: false }, from: 'info@akomapa.org' },
      () => transporter as never,
    );

    await expect(provider.verify()).resolves.toBe(false);
  });
});

describe('FakeEmailProvider', () => {
  it('sends email successfully', async () => {
    const provider = new FakeEmailProvider();
    const result = await provider.send('test@example.com', 'Test Subject', '<p>Hello</p>');
    expect(result.success).toBe(true);
    expect(result.providerMessageId).toMatch(/^fake-email:/);
  });

  it('never logs the recipient address', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      await new FakeEmailProvider().send('patient@example.org', 'Subject', '<p>Hi</p>');
      expect(log.mock.calls.flat().join(' ')).not.toContain('patient@example.org');
    } finally {
      log.mockRestore();
    }
  });
});
