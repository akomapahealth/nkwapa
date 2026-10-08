import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  constants,
  createDecipheriv,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  privateDecrypt,
  type KeyObject,
} from 'crypto';
import { CLINICIAN_PLAN_SEAL_ALGORITHM, clinicianPlanSealAad } from '@nkwapa/db';

/**
 * Sealing a clinician plan queued offline (#131).
 *
 * The supervising clinician's plan is doctor-only, and the sync pull withholds it so that no device
 * caches it: IndexedDB is readable in devtools, and a shared clinic laptop is a shared outbox. A
 * plan a doctor queues without signal therefore cannot sit in the outbox in plain text either.
 *
 * The browser seals it to this server's public key instead: a fresh AES-256-GCM key encrypts the
 * plan, and RSA-OAEP (SHA-256) wraps that key. The device holds no key that opens it -- not the
 * doctor's own session, not anyone with devtools after them. Only this service can, and only for
 * the context it was sealed for: the clinic, encounter, condition and author are the GCM additional
 * authenticated data, so moving the envelope to another encounter, clinic or account fails to open.
 *
 * Keys: `CLINICIAN_PLAN_SEAL_PRIVATE_KEY` (PKCS#8 PEM, or the same base64-encoded) with
 * `CLINICIAN_PLAN_SEAL_KEY_ID`; during a rotation the previous pair stays as
 * `CLINICIAN_PLAN_SEAL_PREVIOUS_PRIVATE_KEY` / `_KEY_ID`, so plans sealed before it still open.
 * Outside production, with none configured, a key is generated at boot: a plan queued against it
 * cannot be opened after a restart, which is acceptable for development and CI and never for a
 * clinic. In production without a key, sealing is simply unavailable and the plan stays online-only.
 */

export const SEAL_ALGORITHM = CLINICIAN_PLAN_SEAL_ALGORITHM;
const GCM_TAG_BYTES = 16;

export interface SealedEnvelope {
  v: 1;
  alg: typeof SEAL_ALGORITHM;
  kid: string;
  /** The AES key, wrapped with RSA-OAEP. Base64. */
  ek: string;
  /** 12-byte GCM nonce. Base64. */
  iv: string;
  /** Ciphertext with the 16-byte GCM tag appended, as WebCrypto produces it. Base64. */
  ct: string;
}

/** What a sealed plan is bound to. Must match exactly what the browser sealed it with. */
export interface SealContext {
  clinicId: string;
  encounterId: string;
  condition: string;
  authorUserId: string;
}

/** The same additional data the browser sealed with, from the one shared definition. */
export function sealAdditionalData(context: SealContext): Buffer {
  return Buffer.from(clinicianPlanSealAad(context), 'utf8');
}

export class SealedPlanUnreadableError extends BadRequestException {
  constructor(reason: string) {
    super({
      code: 'SEALED_PLAN_UNREADABLE',
      message: 'This queued clinician plan could not be opened on the server.',
      reason,
      recoveryAction:
        'Open the encounter while online and record the plan again. The queued copy cannot be recovered.',
    });
  }
}

interface SealKey {
  kid: string;
  privateKey: KeyObject;
}

function readPrivateKey(raw: string): KeyObject {
  const pem = raw.includes('BEGIN') ? raw : Buffer.from(raw, 'base64').toString('utf8');
  return createPrivateKey({ key: pem.replace(/\\n/g, '\n'), format: 'pem' });
}

@Injectable()
export class ClinicianPlanSealService {
  private readonly logger = new Logger(ClinicianPlanSealService.name);
  private readonly keys: SealKey[];

  constructor() {
    this.keys = this.loadKeys(process.env);
  }

  /** Whether a queued plan can be sealed at all. False means the plan stays online-only. */
  isAvailable(): boolean {
    return this.keys.length > 0;
  }

  /** The current public key, for the browser to seal to. Not a secret. */
  publicKey(): { available: true; kid: string; alg: string; spki: string } | { available: false } {
    const current = this.keys[0];
    if (!current) return { available: false };
    const spki = createPublicKey(current.privateKey).export({ format: 'der', type: 'spki' });
    return {
      available: true,
      kid: current.kid,
      alg: SEAL_ALGORITHM,
      spki: spki.toString('base64'),
    };
  }

