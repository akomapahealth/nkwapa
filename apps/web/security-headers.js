/**
 * Response headers for every web route, read by next.config.js.
 *
 * The CSP ships report-only first (SEC-04 phase 1): violations go to /api/csp-report and land in
 * the Vercel logs, and nothing is blocked. Enforce it only after the reports have been clean.
 *
 * script-src allows inline scripts because most routes are prerendered and Next inlines a
 * per-page RSC payload that cannot be hashed by hand; a nonce would make every page dynamic.
 * The rest of the policy is what limits an injected script: where it can send data, what can
 * frame the app, where forms and <base> can point.
 */

const DEFAULTS = {
  api: 'http://localhost:4000',
  keycloak: 'http://localhost:8080',
  posthog: 'https://eu.i.posthog.com',
};

function origin(value, fallback) {
  try {
    return new URL(value || fallback).origin;
  } catch {
    return new URL(fallback).origin;
  }
}

// The chat socket connects to the API over ws:// or wss://, which CSP lists separately.
function socketOrigin(httpOrigin) {
  return httpOrigin.replace(/^http/, 'ws');
}

function contentSecurityPolicy(env = process.env) {
  const api = origin(env.NEXT_PUBLIC_API_BASE_URL, DEFAULTS.api);
  const keycloak = origin(env.NEXT_PUBLIC_KEYCLOAK_URL, DEFAULTS.keycloak);
  const posthog = origin(env.NEXT_PUBLIC_POSTHOG_HOST, DEFAULTS.posthog);

  const directives = {
    'default-src': ["'self'"],
    // React needs eval in development only (Next's CSP guide).
    'script-src': [
      "'self'",
      "'unsafe-inline'",
      ...(env.NODE_ENV === 'development' ? ["'unsafe-eval'"] : []),
    ],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:'],
    'font-src': ["'self'", 'data:'],
    'connect-src': ["'self'", api, socketOrigin(api), keycloak, posthog],
    // Silent SSO: the iframe opens Keycloak, which redirects it back to /silent-check-sso.html.
    'frame-src': ["'self'", keycloak],
    'worker-src': ["'self'"],
    'manifest-src': ["'self'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'", keycloak],
    // 'self', not 'none': the silent SSO page is framed by our own pages.
    'frame-ancestors': ["'self'"],
    'report-uri': ['/api/csp-report'],
  };

  return Object.entries(directives)
    .map(([name, values]) => `${name} ${[...new Set(values)].join(' ')}`)
    .join('; ');
}

function securityHeaders(env = process.env) {
  return [
    { key: 'Content-Security-Policy-Report-Only', value: contentSecurityPolicy(env) },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    // SAMEORIGIN for the same reason as frame-ancestors 'self'.
    { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
    // Geolocation stays for the residential position field; nothing uses the rest.
    {
      key: 'Permissions-Policy',
      value:
        'camera=(), microphone=(), geolocation=(self), payment=(), usb=(), serial=(), hid=(), midi=(), browsing-topics=()',
    },
  ];
}

module.exports = { contentSecurityPolicy, securityHeaders };
