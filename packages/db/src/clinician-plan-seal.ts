/**
 * Sealing a clinician plan a doctor queues without signal (#131): the browser half.
 *
 * Shared with the API so both sides build the envelope and its additional authenticated data from
 * one definition. The server opens it in `ClinicianPlanSealService`; see that file for why a
 * queued plan is sealed at all.
 *
 * Uses WebCrypto only (`globalThis.crypto.subtle`), present in every supported browser and in
 * Node 20, so the API's tests seal with exactly the code a doctor's device runs.
 */

export const CLINICIAN_PLAN_SEAL_ALGORITHM = 'RSA-OAEP-256+A256GCM';

export type ClinicianPlanCondition = 'HYPERTENSION' | 'DIABETES';

/** What a sealed plan is bound to. The server opens it only for exactly this. */
export interface ClinicianPlanSealContext {
  clinicId: string;
  encounterId: string;
  condition: ClinicianPlanCondition | string;
  authorUserId: string;
}

export interface ClinicianPlanSealKey {
  kid: string;
  /** SubjectPublicKeyInfo, DER, base64. */
  spki: string;
}

export interface SealedClinicianPlan {
  v: 1;
  alg: typeof CLINICIAN_PLAN_SEAL_ALGORITHM;
  kid: string;
  ek: string;
  iv: string;
  ct: string;
}

/** The GCM additional authenticated data. Changing this breaks every queued plan. */
export function clinicianPlanSealAad(context: ClinicianPlanSealContext): string {
  return [
    'nkwapa-clinician-plan-v1',
    context.clinicId,
    context.encounterId,
    context.condition,
    context.authorUserId,
  ].join('|');
}

const toBase64 = (bytes: ArrayBuffer | Uint8Array): string => {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary);
};

const fromBase64 = (value: string): ArrayBuffer => {
  const binary = atob(value);
  const buffer = new ArrayBuffer(binary.length);
  const view = new Uint8Array(buffer);
  for (let index = 0; index < binary.length; index += 1) view[index] = binary.charCodeAt(index);
  return buffer;
};

/**
 * Seal `plan` so that only the server can read it, and only for `context`.
 *
 * Nothing that could open it is kept: the AES key is generated, used once and wrapped with the
 * server's public key, and the wrapped copy is useless without the server's private key.
 */
export async function sealClinicianPlan(
  key: ClinicianPlanSealKey,
  plan: Record<string, unknown>,
  context: ClinicianPlanSealContext,
): Promise<SealedClinicianPlan> {
  const subtle = globalThis.crypto.subtle;
  const publicKey = await subtle.importKey(
    'spki',
    fromBase64(key.spki),
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['wrapKey'],
  );
  const aesKey = await subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt']);
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
      additionalData: new TextEncoder().encode(clinicianPlanSealAad(context)),
    },
    aesKey,
    new TextEncoder().encode(JSON.stringify(plan)),
  );
  const wrapped = await subtle.wrapKey('raw', aesKey, publicKey, { name: 'RSA-OAEP' });
  return {
    v: 1,
    alg: CLINICIAN_PLAN_SEAL_ALGORITHM,
    kid: key.kid,
    ek: toBase64(wrapped),
    iv: toBase64(iv),
    ct: toBase64(ciphertext),
  };
}