  /** Open an envelope sealed for `context`, or refuse it. Never returns partial plaintext. */
  open(envelope: unknown, context: SealContext): Record<string, unknown> {
    const sealed = this.parseEnvelope(envelope);
    const key = this.keys.find((candidate) => candidate.kid === sealed.kid);
    if (!key) throw new SealedPlanUnreadableError('UNKNOWN_KEY');

    let plaintext: Buffer;
    try {
      const aesKey = privateDecrypt(
        { key: key.privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
        Buffer.from(sealed.ek, 'base64'),
      );
      const iv = Buffer.from(sealed.iv, 'base64');
      const ctWithTag = Buffer.from(sealed.ct, 'base64');
      if (aesKey.length !== 32 || iv.length !== 12 || ctWithTag.length <= GCM_TAG_BYTES) {
        throw new Error('malformed');
      }
      const decipher = createDecipheriv('aes-256-gcm', aesKey, iv);
      decipher.setAAD(sealAdditionalData(context));
      decipher.setAuthTag(ctWithTag.subarray(ctWithTag.length - GCM_TAG_BYTES));
      plaintext = Buffer.concat([
        decipher.update(ctWithTag.subarray(0, ctWithTag.length - GCM_TAG_BYTES)),
        decipher.final(),
      ]);
    } catch {
      // Wrong key, tampered ciphertext, or sealed for a different clinic, encounter or author:
      // indistinguishable by design, and none of them is something a retry fixes.
      throw new SealedPlanUnreadableError('NOT_FOR_THIS_CONTEXT');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(plaintext.toString('utf8'));
    } catch {
      throw new SealedPlanUnreadableError('NOT_JSON');
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new SealedPlanUnreadableError('NOT_AN_OBJECT');
    }
    return parsed as Record<string, unknown>;
  }

  private parseEnvelope(envelope: unknown): SealedEnvelope {
    const value = envelope as Partial<SealedEnvelope> | null;
    if (
      !value ||
      value.v !== 1 ||
      value.alg !== SEAL_ALGORITHM ||
      typeof value.kid !== 'string' ||
      typeof value.ek !== 'string' ||
      typeof value.iv !== 'string' ||
      typeof value.ct !== 'string'
    ) {
      throw new SealedPlanUnreadableError('MALFORMED_ENVELOPE');
    }
    return value as SealedEnvelope;
  }

  private loadKeys(env: NodeJS.ProcessEnv): SealKey[] {
    const keys: SealKey[] = [];
    const add = (raw: string | undefined, kid: string | undefined, label: string) => {
      if (!raw?.trim()) return;
      if (!kid?.trim()) {
        this.logger.error(`${label} is set without a key id; it is ignored`);
        return;
      }
      try {
        keys.push({ kid: kid.trim(), privateKey: readPrivateKey(raw.trim()) });
      } catch {
        this.logger.error(`${label} could not be read as a PKCS#8 private key; it is ignored`);
      }
    };
    add(
      env.CLINICIAN_PLAN_SEAL_PRIVATE_KEY,
      env.CLINICIAN_PLAN_SEAL_KEY_ID,
      'CLINICIAN_PLAN_SEAL_PRIVATE_KEY',
    );
    add(
      env.CLINICIAN_PLAN_SEAL_PREVIOUS_PRIVATE_KEY,
      env.CLINICIAN_PLAN_SEAL_PREVIOUS_KEY_ID,
      'CLINICIAN_PLAN_SEAL_PREVIOUS_PRIVATE_KEY',
    );
    if (keys.length > 0) return keys;

    if (env.NODE_ENV === 'production' && env.CLINICIAN_PLAN_SEAL_EPHEMERAL !== 'true') {
      this.logger.warn(
        'No clinician plan seal key is configured; doctors can record the clinician plan online only',
      );
      return [];
    }
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 3072 });
    this.logger.warn(
      'Using a clinician plan seal key generated at boot; plans queued against it cannot be opened after a restart',
    );
    return [{ kid: `ephemeral-${Date.now().toString(36)}`, privateKey }];
  }
}
