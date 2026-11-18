const { contentSecurityPolicy, securityHeaders } = require('./security-headers');

const production = {
  NODE_ENV: 'production',
  NEXT_PUBLIC_API_BASE_URL: 'https://api.nkwapa.app',
  NEXT_PUBLIC_KEYCLOAK_URL: 'https://auth.nkwapa.app',
};

function directive(policy: string, name: string): string[] {
  const found = policy.split('; ').find((part) => part.startsWith(`${name} `));
  return found ? found.split(' ').slice(1) : [];
}

describe('security headers', () => {
  it('ships the CSP report-only, with the frame and sniffing headers enforced', () => {
    const headers = Object.fromEntries(
      securityHeaders(production).map((h: { key: string; value: string }) => [h.key, h.value]),
    );

    expect(headers['Content-Security-Policy-Report-Only']).toContain("default-src 'self'");
    expect(headers['Content-Security-Policy']).toBeUndefined();
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(headers['X-Frame-Options']).toBe('SAMEORIGIN');
    expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['Permissions-Policy']).toContain('geolocation=(self)');
    expect(headers['Permissions-Policy']).toContain('camera=()');
  });

  it('lets the browser reach only the API, its socket, Keycloak and PostHog', () => {
    expect(directive(contentSecurityPolicy(production), 'connect-src')).toEqual([
      "'self'",
      'https://api.nkwapa.app',
      'wss://api.nkwapa.app',
      'https://auth.nkwapa.app',
      'https://eu.i.posthog.com',
    ]);
  });

  it('allows the silent SSO frame and keeps the app unframeable by other sites', () => {
    const policy = contentSecurityPolicy(production);

    expect(directive(policy, 'frame-src')).toEqual(["'self'", 'https://auth.nkwapa.app']);
    expect(directive(policy, 'frame-ancestors')).toEqual(["'self'"]);
    expect(directive(policy, 'object-src')).toEqual(["'none'"]);
  });

  it('adds unsafe-eval in development only', () => {
    expect(directive(contentSecurityPolicy(production), 'script-src')).not.toContain(
      "'unsafe-eval'",
    );
    expect(
      directive(contentSecurityPolicy({ ...production, NODE_ENV: 'development' }), 'script-src'),
    ).toContain("'unsafe-eval'");
  });

  it('falls back to the local origins when the variables are unset or malformed', () => {
    const policy = contentSecurityPolicy({ NEXT_PUBLIC_API_BASE_URL: 'not a url' });

    expect(directive(policy, 'connect-src')).toEqual(
      expect.arrayContaining([
        'http://localhost:4000',
        'ws://localhost:4000',
        'http://localhost:8080',
      ]),
    );
  });
});
