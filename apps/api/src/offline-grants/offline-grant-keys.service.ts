import { Injectable, Logger } from '@nestjs/common';
import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  hkdfSync,
  randomBytes,
  sign,
  type KeyObject,
} from 'crypto';
import {
  OFFLINE_GRANT_ALGORITHM,
  base64UrlEncode,
  type OfflineGrantClaims,
  type OfflineGrantPublicKey,
} from '@nkwapa/db';

/**
 * The two keys behind offline session resume (#207).
 *
 * **Signing key** (ES256, P-256): signs each grant. `OFFLINE_GRANT_SIGNING_KEY` (PKCS#8 PEM, or the
 * same base64-encoded) with `OFFLINE_GRANT_KEY_ID`. During a rotation the retired pair stays as
 * `OFFLINE_GRANT_PREVIOUS_SIGNING_KEY` / `_KEY_ID` for one grant lifetime, so grants already on
 * devices still verify. Its public half is published; it is not a secret.
 *
 * **DEK root** (`OFFLINE_DEK_ROOT_KEY`, at least 32 random bytes, base64): every device's keys are
 * derived from it, so nothing is stored and recovery is asking again: the data key per person and
 * device, and the at-rest keys per device and clinic or person that encrypt every device's local
 * copy of clinical data. Whoever holds it can open that copy on any device, the same trust as the
 * database itself. It is never rotated in place: a new root changes every derived key and leaves
 * every device's local data, queued writes included, unreadable. A rotation needs a version bump
 * in the derivation and a release that reads both.
 *
 * Outside production, with none configured, both are generated at boot. A device that opted in
 * against them must opt in again after a restart, which is fine for development and CI and never
 * for a clinic. In production without them, offline access is simply unavailable.
 */

const DEK_INFO_PREFIX = 'nkwapa-offline-dek/v1/';
const DEVICE_KEY_INFO_PREFIX = 'nkwapa-device-key/v1/';

interface SigningKey {
  kid: string;
  privateKey: KeyObject;
}

function readPrivateKey(raw: string): KeyObject {
  const pem = raw.includes('BEGIN') ? raw : Buffer.from(raw, 'base64').toString('utf8');
  return createPrivateKey({ key: pem.replace(/\\n/g, '\n'), format: 'pem' });
}

@Injectable()
export class OfflineGrantKeysService {
  private readonly logger = new Logger(OfflineGrantKeysService.name);
  private readonly signingKeys: SigningKey[];
  private readonly dekRoot: Buffer | null;

  constructor() {
    const env = process.env;
    const ephemeral =
      env.NODE_ENV !== 'production' || env.OFFLINE_SESSION_EPHEMERAL_KEYS === 'true';
    this.signingKeys = this.loadSigningKeys(env, ephemeral);
    this.dekRoot = this.loadDekRoot(env, ephemeral);
  }

  isAvailable(): boolean {
    return this.signingKeys.length > 0 && this.dekRoot !== null;
  }

  /** Every key a grant on a device may have been signed with, current first. */
  publicKeys(): OfflineGrantPublicKey[] {
    return this.signingKeys.map(({ kid, privateKey }) => {
      const jwk = createPublicKey(privateKey).export({ format: 'jwk' });
      return {
        kid,
        jwk: { kty: 'EC', crv: 'P-256', x: String(jwk.x), y: String(jwk.y) },
      };
    });
  }

  /** A compact JWS over the claims, with the current key. */
  sign(claims: OfflineGrantClaims): string {
    const current = this.signingKeys[0];
    if (!current) throw new Error('No offline grant signing key is configured');
    const encode = (value: unknown) => base64UrlEncode(Buffer.from(JSON.stringify(value), 'utf8'));
    const signingInput = `${encode({ alg: OFFLINE_GRANT_ALGORITHM, typ: 'JWT', kid: current.kid })}.${encode(claims)}`;
    // ieee-p1363 is the raw r||s form JWS and WebCrypto use, not DER.
    const signature = sign('sha256', Buffer.from(signingInput, 'utf8'), {
      key: current.privateKey,
      dsaEncoding: 'ieee-p1363',
    });
    return `${signingInput}.${base64UrlEncode(signature)}`;
  }

  /**
   * This person's data key on this device: 32 bytes for AES-GCM-256. The same inputs always give
   * the same key, which is the escrow: a person who forgot their PIN signs in and asks again.
   */
  deriveDataKey(userId: string, deviceId: string): Buffer {
    if (!this.dekRoot) throw new Error('No offline data key root is configured');
    return Buffer.from(
      hkdfSync('sha256', this.dekRoot, Buffer.from(deviceId, 'utf8'), DEK_INFO_PREFIX + userId, 32),
    );
  }

  /**
   * The key a device encrypts its local copy of `scope` with (`clinic:<id>` or `user:<id>`), from
   * the same root. Stable per device, so a person who signs in again reads what they left queued.
   */
  deriveDeviceKey(deviceId: string, scope: string): Buffer {
    if (!this.dekRoot) throw new Error('No offline data key root is configured');
    return Buffer.from(
      hkdfSync(
        'sha256',
        this.dekRoot,
        Buffer.from(deviceId, 'utf8'),
        DEVICE_KEY_INFO_PREFIX + scope,
        32,
      ),
    );
  }

  private loadSigningKeys(env: NodeJS.ProcessEnv, ephemeral: boolean): SigningKey[] {
    const keys: SigningKey[] = [];
    const add = (raw: string | undefined, kid: string | undefined, label: string) => {
      if (!raw?.trim()) return;
      if (!kid?.trim()) {
        this.logger.error(`${label} is set without a key id; it is ignored`);
        return;
      }
      try {
        const privateKey = readPrivateKey(raw.trim());
        if (privateKey.asymmetricKeyType !== 'ec') throw new Error('not EC');
        keys.push({ kid: kid.trim(), privateKey });
      } catch {
        this.logger.error(
          `${label} could not be read as a P-256 PKCS#8 private key; it is ignored`,
        );
      }
    };
    add(env.OFFLINE_GRANT_SIGNING_KEY, env.OFFLINE_GRANT_KEY_ID, 'OFFLINE_GRANT_SIGNING_KEY');
    add(
      env.OFFLINE_GRANT_PREVIOUS_SIGNING_KEY,
      env.OFFLINE_GRANT_PREVIOUS_KEY_ID,
      'OFFLINE_GRANT_PREVIOUS_SIGNING_KEY',
    );
    if (keys.length > 0) return keys;
    if (!ephemeral) {
      this.logger.warn('No offline grant signing key is configured; offline access is unavailable');
      return [];
    }
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    this.logger.warn(
      'Using an offline grant signing key generated at boot; devices must opt in again after a restart',
    );
    return [{ kid: `ephemeral-${Date.now().toString(36)}`, privateKey }];
  }

  private loadDekRoot(env: NodeJS.ProcessEnv, ephemeral: boolean): Buffer | null {
    const raw = env.OFFLINE_DEK_ROOT_KEY?.trim();
    if (raw) {
      const root = Buffer.from(raw, 'base64');
      if (root.length >= 32) return root;
      this.logger.error('OFFLINE_DEK_ROOT_KEY must be at least 32 bytes of base64; it is ignored');
    }
    if (!ephemeral) {
      if (!raw) {
        this.logger.warn('No offline data key root is configured; offline access is unavailable');
      }
      return null;
    }
    return randomBytes(32);
  }
}
