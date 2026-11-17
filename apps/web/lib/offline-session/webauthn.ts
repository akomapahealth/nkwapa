import { base64UrlDecode, base64UrlEncode } from '@nkwapa/db/offline-grant';
import { randomBase64Url } from './keys';

/**
 * Unlocking with the device's own fingerprint, face or screen lock (#207), through a passkey's PRF
 * extension: the authenticator turns a fixed salt into 32 secret bytes, which derive the key that
 * wraps the data key. Those bytes are never stored.
 *
 * Support varies by platform and version (Safari and iOS were unconfirmed when this shipped), so
 * enrolment checks what the authenticator actually returned and the PIN stays available everywhere.
 * The passkey is local to this device and is only an unlock factor; it signs nobody in.
 */

interface PrfResults {
  enabled?: boolean;
  results?: { first?: ArrayBuffer };
}

export interface PasskeyUnlock {
  credentialId: string;
  prfSalt: string;
}

function prfOf(credential: Credential | null): PrfResults | undefined {
  const results = (credential as PublicKeyCredential | null)?.getClientExtensionResults?.() as
    | { prf?: PrfResults }
    | undefined;
  return results?.prf;
}

/** Whether this browser could offer a passkey at all. A yes still has to prove PRF on enrolment. */
export async function canOfferPasskeyUnlock(): Promise<boolean> {
  try {
    if (typeof PublicKeyCredential === 'undefined' || !globalThis.isSecureContext) return false;
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

async function evaluatePrf(credentialId: string, prfSalt: string): Promise<ArrayBuffer | null> {
  const credential = await navigator.credentials.get({
    publicKey: {
      challenge: globalThis.crypto.getRandomValues(new Uint8Array(32)),
      allowCredentials: [{ type: 'public-key', id: base64UrlDecode(credentialId) }],
      userVerification: 'required',
      timeout: 60_000,
      extensions: {
        prf: { eval: { first: base64UrlDecode(prfSalt) } },
      } as AuthenticationExtensionsClientInputs,
    },
  });
  return prfOf(credential)?.results?.first ?? null;
}

/**
 * Create a passkey for unlocking and return what derives its key, or null when this authenticator
 * cannot do PRF (the caller then offers the PIN only). The user can cancel; that throws.
 */
export async function enrollPasskey(
  userId: string,
  displayName: string,
): Promise<{ unlock: PasskeyUnlock; prfOutput: ArrayBuffer } | null> {
  const prfSalt = randomBase64Url(32);
  const credential = await navigator.credentials.create({
    publicKey: {
      challenge: globalThis.crypto.getRandomValues(new Uint8Array(32)),
      rp: { name: 'Nkwapa' },
      user: {
        id: new TextEncoder().encode(userId),
        name: displayName,
        displayName,
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'discouraged',
      },
      timeout: 60_000,
      extensions: {
        prf: { eval: { first: base64UrlDecode(prfSalt) } },
      } as AuthenticationExtensionsClientInputs,
    },
  });
  const prf = prfOf(credential);
  if (!credential || !prf?.enabled) return null;
  const credentialId = base64UrlEncode((credential as PublicKeyCredential).rawId);
  // Some authenticators evaluate PRF only on an assertion, not at creation.
  const prfOutput = prf.results?.first ?? (await evaluatePrf(credentialId, prfSalt));
  if (!prfOutput) return null;
  return { unlock: { credentialId, prfSalt }, prfOutput };
}

/** Ask the authenticator for the PRF output again. Null if it gave none; throws if cancelled. */
export function assertPasskey(unlock: PasskeyUnlock): Promise<ArrayBuffer | null> {
  return evaluatePrf(unlock.credentialId, unlock.prfSalt);
}
