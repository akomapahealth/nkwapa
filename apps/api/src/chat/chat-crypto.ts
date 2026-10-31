import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

/*
  Chat messages are encrypted at rest (AES-256-GCM), so a database dump, a backup or a read
  replica holds no readable conversation.

  Each clinic gets its own key, derived with HKDF from one master key, so no key table and no
  extra secret to deploy. The master is CHAT_ENCRYPTION_KEY, or NATIONAL_ID_ENCRYPTION_KEY when
  that is the only one set: HKDF's `info` separates the two uses, so one cannot decrypt the other.
  The conversation id is the GCM associated data, so a ciphertext copied into another
  conversation or clinic fails to decrypt rather than appearing there.

  This is not end-to-end: the API decrypts to serve members, which keeps audit, legal holds and
  history on every device working.
*/

const VERSION = 'v1';
const INFO = Buffer.from('nkwapa/chat-message/v1');
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function masterKey(): Buffer {
  const raw = process.env.CHAT_ENCRYPTION_KEY || process.env.NATIONAL_ID_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error('CHAT_ENCRYPTION_KEY (or NATIONAL_ID_ENCRYPTION_KEY) must be set');
  }
  const key = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('The chat master key must decode to 32 bytes');
  return key;
}

function clinicKey(clinicId: string): Buffer {
  return Buffer.from(hkdfSync('sha256', masterKey(), Buffer.from(clinicId), INFO, 32));
}

export interface ChatCryptoScope {
  clinicId: string;
  conversationId: string;
}

/** `v1.<base64(iv | tag | ciphertext)>` */
export function encryptChatContent(plaintext: string, scope: ChatCryptoScope): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', clinicKey(scope.clinicId), iv);
  cipher.setAAD(Buffer.from(scope.conversationId));
  const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return `${VERSION}.${Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64')}`;
}

/** Throws if the ciphertext was altered, moved, or sealed with another key. */
export function decryptChatContent(sealed: string, scope: ChatCryptoScope): string {
  const [version, payload] = sealed.split('.', 2);
  if (version !== VERSION || !payload) throw new Error('Unknown chat ciphertext version');
  const raw = Buffer.from(payload, 'base64');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    clinicKey(scope.clinicId),
    raw.subarray(0, IV_LENGTH),
  );
  decipher.setAAD(Buffer.from(scope.conversationId));
  decipher.setAuthTag(raw.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH));
  return Buffer.concat([
    decipher.update(raw.subarray(IV_LENGTH + TAG_LENGTH)),
    decipher.final(),
  ]).toString('utf8');
}

/** Shown in place of a message that cannot be decrypted, so one bad row never hides the rest. */
export const UNREADABLE_MESSAGE = 'This message could not be decrypted.';

/** A stored message's readable text: legacy plaintext as is, sealed text opened. */
export function readChatContent(
  row: { content: string; encrypted: boolean },
  scope: ChatCryptoScope,
  onError?: (error: unknown) => void,
): string {
  if (!row.encrypted) return row.content;
  try {
    return decryptChatContent(row.content, scope);
  } catch (error) {
    onError?.(error);
    return UNREADABLE_MESSAGE;
  }
}
