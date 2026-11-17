import {
  verifyOfflineGrant,
  type OfflineGrantClaims,
  type OfflineGrantPublicKey,
} from '@nkwapa/db/offline-grant';
import { apiFetch, readApiError, type GetToken } from '../api';
import { db, type NkwapaDb, type OfflineIdentityRecord } from '../db';
import { DEVICE_ID_KEY, deviceIdSetting } from '../db-migrations';
import {
  PBKDF2_ITERATIONS,
  dataKeyFor,
  derivePinKey,
  derivePrfKey,
  dropDataKey,
  importDataKey,
  isAcceptablePin,
  loadDataKey,
  loadDeviceKeys,
  openText,
  randomBase64Url,
  sealText,
  wrapDataKey,
} from './keys';
import { enrollPasskey } from './webauthn';

/**
 * Fetching, checking and keeping this device's offline grant (#207).
 *
 * A grant is asked for only while online and signed in, and only on a device someone opted in on.
 * No Keycloak token is ever written here or anywhere else: what survives a restart is the signed
 * grant, sealed under the person's data key, and that key wrapped by their PIN or passkey.
 */

export const GRANT_REFRESH_INTERVAL_MS = 60 * 60 * 1000;

interface IssuedGrant {
  grant: string;
  claims: OfflineGrantClaims;
  /** Standard base64. */
  dataKey: string;
  /** This device's at-rest keys for this person, scope to base64 (see ./at-rest.ts). */
  deviceKeys: Record<string, string>;
  keys: OfflineGrantPublicKey[];
}

/** What is sealed under the data key: enough to verify the grant again on unlock. */
export interface SealedGrantContents {
  grant: string;
  keys: OfflineGrantPublicKey[];
  /** SHA-256 of the data key, to notice when the server's key root changed under this device. */
  keyCheck: string;
  /** The at-rest keys, so an offline unlock can read this device's clinical data. */
  deviceKeys: Record<string, string>;
}

export const grantAad = (userId: string) => `nkwapa-offline-grant/v1|${userId}`;

/** This browser profile's id, made on first use. */
export async function getDeviceId(store: NkwapaDb = db): Promise<string> {
  return store.transaction('rw', store.device_settings, async () => {
    const existing = await store.device_settings.get(DEVICE_ID_KEY);
    if (existing?.value) return existing.value;
    const setting = deviceIdSetting();
    await store.device_settings.put(setting);
    return setting.value;
  });
}

function decodeBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function keyCheckOf(raw: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', raw));
  return btoa(String.fromCharCode(...digest));
}

/**
 * Fetch and hold this device's at-rest keys for the signed-in person (#207): run after every
 * successful whoami, opted in or not, before anything clinical is written. `clinicId` matters only
 * for a system admin, who gets the clinic they are working in. Throws when the server refuses.
 */
export async function fetchDeviceKeys(getToken: GetToken, clinicId?: string | null): Promise<void> {
  const deviceId = await getDeviceId();
  const response = await apiFetch('/auth/device-keys', {
    method: 'POST',
    getToken,
    skipClinicHeader: true,
    body: JSON.stringify(clinicId ? { deviceId, clinicId } : { deviceId }),
  });
  if (!response.ok) throw await readApiError(response);
  const body = (await response.json()) as { keys: Record<string, string> };
  await loadDeviceKeys(body.keys);
}

export class OfflineGrantRefusedError extends Error {
  constructor(
    readonly status: number | null,
    readonly code: string | null,
  ) {
    super('Offline access was refused');
    this.name = 'OfflineGrantRefusedError';
  }
}

/** Ask the API for this device's grant and check it before trusting any of it. */
async function requestGrant(userId: string, getToken: GetToken): Promise<IssuedGrant> {
  const deviceId = await getDeviceId();
  const response = await apiFetch('/auth/offline-grant', {
    method: 'POST',
    getToken,
    skipClinicHeader: true,
    body: JSON.stringify({ deviceId }),
  });
  if (!response.ok) {
    const error = await readApiError(response);
    throw new OfflineGrantRefusedError(response.status, error.code);
  }
  const issued = (await response.json()) as IssuedGrant;
  const verified = await verifyOfflineGrant(issued.grant, issued.keys);
  if (!verified.ok || verified.claims.userId !== userId || verified.claims.deviceId !== deviceId) {
    throw new OfflineGrantRefusedError(null, 'OFFLINE_GRANT_UNVERIFIED');
  }
  return { ...issued, claims: verified.claims };
}

async function sealGrant(dataKey: CryptoKey, issued: IssuedGrant, keyCheck: string) {
  const contents: SealedGrantContents = {
    grant: issued.grant,
    keys: issued.keys,
    keyCheck,
    deviceKeys: issued.deviceKeys,
  };
  return sealText(dataKey, JSON.stringify(contents), grantAad(issued.claims.userId));
}

/**
 * Turn on "Use this device offline" for the signed-in person (R2, R4). The PIN is required: it is
 * the factor that works on every device, and the way back in if a passkey stops working. A passkey
 * is added when asked for and the authenticator supports PRF. Returns whether one was.
 */
