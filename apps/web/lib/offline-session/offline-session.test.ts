import { base64UrlEncode, type OfflineGrantPublicKey } from '@nkwapa/db/offline-grant';
import { FakeTable } from '../testing/fake-sync-db';

jest.mock('../db', () => {
  const { FakeTable: Table } = jest.requireActual('../testing/fake-sync-db');
  const fake = {
    outbox: new Table(),
    offline_identity: new Table('userId'),
    device_settings: new Table('key'),
    transaction: (_mode: string, _tables: unknown, work: () => unknown) => work(),
  };
  return { db: fake };
});
jest.mock('../api', () => ({
  apiFetch: jest.fn(),
  readApiError: jest.fn(async (response: { status: number; body?: { code?: string } }) => ({
    code: response.body?.code ?? null,
  })),
}));
jest.mock('./webauthn', () => ({ enrollPasskey: jest.fn(), assertPasskey: jest.fn() }));

import { db } from '../db';
import { apiFetch } from '../api';
import { assertPasskey, enrollPasskey } from './webauthn';
import {
  enableOfflineAccess,
  forgetOfflineIdentity,
  getDeviceId,
  refreshOfflineAccess,
  usableOfflineIdentities,
} from './grant';
import { dataKeyFor, deviceKeyFor, dropAllKeys } from './keys';
import {
  MAX_UNLOCK_ATTEMPTS,
  lockOfflineSession,
  unlockWithPasskey,
  unlockWithPin,
} from './unlock';

/**
 * The offline grant on the device (#207), end to end through the module: opt in, lock, unlock with
 * the PIN or a passkey, lock out, refresh and forget. The API is a stand-in that signs real ES256
 * grants, so every check runs against the same verifier a device does.
 */

const fakeDb = db as unknown as {
  outbox: FakeTable;
  offline_identity: FakeTable;
  device_settings: FakeTable;
};
const fetchMock = apiFetch as jest.Mock;
const USER = 'user-1';
const PIN = '482913';
const HOUR = 3_600_000;

let signer: CryptoKeyPair;
let publicKey: OfflineGrantPublicKey;
let dataKey: Uint8Array;
const clinicKey = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));

async function signGrant(claims: Record<string, unknown>) {
  const encode = (value: unknown) =>
    base64UrlEncode(new TextEncoder().encode(JSON.stringify(value)));
  const input = `${encode({ alg: 'ES256', kid: 'k1' })}.${encode(claims)}`;
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    signer.privateKey,
    new TextEncoder().encode(input),
  );
  return `${input}.${base64UrlEncode(signature)}`;
}

/** The server's answer for this device, valid from `issuedAt` for `ttlHours`. */
async function serverIssues(
  options: { userId?: string; issuedAt?: Date; ttlHours?: number; key?: Uint8Array } = {},
) {
  const issuedAt = options.issuedAt ?? new Date();
  const claims = {
    grantId: '9c7d3f1e-2b4a-4c5d-8e6f-7a8b9c0d1e2f',
    userId: options.userId ?? USER,
    displayName: 'Ama Mensah',
    deviceId: await getDeviceId(),
    globalRoles: [],
    memberships: [
      { clinicId: 'clinic-1', clinicName: 'Test Clinic', roles: ['DOCTOR'], permissions: [] },
    ],
    issuedAt: issuedAt.toISOString(),
    expiresAt: new Date(issuedAt.getTime() + (options.ttlHours ?? 72) * HOUR).toISOString(),
  };
  const body = {
    grant: await signGrant(claims),
    claims,
    dataKey: btoa(String.fromCharCode(...(options.key ?? dataKey))),
    deviceKeys: { 'clinic:clinic-1': clinicKey },
    keys: [publicKey],
  };
  fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => body });
  return body;
}

function serverRefuses(status: number, code: string) {
  fetchMock.mockResolvedValueOnce({ ok: false, status, body: { code } });
}

beforeAll(async () => {
  signer = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ]);
  const jwk = await crypto.subtle.exportKey('jwk', signer.publicKey);
  publicKey = { kid: 'k1', jwk: { kty: 'EC', crv: 'P-256', x: jwk.x!, y: jwk.y! } };
});

beforeEach(() => {
  fakeDb.outbox.rows.clear();
  fakeDb.offline_identity.rows.clear();
  fakeDb.device_settings.rows.clear();
  fetchMock.mockReset();
  (enrollPasskey as jest.Mock).mockReset();
  (assertPasskey as jest.Mock).mockReset();
  dropAllKeys();
  dataKey = crypto.getRandomValues(new Uint8Array(32));
});

