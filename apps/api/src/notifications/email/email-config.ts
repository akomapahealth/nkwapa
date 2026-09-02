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
  fromAddress: string | null;
  smtp: NodemailerProviderConfig | null;
}

const DEFAULT_SMTP_PORT = 587;

function read(env: NodeJS.ProcessEnv, key: string): string | null {
  const value = env[key];
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function resolvePort(env: NodeJS.ProcessEnv): number {
  const raw = read(env, 'SMTP_PORT');
  if (!raw) return DEFAULT_SMTP_PORT;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 65535 ? parsed : DEFAULT_SMTP_PORT;
}

function resolveSecure(env: NodeJS.ProcessEnv, port: number): boolean {
  const explicit = read(env, 'SMTP_SECURE');
  if (explicit !== null) return explicit.toLowerCase() === 'true';
  // Implicit TLS is only the default on the submissions port; 587 upgrades via STARTTLS.
  return port === 465;
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
  const fromAddress = read(env, 'EMAIL_FROM');

  if (provider === 'fake') {
    return { provider, readiness: 'fake', missing: [], fromAddress, smtp: null };
  }

  const host = read(env, 'SMTP_HOST');
  const user = read(env, 'SMTP_USER');
  const pass = read(env, 'SMTP_PASS');

  const missing: string[] = [];
  if (!host) missing.push('SMTP_HOST');
  if (!fromAddress) missing.push('EMAIL_FROM');
  // Credentials are optional, but half a credential is always a mistake rather than a
  // deliberate unauthenticated relay.
  if (user && !pass) missing.push('SMTP_PASS');
  if (pass && !user) missing.push('SMTP_USER');

  if (missing.length > 0 || !host || !fromAddress) {
    return { provider, readiness: 'unconfigured', missing, fromAddress, smtp: null };
  }

  const port = resolvePort(env);
  const replyTo = read(env, 'EMAIL_REPLY_TO');

  return {
    provider,
    readiness: 'smtp',
    missing: [],
    fromAddress,
    smtp: {
      transport: {
        host,
        port,
        secure: resolveSecure(env, port),
        ...(user && pass ? { auth: { user, pass } } : {}),
      },
      from: fromAddress,
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
    ? `EMAIL_PROVIDER is "nodemailer" but ${config.missing.join(', ')} ${config.missing.length === 1 ? 'is' : 'are'} not set.`
    : 'EMAIL_PROVIDER is "nodemailer" but the SMTP configuration is incomplete.';
}
