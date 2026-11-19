import { verifyOfflineGrant, type OfflineGrantClaims } from '@nkwapa/db/offline-grant';
import { db, type NkwapaDb } from '../db';
import { grantAad, type SealedGrantContents } from './grant';
import {
  derivePinKey,
  derivePrfKey,
  dropAllKeys,
  dropDataKey,
  loadDataKey,
  loadDeviceKeys,
  openText,
  unwrapDataKey,
} from './keys';
import { assertPasskey } from './webauthn';

/**
 * Unlocking an offline session (#207, R4), and locking it again.
 *
 * Five wrong unlocks delete that person's grant and wrapped key from the device. Their queued
 * changes are never touched: they stay held for them (#162) and send once they sign in online.
 * The counter lives on the device, so it stops a guessing passer-by, not someone with devtools;
 * against them the PIN's strength, the grant lifetime and server-side revocation are what count.
 */

export const MAX_UNLOCK_ATTEMPTS = 5;

export type UnlockMethod = 'pin' | 'webauthn';

export type UnlockResult =
  | { ok: true; claims: OfflineGrantClaims; unlockMethod: UnlockMethod }
  | {
      ok: false;
      reason:
        | 'no-identity'
        | 'expired'
        | 'wrong-pin'
        | 'locked-out'
        | 'passkey-unavailable'
        | 'invalid-grant';
      attemptsLeft?: number;
    };

/** Open the sealed grant with the unwrapped key and check it, as the API signed it. */
async function openGrant(
  store: NkwapaDb,
  userId: string,
  dataKey: CryptoKey,
  unlockMethod: UnlockMethod,
  now: Date,
): Promise<UnlockResult> {
  const record = await store.offline_identity.get(userId);
  if (!record) return { ok: false, reason: 'no-identity' };
  let contents: SealedGrantContents;
  try {
    contents = JSON.parse(
      await openText(dataKey, record.sealedGrant, grantAad(userId)),
    ) as SealedGrantContents;
  } catch {
    return { ok: false, reason: 'invalid-grant' };
  }
  const verified = await verifyOfflineGrant(contents.grant, contents.keys, now);
  if (!verified.ok) {
    return { ok: false, reason: verified.reason === 'expired' ? 'expired' : 'invalid-grant' };
  }
  if (verified.claims.userId !== userId) return { ok: false, reason: 'invalid-grant' };
  await store.offline_identity.update(userId, { failedAttempts: 0 });
  loadDataKey(userId, dataKey);
  await loadDeviceKeys(contents.deviceKeys ?? {});
  return { ok: true, claims: verified.claims, unlockMethod };
}

async function recordWrongUnlock(store: NkwapaDb, userId: string): Promise<UnlockResult> {
  const record = await store.offline_identity.get(userId);
  if (!record) return { ok: false, reason: 'no-identity' };
  const failedAttempts = record.failedAttempts + 1;
  if (failedAttempts >= MAX_UNLOCK_ATTEMPTS) {
    // The grant and wrapped key only. Not the outbox.
    await store.offline_identity.delete(userId);
    dropDataKey(userId);
    return { ok: false, reason: 'locked-out', attemptsLeft: 0 };
  }
  await store.offline_identity.update(userId, { failedAttempts });
  return { ok: false, reason: 'wrong-pin', attemptsLeft: MAX_UNLOCK_ATTEMPTS - failedAttempts };
}

async function expiredOrMissing(store: NkwapaDb, userId: string, now: Date) {
  const record = await store.offline_identity.get(userId);
  if (!record) return { record: null, result: { ok: false, reason: 'no-identity' } as const };
  if (Date.parse(record.expiresAt) <= now.getTime()) {
    return { record: null, result: { ok: false, reason: 'expired' } as const };
  }
  return { record, result: null };
}

export async function unlockWithPin(
  userId: string,
  pin: string,
  now = new Date(),
  store: NkwapaDb = db,
): Promise<UnlockResult> {
  const { record, result } = await expiredOrMissing(store, userId, now);
  if (!record) return result;
  if (!record.pin) return { ok: false, reason: 'no-identity' };
  let dataKey: CryptoKey;
  try {
    const pinKey = await derivePinKey(pin, record.pin.salt, record.pin.iterations);
    dataKey = await unwrapDataKey(record.pin.wrappedKey, pinKey, userId);
  } catch {
    return recordWrongUnlock(store, userId);
  }
  return openGrant(store, userId, dataKey, 'pin', now);
}

/**
 * Unlock with the passkey. Cancelling the prompt is not a wrong attempt; a PRF output that does
 * not open the key is (it means a different credential answered).
 */
export async function unlockWithPasskey(
  userId: string,
  now = new Date(),
  store: NkwapaDb = db,
): Promise<UnlockResult> {
  const { record, result } = await expiredOrMissing(store, userId, now);
  if (!record) return result;
  if (!record.passkey) return { ok: false, reason: 'passkey-unavailable' };
  let prfOutput: ArrayBuffer | null;
  try {
    prfOutput = await assertPasskey(record.passkey);
  } catch {
    return { ok: false, reason: 'passkey-unavailable' };
  }
  if (!prfOutput) return { ok: false, reason: 'passkey-unavailable' };
  let dataKey: CryptoKey;
  try {
    dataKey = await unwrapDataKey(record.passkey.wrappedKey, await derivePrfKey(prfOutput), userId);
  } catch {
    return recordWrongUnlock(store, userId);
  }
  return openGrant(store, userId, dataKey, 'webauthn', now);
}

/**
 * Lock: the session pauses at the unlock screen and nothing is deleted (idle lock, R2). Every key
 * leaves memory, so nothing clinical on the device can be read until the next unlock.
 */
export function lockOfflineSession(): void {
  dropAllKeys();
}
