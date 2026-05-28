import { TwilioSmsProvider } from './twilio-sms.provider';

describe('TwilioSmsProvider', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      TWILIO_ACCOUNT_SID: 'ACtest123',
      TWILIO_AUTH_TOKEN: 'testtoken',
      TWILIO_FROM_NUMBER: '+15551234567',
      TWILIO_STATUS_CALLBACK_URL: 'https://example.com/webhooks/sms/status',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  it('throws if required env vars are missing', () => {
    delete process.env.TWILIO_ACCOUNT_SID;
    expect(() => new TwilioSmsProvider()).toThrow('Missing Twilio config');
  });

  it('sends SMS successfully', async () => {
    const mockResponse = {
      ok: true,
      json: jest.fn().mockResolvedValue({ sid: 'SM123', status: 'queued' }),
    };
    jest.spyOn(global, 'fetch').mockResolvedValue(mockResponse as unknown as Response);

    const provider = new TwilioSmsProvider();
    const result = await provider.send('+233241234567', 'Test message');

    expect(result.success).toBe(true);
    expect(result.providerMessageId).toBe('SM123');
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('api.twilio.com'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: expect.stringContaining('Basic'),
        }),
      }),
    );
  });

  it('handles API error', async () => {
    const mockResponse = {
      ok: false,
      status: 400,
      text: jest.fn().mockResolvedValue('Bad Request'),
    };
    jest.spyOn(global, 'fetch').mockResolvedValue(mockResponse as unknown as Response);

    const provider = new TwilioSmsProvider();
    const result = await provider.send('+233241234567', 'Test');

    expect(result.success).toBe(false);
    expect(result.error).toContain('Twilio API error 400');
  });

  it('handles network failure', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('Network error'));

    const provider = new TwilioSmsProvider();
    const result = await provider.send('+233241234567', 'Test');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Twilio request failed');
  });
});
