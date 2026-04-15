// packages/db/index.ts
export { PrismaClient } from '@prisma/client';
export {
  encryptNationalId,
  decryptNationalId,
  hashNationalId,
  nationalIdLast4,
  hasEncryptionKey,
} from './src/national-id';
export { generatePatientCode } from './src/patient-code';
export { normalizePhoneToE164 } from './src/phone';