const getToken = async () => 'live-token';
const store = db as never;

async function optIn(passkey = false) {
  const issued = await serverIssues();
  const result = await enableOfflineAccess({ userId: USER, getToken, pin: PIN, passkey });
  return { issued, result };
}

describe('opting in', () => {
  it('keeps the signed grant and wrapped key, never a token, a raw key or the PIN', async () => {
    const { issued } = await optIn();
    const stored = JSON.stringify(fakeDb.offline_identity.rows.get(USER));

    expect(stored).not.toContain('live-token');
    expect(stored).not.toContain(issued.dataKey);
    expect(stored).not.toContain(PIN);
    // The grant itself is sealed, not readable: only the name and expiry are in the clear.
    expect(stored).not.toContain(issued.grant.split('.')[1]);
    expect(stored).toContain('Ama Mensah');
    expect(dataKeyFor(USER)).toBeDefined();
  });

  it('refuses a grant issued for another person', async () => {
    await serverIssues({ userId: 'user-2' });
    await expect(enableOfflineAccess({ userId: USER, getToken, pin: PIN })).rejects.toMatchObject({
      code: 'OFFLINE_GRANT_UNVERIFIED',
    });
    expect(fakeDb.offline_identity.rows.size).toBe(0);
  });

  it('refuses a short PIN before asking the server anything', async () => {
    await expect(enableOfflineAccess({ userId: USER, getToken, pin: '1234' })).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('adds a passkey only when the authenticator gives a PRF output', async () => {
    (enrollPasskey as jest.Mock).mockResolvedValueOnce(null);
    expect((await optIn(true)).result).toEqual({ passkey: false });
    expect(fakeDb.offline_identity.rows.get(USER)!.passkey).toBeUndefined();
  });
});

describe('unlocking', () => {
  it('unlocks with the PIN after a lock, and loads the key back', async () => {
    await optIn();
    lockOfflineSession();
    expect(dataKeyFor(USER)).toBeUndefined();

    const result = await unlockWithPin(USER, PIN, new Date(), store);

    expect(result).toMatchObject({ ok: true, unlockMethod: 'pin', claims: { userId: USER } });
    expect(dataKeyFor(USER)).toBeDefined();
    // The clinic's at-rest key comes back from the sealed grant, so offline data is readable.
    expect(deviceKeyFor('clinic:clinic-1')).toBeDefined();
  });

  it('keeps the at-rest keys out of the clear on disk, and out of memory once locked', async () => {
    await optIn();
    expect(JSON.stringify(fakeDb.offline_identity.rows.get(USER))).not.toContain(clinicKey);
    expect(deviceKeyFor('clinic:clinic-1')).toBeDefined();
    lockOfflineSession();
    expect(deviceKeyFor('clinic:clinic-1')).toBeUndefined();
  });

  it('locks out after five wrong PINs, deleting the grant and key but not the outbox', async () => {
    await optIn();
    lockOfflineSession();
    await fakeDb.outbox.put({ id: 'queued-1', ownerUserId: USER, payloadJson: '{}' });

    for (let attempt = 1; attempt < MAX_UNLOCK_ATTEMPTS; attempt += 1) {
      expect(await unlockWithPin(USER, '000000', new Date(), store)).toEqual({
        ok: false,
        reason: 'wrong-pin',
        attemptsLeft: MAX_UNLOCK_ATTEMPTS - attempt,
      });
    }
    expect(await unlockWithPin(USER, '000000', new Date(), store)).toMatchObject({
      ok: false,
      reason: 'locked-out',
    });

    expect(fakeDb.offline_identity.rows.has(USER)).toBe(false);
    expect(fakeDb.outbox.rows.has('queued-1')).toBe(true);
    expect(await unlockWithPin(USER, PIN, new Date(), store)).toMatchObject({
      reason: 'no-identity',
    });
  });

  it('resets the count after a right PIN', async () => {
    await optIn();
    await unlockWithPin(USER, '000000', new Date(), store);
    await unlockWithPin(USER, PIN, new Date(), store);
    expect(fakeDb.offline_identity.rows.get(USER)!.failedAttempts).toBe(0);
  });

  it('offers nothing once the grant has expired, and counts no attempt', async () => {
    await optIn();
    const later = new Date(Date.now() + 73 * HOUR);
    expect(await usableOfflineIdentities(later)).toEqual([]);
    expect(await unlockWithPin(USER, PIN, later, store)).toEqual({ ok: false, reason: 'expired' });
    expect(fakeDb.offline_identity.rows.get(USER)!.failedAttempts).toBe(0);
  });

  it('refuses a grant whose clear-text expiry was pushed out by hand', async () => {
    await optIn();
    const row = fakeDb.offline_identity.rows.get(USER)!;
    row.expiresAt = '2099-01-01T00:00:00.000Z';
    const later = new Date(Date.now() + 73 * HOUR);
    // The signed expiry inside the sealed grant decides.
    expect(await unlockWithPin(USER, PIN, later, store)).toEqual({ ok: false, reason: 'expired' });
  });

  it('unlocks with the passkey, and treats a cancelled prompt as no attempt', async () => {
    const prfOutput = crypto.getRandomValues(new Uint8Array(32)).buffer;
    (enrollPasskey as jest.Mock).mockResolvedValueOnce({
      unlock: { credentialId: 'cred', prfSalt: 'salt' },
      prfOutput,
    });
    await optIn(true);
    lockOfflineSession();

    (assertPasskey as jest.Mock).mockRejectedValueOnce(new Error('NotAllowedError'));
    expect(await unlockWithPasskey(USER, new Date(), store)).toEqual({
      ok: false,
      reason: 'passkey-unavailable',
    });
    expect(fakeDb.offline_identity.rows.get(USER)!.failedAttempts).toBe(0);

    (assertPasskey as jest.Mock).mockResolvedValueOnce(prfOutput);
    expect(await unlockWithPasskey(USER, new Date(), store)).toMatchObject({
      ok: true,
      unlockMethod: 'webauthn',
    });
  });

  it('counts a passkey whose output does not open the key as a wrong attempt', async () => {
    (enrollPasskey as jest.Mock).mockResolvedValueOnce({
      unlock: { credentialId: 'cred', prfSalt: 'salt' },
      prfOutput: crypto.getRandomValues(new Uint8Array(32)).buffer,
    });
    await optIn(true);
    (assertPasskey as jest.Mock).mockResolvedValueOnce(
      crypto.getRandomValues(new Uint8Array(32)).buffer,
    );
    expect(await unlockWithPasskey(USER, new Date(), store)).toMatchObject({
      reason: 'wrong-pin',
    });
  });
});

describe('refreshing while online', () => {
  it('does nothing for a person who never opted in', async () => {
    expect(await refreshOfflineAccess(USER, getToken)).toBe('not-enrolled');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refreshes at most hourly while the key is loaded', async () => {
    await optIn();
    expect(await refreshOfflineAccess(USER, getToken)).toBe('fresh');
    await serverIssues();
    expect(await refreshOfflineAccess(USER, getToken, new Date(Date.now() + 2 * HOUR))).toBe(
      'refreshed',
    );
  });

  it('forgets the grant when the server refuses, keeping queued changes', async () => {
    await optIn();
    await fakeDb.outbox.put({ id: 'queued-1', ownerUserId: USER, payloadJson: '{}' });
    serverRefuses(403, 'OFFLINE_SESSION_NOT_ALLOWED');

    expect(await refreshOfflineAccess(USER, getToken, new Date(Date.now() + 2 * HOUR))).toBe(
      'forgotten',
    );
    expect(fakeDb.offline_identity.rows.has(USER)).toBe(false);
    expect(fakeDb.outbox.rows.has('queued-1')).toBe(true);
  });

  it('keeps the grant when the server is merely unreachable', async () => {
    await optIn();
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    expect(await refreshOfflineAccess(USER, getToken, new Date(Date.now() + 2 * HOUR))).toBe(
      'offline',
    );
    expect(fakeDb.offline_identity.rows.has(USER)).toBe(true);
  });

  it('forgets a grant whose wrapped key the server no longer matches', async () => {
    await optIn();
    await serverIssues({ key: crypto.getRandomValues(new Uint8Array(32)) });
    expect(await refreshOfflineAccess(USER, getToken, new Date(Date.now() + 2 * HOUR))).toBe(
      'forgotten',
    );
    expect(fakeDb.offline_identity.rows.has(USER)).toBe(false);
  });

  it('forgets on request without touching the outbox', async () => {
    await optIn();
    await fakeDb.outbox.put({ id: 'queued-1', ownerUserId: USER, payloadJson: '{}' });
    await forgetOfflineIdentity(USER);
    expect(dataKeyFor(USER)).toBeUndefined();
    expect(fakeDb.outbox.rows.has('queued-1')).toBe(true);
  });
});

it('makes one device id and keeps it', async () => {
  const first = await getDeviceId(db as never);
  expect(await getDeviceId(db as never)).toBe(first);
});
