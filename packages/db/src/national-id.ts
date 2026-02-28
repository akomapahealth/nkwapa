/**
 * National ID encryption and hashing helpers.
 * Used for national_id_ciphertext (AES-256-GCM) and national_id_hash (SHA-256).
 */

import * as crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

function getKey(keyOverride?: string): Buffer {
  const raw = keyOverride ?? process.env.NATIONAL_ID_ENCRYPTION_KEY;
  if (!raw || raw.length < 32) {
    throw new Error(
      "NATIONAL_ID_ENCRYPTION_KEY must be set (32-byte hex or base64 string)"
    );
  }
  if (raw.length === 64 && /^[0-9a-fA-F]+$/.test(raw)) {
    return Buffer.from(raw, "hex");
  }
  return Buffer.from(raw, "base64");
}

function normalize(plaintext: string): string {
  return plaintext.trim();
}

/**
 * Encrypt national ID with AES-256-GCM.
 * Returns base64 string: iv (12) + authTag (16) + ciphertext.
 */
export function encryptNationalId(
  plaintext: string,
  key?: string
): string {
  const normalized = normalize(plaintext);
  const keyBuf = getKey(key);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, keyBuf, iv);
  const enc = Buffer.concat([
    cipher.update(normalized, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, enc]).toString("base64");
}

/**
 * Decrypt national ID from base64 (iv + authTag + ciphertext).
 */
export function decryptNationalId(
  ciphertextBase64: string,
  key?: string
): string {
  const keyBuf = getKey(key);
  const buf = Buffer.from(ciphertextBase64, "base64");
  if (buf.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error("Invalid ciphertext");
  }
  const iv = buf.subarray(0, IV_LENGTH);
  const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, keyBuf, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(ciphertext) + decipher.final("utf8");
}

/**
 * SHA-256 hash of national ID for deduplication.
 * Uses pepper from NATIONAL_ID_PEPPER env when provided.
 * Returns 64-char hex string.
 */
export function hashNationalId(plaintext: string, pepper?: string): string {
  const normalized = normalize(plaintext);
  const p = pepper ?? process.env.NATIONAL_ID_PEPPER ?? "";
  const toHash = normalized + p;
  return crypto.createHash("sha256").update(toHash, "utf8").digest("hex");
}

/**
 * Last 4 chars of national ID for display hints.
 */
export function nationalIdLast4(plaintext: string): string {
  const normalized = normalize(plaintext);
  if (normalized.length < 4) return normalized;
  return normalized.slice(-4);
}

/**
 * Check if encryption key is available (for conditional seeding).
 */
export function hasEncryptionKey(): boolean {
  const raw = process.env.NATIONAL_ID_ENCRYPTION_KEY;
  return Boolean(raw && raw.length >= 32);
}