export async function enableOfflineAccess(options: {
  userId: string;
  getToken: GetToken;
  pin: string;
  passkey?: boolean;
  now?: Date;
}): Promise<{ passkey: boolean }> {
  const { userId, getToken, pin, now = new Date() } = options;
  if (!isAcceptablePin(pin)) throw new Error('A PIN is 6 to 12 digits');
  const issued = await requestGrant(userId, getToken);
  const raw = decodeBase64(issued.dataKey);
  try {
    const dataKey = await importDataKey(raw);
    const salt = randomBase64Url(16);
    const pinRecord = {
      salt,
      iterations: PBKDF2_ITERATIONS,
      wrappedKey: await wrapDataKey(raw, await derivePinKey(pin, salt), userId),
    };
    let passkey: OfflineIdentityRecord['passkey'];
    if (options.passkey) {
      const enrolled = await enrollPasskey(userId, issued.claims.displayName);
      if (enrolled) {
        passkey = {
          ...enrolled.unlock,
          wrappedKey: await wrapDataKey(raw, await derivePrfKey(enrolled.prfOutput), userId),
        };
      }
    }
    const record: OfflineIdentityRecord = {
      userId,
      displayName: issued.claims.displayName,
      grantId: issued.claims.grantId,
      expiresAt: issued.claims.expiresAt,
      sealedGrant: await sealGrant(dataKey, issued, await keyCheckOf(raw)),
      pin: pinRecord,
      ...(passkey ? { passkey } : {}),
      failedAttempts: 0,
      lastRefreshedAt: now.toISOString(),
      createdAt: now.toISOString(),
    };
    await db.offline_identity.put(record);
    loadDataKey(userId, dataKey);
    await loadDeviceKeys(issued.deviceKeys);
    return { passkey: Boolean(passkey) };
  } finally {
    raw.fill(0);
  }
}

export type RefreshOutcome = 'not-enrolled' | 'fresh' | 'refreshed' | 'forgotten' | 'offline';

/**
 * Refresh the grant after a successful online sign-in, at most hourly, and load the data key so
 * this session can open and seal its own queued changes without unlocking (R1, R7).
 *
 * When the server refuses (signed out of offline devices, a role removed, now a system admin),
 * this device forgets the grant and wrapped key; queued changes stay, held for their owner.
 */
export async function refreshOfflineAccess(
  userId: string,
  getToken: GetToken,
  now = new Date(),
): Promise<RefreshOutcome> {
  const record = await db.offline_identity.get(userId);
  if (!record) return 'not-enrolled';
  if (
    dataKeyFor(userId) &&
    now.getTime() - Date.parse(record.lastRefreshedAt) < GRANT_REFRESH_INTERVAL_MS
  ) {
    return 'fresh';
  }

  let issued: IssuedGrant;
  try {
    issued = await requestGrant(userId, getToken);
  } catch (error) {
    if (
      error instanceof OfflineGrantRefusedError &&
      (error.status === 401 || error.status === 403 || error.code === 'OFFLINE_GRANT_UNVERIFIED')
    ) {
      await forgetOfflineIdentity(userId);
      return 'forgotten';
    }
    return 'offline';
  }

  const raw = decodeBase64(issued.dataKey);
  try {
    const keyCheck = await keyCheckOf(raw);
    const dataKey = await importDataKey(raw);
    const previous = record.sealedGrant;
    const sealedGrant = await sealGrant(dataKey, issued, keyCheck);
    const stillWrapped = await sealedUnderSameKey(dataKey, userId, previous, keyCheck);
    if (!stillWrapped) {
      // The server's key root changed, so the PIN and passkey wrap a key that no longer matches.
      // Setting offline access up again is the only way forward.
      await forgetOfflineIdentity(userId);
      loadDataKey(userId, dataKey);
      return 'forgotten';
    }
    await db.offline_identity.update(userId, {
      grantId: issued.claims.grantId,
      expiresAt: issued.claims.expiresAt,
      displayName: issued.claims.displayName,
      sealedGrant,
      lastRefreshedAt: now.toISOString(),
    });
    loadDataKey(userId, dataKey);
    await loadDeviceKeys(issued.deviceKeys);
    return 'refreshed';
  } finally {
    raw.fill(0);
  }
}

/** Whether the grant already on disk was sealed under this same data key. */
async function sealedUnderSameKey(
  dataKey: CryptoKey,
  userId: string,
  sealed: OfflineIdentityRecord['sealedGrant'],
  keyCheck: string,
): Promise<boolean> {
  try {
    const contents = JSON.parse(
      await openText(dataKey, sealed, grantAad(userId)),
    ) as SealedGrantContents;
    return contents.keyCheck === keyCheck;
  } catch {
    return false;
  }
}

/**
 * Remove this person's grant and wrapped key from the device. Their queued changes are not
 * touched: they stay held for them (#162) and send after they next sign in online.
 */
export async function forgetOfflineIdentity(userId: string): Promise<void> {
  await db.offline_identity.delete(userId);
  dropDataKey(userId);
}

/** Withdraw this device's grant on the server too, for "don't keep offline access" at sign-out. */
export async function revokeThisDevice(userId: string, getToken: GetToken): Promise<void> {
  const record = await db.offline_identity.get(userId);
  await forgetOfflineIdentity(userId);
  if (!record) return;
  try {
    await apiFetch(`/auth/offline-grants/${encodeURIComponent(record.grantId)}/revoke`, {
      method: 'POST',
      getToken,
      skipClinicHeader: true,
      body: JSON.stringify({ reason: 'SIGN_OUT' }),
    });
  } catch {
    // The device copy is already gone; the server's copy expires on its own.
  }
}

/** The people who could resume offline here now: an unexpired grant by the device clock. */
export async function usableOfflineIdentities(now = new Date()): Promise<
  Array<
    Pick<OfflineIdentityRecord, 'userId' | 'displayName' | 'expiresAt'> & {
      hasPasskey: boolean;
    }
  >
> {
  const rows = await db.offline_identity.toArray();
  return rows
    .filter((row) => Date.parse(row.expiresAt) > now.getTime())
    .map((row) => ({
      userId: row.userId,
      displayName: row.displayName,
      expiresAt: row.expiresAt,
      hasPasskey: Boolean(row.passkey),
    }));
}
