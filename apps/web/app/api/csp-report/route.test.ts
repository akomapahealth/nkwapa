import { POST } from './route';

function report(body: string) {
  return new Request('http://localhost/api/csp-report', {
    method: 'POST',
    headers: { 'content-type': 'application/csp-report' },
    body,
  });
}

describe('POST /api/csp-report', () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => warn.mockRestore());

  it('logs one line per report without query strings', async () => {
    const response = await POST(
      report(
        JSON.stringify({
          'csp-report': {
            'document-uri': 'https://nkwapa.app/dashboard?code=secret-code',
            'effective-directive': 'connect-src',
            'blocked-uri': 'https://evil.example/collect?d=patient',
            'line-number': 12,
          },
        }),
      ),
    );

    expect(response.status).toBe(204);
    expect(warn).toHaveBeenCalledTimes(1);
    const line = JSON.parse(warn.mock.calls[0][1]);
    expect(line).toEqual({
      directive: 'connect-src',
      blocked: 'https://evil.example/collect',
      document: 'https://nkwapa.app/dashboard',
      line: 12,
    });
    expect(warn.mock.calls[0][1]).not.toContain('secret-code');
  });

  it('keeps CSP keywords like inline as they are', async () => {
    await POST(report(JSON.stringify({ 'csp-report': { 'blocked-uri': 'inline' } })));

    expect(JSON.parse(warn.mock.calls[0][1]).blocked).toBe('inline');
  });

  it('refuses malformed and oversized bodies without logging', async () => {
    expect((await POST(report('not json'))).status).toBe(400);
    expect((await POST(report(JSON.stringify({ other: 1 })))).status).toBe(400);
    expect((await POST(report('x'.repeat(16_385)))).status).toBe(413);
    expect(warn).not.toHaveBeenCalled();
  });
});
