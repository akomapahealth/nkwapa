import { base64UrlDecode, base64UrlEncode } from '@nkwapa/db/offline-grant';

/**
 * The keys behind offline session resume (#207). WebCrypto only, nothing third party.
 *
 * Each person has one data key (DEK) per device: AES-GCM-256, derived by the server and handed to
 * an authenticated online session of that person only. It encrypts their offline identity and the
 * payloads of the changes they queue. On disk it exists only wrapped by an unlock key:
 *
 *   - a key derived from their PIN (PBKDF2-SHA-256, 600,000 iterations, a random salt), or
 *   - a key derived from their passkey's PRF output (HKDF-SHA-256), so it never touches disk.
 *
 * Unwrapped, it lives in this tab's memory as a non-extractable CryptoKey, from unlock (or an
 * online sign-in that fetched it) until lock or sign-out. Nothing here logs a key, a PIN or what a
 * key opens.
 *
 * What this does not stop: a six-digit PIN has a million values, so anyone holding a copy of this
 * browser profile can try them all offline whatever the iteration count. The grant lifetime and
 * the server's refusal of revoked grants are what bound that. See
 * docs/security/offline-session-matrix.md.
 */

export const PBKDF2_ITERATIONS = 600_000;
export const PIN_MIN_LENGTH = 6;

/** AES-GCM ciphertext with its nonce, base64url. */
export interface SealedBlob {
  iv: string;
  ct: string;
}

// Made on use: some test environments (jsdom) load this module without a TextEncoder.
const encoder = { encode: (text: string) => new TextEncoder().encode(text) };
const subtle = () => globalThis.crypto.subtle;

export function randomBase64Url(bytes: number): string {
  return base64UrlEncode(globalThis.crypto.getRandomValues(new Uint8Array(bytes)));
}

/** A PIN this module accepts: digits only, at least six of them. */
export function isAcceptablePin(pin: string): boolean {
  return new RegExp(`^\\d{${PIN_MIN_LENGTH},12}$`).test(pin);
}

/** What a wrapped data key is bound to, so a wrapped key cannot be moved to another person. */
export const dataKeyAad = (userId: string) => `nkwapa-offline-dek/v1|${userId}`;

/** The unlock key a PIN gives. Slow on purpose, and still not enough on its own (see above). */
export async function derivePinKey(
  pin: string,
  salt: string,
  iterations = PBKDF2_ITERATIONS,
): Promise<CryptoKey> {
  const material = await subtle().importKey('raw', encoder.encode(pin), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return subtle().deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: base64UrlDecode(salt), iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'unwrapKey'],
  );
}

/** The unlock key a passkey's PRF output gives. */
export async function derivePrfKey(prfOutput: BufferSource): Promise<CryptoKey> {
  const material = await subtle().importKey('raw', prfOutput, 'HKDF', false, ['deriveKey']);
  return subtle().deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(0),
      info: encoder.encode('nkwapa-offline-kek/v1'),
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'unwrapKey'],
  );
}

/** Import the server's data key for use. Not extractable: nothing can read it back out. */
export function importDataKey(raw: BufferSource): Promise<CryptoKey> {
  return subtle().importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

/** Wrap the raw data key under an unlock key. The caller zeroes `raw` afterwards. */
export async function wrapDataKey(
  raw: Uint8Array<ArrayBuffer>,
  unlockKey: CryptoKey,
  userId: string,
): Promise<SealedBlob> {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ct = await subtle().encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(dataKeyAad(userId)) },
    unlockKey,
    raw,
  );
  return { iv: base64UrlEncode(iv), ct: base64UrlEncode(ct) };
}

/** Unwrap the data key straight into a non-extractable key. Throws on a wrong unlock key. */
export function unwrapDataKey(
  wrapped: SealedBlob,
  unlockKey: CryptoKey,
  userId: string,
): Promise<CryptoKey> {
  return subtle().unwrapKey(
    'raw',
    base64UrlDecode(wrapped.ct),
    unlockKey,
    {
      name: 'AES-GCM',
      iv: base64UrlDecode(wrapped.iv),
      additionalData: encoder.encode(dataKeyAad(userId)),
    },
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function sealText(key: CryptoKey, text: string, aad: string): Promise<SealedBlob> {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ct = await subtle().encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(aad) },
    key,
    encoder.encode(text),
  );
  return { iv: base64UrlEncode(iv), ct: base64UrlEncode(ct) };
}

/** Throws if the key is wrong, the ciphertext was changed, or it was sealed for other `aad`. */
export async function openText(key: CryptoKey, sealed: SealedBlob, aad: string): Promise<string> {
  const plain = await subtle().decrypt(
    { name: 'AES-GCM', iv: base64UrlDecode(sealed.iv), additionalData: encoder.encode(aad) },
    key,
    base64UrlDecode(sealed.ct),
  );
  return new TextDecoder().decode(plain);
}

/*
  The keyring, in this tab's memory only: each unlocked person's data key (`dek:<userId>`), which
  opens their offline identity, and the device keys (`clinic:<id>`, `user:<id>`) that the local copy
  of clinical data is encrypted with (see ./at-rest.ts).
*/

const keyring = new Map<string, CryptoKey>();
const keyringListeners = new Set<(scope: string, loaded: boolean) => void>();

function setKey(scope: string, key: CryptoKey): void {
  keyring.set(scope, key);
  keyringListeners.forEach((listener) => listener(scope, true));
}

function dropKey(scope: string): void {
  if (!keyring.delete(scope)) return;
  keyringListeners.forEach((listener) => listener(scope, false));
}

export function loadDataKey(userId: string, key: CryptoKey): void {
  setKey(`dek:${userId}`, key);
}

export function dropDataKey(userId: string): void {
  dropKey(`dek:${userId}`);
}

export function dataKeyFor(userId: string | null | undefined): CryptoKey | undefined {
  return userId ? keyring.get(`dek:${userId}`) : undefined;
}

/** Import the server's device keys (scope to base64) as non-extractable keys and hold them. */
export async function loadDeviceKeys(raw: Record<string, string>): Promise<void> {
  for (const [scope, value] of Object.entries(raw)) {
    if (!/^(clinic|user):[\w-]+$/.test(scope)) continue;
    const bytes = Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
    if (bytes.length !== 32) continue;
    setKey(scope, await importDataKey(bytes));
    bytes.fill(0);
  }
}

export function deviceKeyFor(scope: string): CryptoKey | undefined {
  return scope.startsWith('dek:') ? undefined : keyring.get(scope);
}

/** Lock and sign-out: every key leaves memory, and with them every readable local row. */
export function dropAllKeys(): void {
  [...keyring.keys()].forEach(dropKey);
}

export function onKeyringChange(listener: (scope: string, loaded: boolean) => void): () => void {
  keyringListeners.add(listener);
  return () => {
    keyringListeners.delete(listener);
  };
}
