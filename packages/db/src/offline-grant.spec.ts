import {
  base64UrlDecode,
  base64UrlEncode,
  verifyOfflineGrant,
  type OfflineGrantPublicKey,
} from './offline-grant';

/** Sign with WebCrypto, as the API's tests sign with Node; both must agree with the verifier. */
async function signedGrant(claims: Record<string, unknown>, kid = 'k1') {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ]);
  const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  const encode = (value: unknown) =>
    base64UrlEncode(new TextEncoder().encode(JSON.stringify(value)));
  const input = `${encode({ alg: 'ES256', kid })}.${encode(claims)}`;
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    pair.privateKey,
    new TextEncoder().encode(input),
  );
  const key: OfflineGrantPublicKey = {
    kid,
    jwk: { kty: 'EC', crv: 'P-256', x: jwk.x as string, y: jwk.y as string },
  };
  return { token: `${input}.${base64UrlEncode(signature)}`, key };
}

const claims = {
  grantId: 'g1',
  userId: 'u1',
  displayName: 'Ama Mensah',
  deviceId: 'd1',
  globalRoles: [],
  memberships: [],
  issuedAt: '2026-11-16T10:00:00.000Z',
  expiresAt: '2026-11-19T10:00:00.000Z',
};
const now = new Date('2026-11-17T10:00:00.000Z');

describe('verifyOfflineGrant', () => {
  it('round-trips base64url, including bytes that need padding', () => {
    const bytes = new Uint8Array([0, 251, 255, 1]);
    expect([...base64UrlDecode(base64UrlEncode(bytes))]).toEqual([...bytes]);
    expect(base64UrlEncode(bytes)).not.toMatch(/[+/=]/);
  });

  it('accepts a grant signed by a published key', async () => {
    const { token, key } = await signedGrant(claims);
    await expect(verifyOfflineGrant(token, [key], now)).resolves.toEqual({ ok: true, claims });
  });

  it('refuses a key it was not given, garbage, and an expired grant', async () => {
    const { token, key } = await signedGrant(claims);
    await expect(verifyOfflineGrant(token, [{ ...key, kid: 'other' }], now)).resolves.toEqual({
      ok: false,
      reason: 'unknown-key',
    });
    await expect(verifyOfflineGrant('a.b', [key], now)).resolves.toEqual({
      ok: false,
      reason: 'malformed',
    });
    await expect(verifyOfflineGrant('!!.!!.!!', [key], now)).resolves.toEqual({
      ok: false,
      reason: 'malformed',
    });
    await expect(
      verifyOfflineGrant(token, [key], new Date('2026-11-19T10:00:00.000Z')),
    ).resolves.toEqual({ ok: false, reason: 'expired' });
  });

  it('refuses a token signed by a different key under the same id', async () => {
    const { token } = await signedGrant(claims);
    const { key: impostor } = await signedGrant(claims);
    await expect(verifyOfflineGrant(token, [impostor], now)).resolves.toEqual({
      ok: false,
      reason: 'bad-signature',
    });
  });
});
