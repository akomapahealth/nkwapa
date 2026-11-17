/**
 * The offline grant (#207): what lets a staff member resume a session on this device with no
 * signal, and what the server recognises on the writes that session queues.
 *
 * Shared with the API so both sides read one definition. The API signs it (ES256 compact JWS);
 * the browser verifies it here with WebCrypto only, which also runs in Node 20, so the API's tests
 * verify with exactly the code a device runs.
 *
 * The signature stops a stale or hand-edited grant from being accepted by mistake. It does not stop
 * someone with devtools, who can change the code that checks it. The server-side checks at push
 * time (revocation, expiry) are the ones that hold.
 */

export const OFFLINE_GRANT_ALGORITHM = 'ES256';

/** The roles that may hold a grant. Global roles (system admin) and patients never do. */
export const OFFLINE_GRANT_ROLES = ['DOCTOR', 'VOLUNTEER', 'MANAGER', 'DIRECTOR'] as const;

/** How an offline session was unlocked; stored with every audit event it caused. */
export const OFFLINE_UNLOCK_METHODS = ['webauthn', 'pin'] as const;
export type OfflineUnlockMethod = (typeof OFFLINE_UNLOCK_METHODS)[number];

/** Stamped on each outbox row queued in an offline session. */
export interface OfflineSessionStamp {
  grantId: string;
  deviceId: string;
  unlockMethod: OfflineUnlockMethod;
}

export interface OfflineGrantMembership {
  clinicId: string;
  clinicName: string;
  roles: string[];
  permissions: string[];
}

export interface OfflineGrantClaims {
  grantId: string;
  userId: string;
  displayName: string;
  deviceId: string;
  /** Always empty: an account with a global role is refused a grant. Kept for the whoami shape. */
  globalRoles: string[];
  memberships: OfflineGrantMembership[];
  /** ISO 8601, set by the server. */
  issuedAt: string;
  /** ISO 8601, set by the server. */
  expiresAt: string;
}

/** A public verification key, as served by `GET /auth/offline-grant/keys`. */
export interface OfflineGrantPublicKey {
  kid: string;
  /** P-256 public key as a JWK (`kty`, `crv`, `x`, `y`). */
  jwk: { kty: 'EC'; crv: 'P-256'; x: string; y: string };
}

export type OfflineGrantVerification =
  | { ok: true; claims: OfflineGrantClaims }
  | { ok: false; reason: 'malformed' | 'unknown-key' | 'bad-signature' | 'expired' };

export function base64UrlEncode(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlDecode(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function decodeJson(segment: string): unknown {
  return JSON.parse(new TextDecoder().decode(base64UrlDecode(segment)));
}

function isClaims(value: unknown): value is OfflineGrantClaims {
  const claims = value as Partial<OfflineGrantClaims> | null;
  return (
    !!claims &&
    typeof claims.grantId === 'string' &&
    typeof claims.userId === 'string' &&
    typeof claims.displayName === 'string' &&
    typeof claims.deviceId === 'string' &&
    Array.isArray(claims.memberships) &&
    typeof claims.issuedAt === 'string' &&
    typeof claims.expiresAt === 'string' &&
    !Number.isNaN(Date.parse(claims.expiresAt))
  );
}

/**
 * Verify a grant against the server's published keys and the device clock.
 *
 * The clock check is best effort: device clocks in the field are unreliable, which is why the
 * server checks expiry again against its own record when the queued writes arrive.
 */
export async function verifyOfflineGrant(
  token: string,
  keys: readonly OfflineGrantPublicKey[],
  now: Date = new Date(),
): Promise<OfflineGrantVerification> {
  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'malformed' };
  const [headerPart, payloadPart, signaturePart] = parts as [string, string, string];

  let header: { alg?: unknown; kid?: unknown };
  let claims: unknown;
  try {
    header = decodeJson(headerPart) as typeof header;
    claims = decodeJson(payloadPart);
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (header.alg !== OFFLINE_GRANT_ALGORITHM || !isClaims(claims)) {
    return { ok: false, reason: 'malformed' };
  }
  const key = keys.find((candidate) => candidate.kid === header.kid);
  if (!key) return { ok: false, reason: 'unknown-key' };

  const subtle = globalThis.crypto.subtle;
  const publicKey = await subtle.importKey(
    'jwk',
    { ...key.jwk, ext: true },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify'],
  );
  const valid = await subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    publicKey,
    base64UrlDecode(signaturePart),
    new TextEncoder().encode(`${headerPart}.${payloadPart}`),
  );
  if (!valid) return { ok: false, reason: 'bad-signature' };
  if (Date.parse(claims.expiresAt) <= now.getTime()) return { ok: false, reason: 'expired' };
  return { ok: true, claims };
}
