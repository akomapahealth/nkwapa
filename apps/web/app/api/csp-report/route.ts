// Receives Content-Security-Policy violation reports (report-uri in security-headers.js) and logs
// one line each, which Vercel keeps with the function logs.
// shortcut: no rate limit, so a flood only costs log volume; move to the API's limiter if it does.

const MAX_BYTES = 16_384;
const MAX_FIELD = 300;

// Query strings can carry codes or tokens (the Keycloak callback), so only origin and path are kept.
function withoutQuery(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length === 0) return undefined;
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`.slice(0, MAX_FIELD);
  } catch {
    // 'inline', 'eval', 'data' and similar keywords are not URLs.
    return value.slice(0, MAX_FIELD);
  }
}

export async function POST(request: Request): Promise<Response> {
  const body = await request.text();
  if (body.length > MAX_BYTES) return new Response(null, { status: 413 });

  let report: Record<string, unknown> | undefined;
  try {
    const parsed: unknown = JSON.parse(body);
    const inner = (parsed as { 'csp-report'?: unknown } | null)?.['csp-report'];
    if (inner && typeof inner === 'object') report = inner as Record<string, unknown>;
  } catch {
    // Malformed: fall through to 400.
  }
  if (!report) return new Response(null, { status: 400 });

  console.warn(
    'csp-violation',
    JSON.stringify({
      directive: withoutQuery(report['effective-directive'] ?? report['violated-directive']),
      blocked: withoutQuery(report['blocked-uri']),
      document: withoutQuery(report['document-uri']),
      source: withoutQuery(report['source-file']),
      line: typeof report['line-number'] === 'number' ? report['line-number'] : undefined,
      disposition: withoutQuery(report.disposition),
    }),
  );
  return new Response(null, { status: 204 });
}
