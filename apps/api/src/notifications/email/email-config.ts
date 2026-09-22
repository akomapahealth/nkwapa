import type { NodemailerProviderConfig } from './nodemailer-email.provider';

export type EmailProviderKind = 'fake' | 'nodemailer';

/**
 * What the process can actually do with email right now.
 *
 * `unconfigured` is deliberately distinct from `fake`. Both fail to reach a real
 * inbox, but one is a working local default and the other is a deployment mistake
 * that operators need to see and fix.
 */
export type EmailReadiness = 'fake' | 'smtp' | 'unconfigured';

export interface EmailConfig {
  provider: EmailProviderKind;
  readiness: EmailReadiness;
  /** Names of the environment variables still required. Never their values. */
  missing: string[];
  /**
   * The bare address, never the composed header.
   *
   * Operators read this off the status endpoint to check which mailbox a clinic's mail
   * claims to come from, and `Nkwapa <no-reply@akomapa.org>` answers that question worse
   * than `no-reply@akomapa.org` does. The display name is a presentation concern and
   * lives on the transport's `from` instead.
   */
  fromAddress: string | null;
  fromName: string | null;
  smtp: NodemailerProviderConfig | null;
}

const DEFAULT_SMTP_PORT = 587;

/**
 * Fail a dead relay fast instead of holding the queue open.
 *
 * Nodemailer's defaults are two minutes to connect, thirty seconds for a greeting and
 * ten minutes on the socket. The reminders queue runs one job at a time, so a single
 * unreachable relay would stall every other queued notification behind it for the full
 * two minutes. A host that drops packets rather than refusing them — which is how
 * blocked SMTP egress usually presents — hits exactly that path.
 */
const CONNECTION_TIMEOUT_MS = 10_000;
const GREETING_TIMEOUT_MS = 10_000;
const SOCKET_TIMEOUT_MS = 30_000;

