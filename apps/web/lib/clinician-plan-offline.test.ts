import {
  generateKeyPairSync,
  createPrivateKey,
  privateDecrypt,
  constants,
  createDecipheriv,
} from 'crypto';
import { clinicianPlanSealAad, sealClinicianPlan } from '@nkwapa/db/clinician-plan-seal';
import { conditionForEndpoint, isQueuedPlanFor } from './clinician-plan-offline';

/*
  #131, the device half. The plan is sealed before it is queued, so what a device stores is
  ciphertext plus routing: these check that the routing is all anyone on the device can read.
*/

const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const key = {
  kid: 'k1',
  spki: publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
};
const context = {
  clinicId: 'clinic-1',
  encounterId: 'enc-1',
  condition: 'HYPERTENSION' as const,
  authorUserId: 'doctor-1',
};
const plan = { clinicianComments: 'Recheck after salt reduction', bpGoalSystolic: 130 };

describe('sealing a clinician plan on the device', () => {
  it('stores nothing a reader of the device could turn back into the plan', async () => {
    const sealed = await sealClinicianPlan(key, plan, context);
    const serialized = JSON.stringify(sealed);
    expect(serialized).not.toContain('salt');
    expect(serialized).not.toContain('130');
    // No AES key in the clear: the only copy is wrapped under the server's public key.
    expect(Object.keys(sealed).sort()).toEqual(['alg', 'ct', 'ek', 'iv', 'kid', 'v']);
  });

  it('is openable by the holder of the private key, for the sealed context only', async () => {
    const sealed = await sealClinicianPlan(key, plan, context);
    const open = (aad: string) => {
      const aesKey = privateDecrypt(
        {
          key: createPrivateKey(privateKey.export({ format: 'pem', type: 'pkcs8' })),
          padding: constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: 'sha256',
        },
        Buffer.from(sealed.ek, 'base64'),
      );
      const ct = Buffer.from(sealed.ct, 'base64');
      const decipher = createDecipheriv('aes-256-gcm', aesKey, Buffer.from(sealed.iv, 'base64'));
      decipher.setAAD(Buffer.from(aad));
      decipher.setAuthTag(ct.subarray(ct.length - 16));
      return JSON.parse(
        Buffer.concat([
          decipher.update(ct.subarray(0, ct.length - 16)),
          decipher.final(),
        ]).toString(),
      );
    };
    expect(open(clinicianPlanSealAad(context))).toEqual(plan);
    expect(() => open(clinicianPlanSealAad({ ...context, authorUserId: 'volunteer-1' }))).toThrow();
  });
});

describe('finding a queued plan', () => {
  const row = (overrides: Record<string, unknown> = {}) => ({
    entityType: 'clinician_plan',
    ownerUserId: 'doctor-1',
    payloadJson: JSON.stringify({ encounterId: 'enc-1', condition: 'HYPERTENSION' }),
    ...overrides,
  });
  const target = { encounterId: 'enc-1', condition: 'HYPERTENSION' as const, userId: 'doctor-1' };

  it('matches this doctor’s plan for this encounter and condition only', () => {
    expect(isQueuedPlanFor(row(), target)).toBe(true);
    expect(isQueuedPlanFor(row({ ownerUserId: 'doctor-2' }), target)).toBe(false);
    expect(isQueuedPlanFor(row(), { ...target, condition: 'DIABETES' })).toBe(false);
    expect(isQueuedPlanFor(row({ entityType: 'hypertension_assessment' }), target)).toBe(false);
    expect(isQueuedPlanFor(row(), { ...target, userId: null })).toBe(false);
  });

  it('maps the interview endpoints to their conditions', () => {
    expect(conditionForEndpoint('hypertension-assessment')).toBe('HYPERTENSION');
    expect(conditionForEndpoint('diabetes-screening')).toBe('DIABETES');
    expect(conditionForEndpoint('vitals')).toBeNull();
  });
});