function read(env: NodeJS.ProcessEnv, key: string): string | null {
  const value = env[key];
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Split `EMAIL_FROM` into an address and an optional display name.
 *
 * Accepts both a bare `no-reply@akomapa.org` and the RFC 5322 `Nkwapa <no-reply@...>`
 * form, because the latter was the only way to get a display name before
 * `EMAIL_FROM_NAME` existed and some deployments will still be carrying it.
 */
function parseFrom(raw: string): { address: string; name: string | null } {
  const match = /^(.*?)<([^<>]+)>\s*$/.exec(raw);
  if (!match) return { address: raw, name: null };

  const name = match[1]
    .trim()
    .replace(/^"(.*)"$/, '$1')
    .trim();
  return { address: match[2].trim(), name: name.length > 0 ? name : null };
}

/**
 * A deliberately loose check: one `@`, something either side, a dot in the domain and no
 * whitespace. It is here to catch the realistic mistake — a display name pasted into
 * `EMAIL_FROM` without angle brackets, or a stray trailing comma — not to adjudicate
 * RFC 5322, which would reject valid addresses and help nobody.
 */
function isPlausibleAddress(address: string): boolean {
  return /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(address);
}

function resolvePort(env: NodeJS.ProcessEnv): number {
  const raw = read(env, 'SMTP_PORT');
  if (!raw) return DEFAULT_SMTP_PORT;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 65535 ? parsed : DEFAULT_SMTP_PORT;
}

/**
 * Ports that speak TLS from the first byte, rather than upgrading through STARTTLS.
 *
 * 2465 matters as much as 465 here. Hosts that block the standard SMTP ports push you
 * onto the 2xxx aliases, and a relay that expects implicit TLS there will simply never
 * send a plaintext greeting — the connection hangs until it times out, which is
 * indistinguishable from the blocked port you moved off in the first place.
 */
const IMPLICIT_TLS_PORTS = new Set([465, 2465]);

function resolveSecure(env: NodeJS.ProcessEnv, port: number): boolean {
  const explicit = read(env, 'SMTP_SECURE');
  if (explicit !== null) return explicit.toLowerCase() === 'true';
  // 25, 587 and 2587 start in plaintext and upgrade via STARTTLS; 465 and 2465 do not.
  return IMPLICIT_TLS_PORTS.has(port);
}

/**
 * Resolve email configuration without throwing.
 *
 * Reading this at startup used to throw straight out of a DI factory, which turned a
 * missing SMTP variable into a crash loop for the whole API — including every route
 * that has nothing to do with email. Returning a readiness verdict instead lets the
 * process boot, report the problem, and fail individual sends with a clear reason.
 */
export function resolveEmailConfig(env: NodeJS.ProcessEnv = process.env): EmailConfig {
  const provider: EmailProviderKind =
    read(env, 'EMAIL_PROVIDER') === 'nodemailer' ? 'nodemailer' : 'fake';
  const rawFrom = read(env, 'EMAIL_FROM');
  const parsedFrom = rawFrom ? parseFrom(rawFrom) : null;
  const fromAddress = parsedFrom?.address ?? null;
  // EMAIL_FROM_NAME wins over a name inlined in EMAIL_FROM: it is the explicit setting,
  // and it is the one that pairs with KC_SMTP_FROM_DISPLAY_NAME on the Keycloak service.
  const fromName = read(env, 'EMAIL_FROM_NAME') ?? parsedFrom?.name ?? null;

  if (provider === 'fake') {
    return { provider, readiness: 'fake', missing: [], fromAddress, fromName, smtp: null };
  }

  const host = read(env, 'SMTP_HOST');
  const user = read(env, 'SMTP_USER');
  const pass = read(env, 'SMTP_PASS');

  const missing: string[] = [];
  if (!host) missing.push('SMTP_HOST');
  // An address that cannot be sent from is no more usable than an absent one, and it
  // fails at send time rather than at boot, which is the harder failure to trace back.
  if (!fromAddress || !isPlausibleAddress(fromAddress)) missing.push('EMAIL_FROM');
  // Credentials are optional, but half a credential is always a mistake rather than a
  // deliberate unauthenticated relay.
  if (user && !pass) missing.push('SMTP_PASS');
  if (pass && !user) missing.push('SMTP_USER');

  if (missing.length > 0 || !host || !fromAddress) {
    return { provider, readiness: 'unconfigured', missing, fromAddress, fromName, smtp: null };
  }

  const port = resolvePort(env);
  const replyTo = read(env, 'EMAIL_REPLY_TO');

  return {
    provider,
    readiness: 'smtp',
    missing: [],
    fromAddress,
    fromName,
    smtp: {
      transport: {
        host,
        port,
        secure: resolveSecure(env, port),
        connectionTimeout: CONNECTION_TIMEOUT_MS,
        greetingTimeout: GREETING_TIMEOUT_MS,
        socketTimeout: SOCKET_TIMEOUT_MS,
        ...(user && pass ? { auth: { user, pass } } : {}),
      },
      // Handed to nodemailer as a structured pair rather than a pre-joined string, so
      // that it does the RFC 5322 quoting and any encoded-word escaping itself. Building
      // `Name <addr>` here would break on a name containing a comma, a quote or an accent.
      from: fromName ? { name: fromName, address: fromAddress } : fromAddress,
      ...(replyTo ? { replyTo } : {}),
    },
  };
}

/**
 * Absolute origin for links in outbound mail.
 *
 * Returns null rather than a guess when unset: a template that renders
 * `undefined/claim-record` is worse than one that renders no link at all and tells the
 * reader to sign in from the address the clinic gave them.
 */
export function resolveAppPublicUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  const raw = read(env, 'APP_PUBLIC_URL');
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function describeEmailUnavailability(config: EmailConfig): string | null {
  if (config.readiness !== 'unconfigured') return null;
  return config.missing.length > 0
    ? `EMAIL_PROVIDER is "nodemailer" but ${config.missing.join(', ')} ${config.missing.length === 1 ? 'is' : 'are'} missing or unusable.`
    : 'EMAIL_PROVIDER is "nodemailer" but the SMTP configuration is incomplete.';
}
