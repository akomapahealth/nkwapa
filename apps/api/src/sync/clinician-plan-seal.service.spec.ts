import { generateKeyPairSync } from 'crypto';
import { sealClinicianPlan, type ClinicianPlanSealContext } from '@nkwapa/db';
import { ClinicianPlanSealService, SealedPlanUnreadableError } from './clinician-plan-seal.service';

/*
  #131: the server half of sealing an offline clinician plan.

  Every envelope here is sealed by `sealClinicianPlan`, the function a doctor's browser runs, so a
  change on either side that breaks the other fails here rather than in a clinic.
*/

const CONTEXT: ClinicianPlanSealContext = {
  clinicId: 'clinic-1',
  encounterId: 'encounter-1',
  condition: 'HYPERTENSION',
  authorUserId: 'doctor-1',
};
const PLAN = {
  clinicianPlanItems: ['LIFESTYLE_COUNSELLING'],
  followUpWindow: 'WITHIN_1_MONTH',
  clinicianComments: 'Recheck BP after salt reduction',
};

function pem() {
  return generateKeyPairSync('rsa', { modulusLength: 2048 })
    .privateKey.export({ format: 'pem', type: 'pkcs8' })
    .toString();
}

function serviceWith(env: Record<string, string | undefined>) {
  const saved = { ...process.env };
  Object.assign(process.env, env);
  for (const [key, value] of Object.entries(env)) if (value === undefined) delete process.env[key];
  try {
    return new ClinicianPlanSealService();
  } finally {
    process.env = saved;
  }
}

const configured = (kid = 'k1', key = pem()) =>
  serviceWith({ CLINICIAN_PLAN_SEAL_PRIVATE_KEY: key, CLINICIAN_PLAN_SEAL_KEY_ID: kid });

async function sealWith(service: ClinicianPlanSealService, context = CONTEXT, plan = PLAN) {
  const key = service.publicKey();
  if (!key.available) throw new Error('no key');
  return sealClinicianPlan({ kid: key.kid, spki: key.spki }, plan, context);
}

describe('ClinicianPlanSealService (#131)', () => {
  it('opens a plan sealed in the browser, for the context it was sealed for', async () => {
    const service = configured();
    const envelope = await sealWith(service);
    expect(service.open(envelope, CONTEXT)).toEqual(PLAN);
  });

  it('keeps the plan out of the envelope itself', async () => {
    const envelope = await sealWith(configured());
    const serialized = JSON.stringify(envelope);
    expect(serialized).not.toContain('salt reduction');
    expect(serialized).not.toContain('WITHIN_1_MONTH');
  });

  it.each([
    ['another clinic', { clinicId: 'clinic-2' }],
    ['another encounter', { encounterId: 'encounter-2' }],
    ['another condition', { condition: 'DIABETES' }],
    ['another account', { authorUserId: 'volunteer-1' }],
  ])('will not open a plan replayed for %s', async (_case, change) => {
    const service = configured();
    const envelope = await sealWith(service);
    expect(() => service.open(envelope, { ...CONTEXT, ...change })).toThrow(
      SealedPlanUnreadableError,
    );
  });

  it('refuses a tampered ciphertext', async () => {
    const service = configured();
    const envelope = await sealWith(service);
    const bytes = Buffer.from(envelope.ct, 'base64');
    bytes[0] ^= 0xff;
    expect(() => service.open({ ...envelope, ct: bytes.toString('base64') }, CONTEXT)).toThrow(
      SealedPlanUnreadableError,
    );
  });

  it('refuses a key it does not hold, and an envelope that is not one', async () => {
    const envelope = await sealWith(configured('old'));
    const fresh = configured('new');
    expect(() => fresh.open(envelope, CONTEXT)).toThrow(SealedPlanUnreadableError);
    expect(() => fresh.open({ v: 1 }, CONTEXT)).toThrow(SealedPlanUnreadableError);
    expect(() => fresh.open('plain text', CONTEXT)).toThrow(SealedPlanUnreadableError);
  });

  it('still opens plans sealed before a key rotation', async () => {
    const oldKey = pem();
    const before = configured('2026-09', oldKey);
    const envelope = await sealWith(before);

    const rotated = serviceWith({
      CLINICIAN_PLAN_SEAL_PRIVATE_KEY: pem(),
      CLINICIAN_PLAN_SEAL_KEY_ID: '2026-10',
      CLINICIAN_PLAN_SEAL_PREVIOUS_PRIVATE_KEY: oldKey,
      CLINICIAN_PLAN_SEAL_PREVIOUS_KEY_ID: '2026-09',
    });
    expect(rotated.publicKey()).toMatchObject({ available: true, kid: '2026-10' });
    expect(rotated.open(envelope, CONTEXT)).toEqual(PLAN);
  });

  it('reads a key given as base64 with escaped newlines, as deploy env files carry it', async () => {
    const key = pem();
    const service = configured('k1', Buffer.from(key).toString('base64'));
    expect(service.open(await sealWith(service), CONTEXT)).toEqual(PLAN);
  });

  it('is unavailable in production without a configured key, so the plan stays online-only', () => {
    const service = serviceWith({
      NODE_ENV: 'production',
      CLINICIAN_PLAN_SEAL_PRIVATE_KEY: undefined,
      CLINICIAN_PLAN_SEAL_KEY_ID: undefined,
      CLINICIAN_PLAN_SEAL_EPHEMERAL: undefined,
    });
    expect(service.isAvailable()).toBe(false);
    expect(service.publicKey()).toEqual({ available: false });
  });

  it('generates a key for itself outside production', async () => {
    const service = serviceWith({
      NODE_ENV: 'test',
      CLINICIAN_PLAN_SEAL_PRIVATE_KEY: undefined,
      CLINICIAN_PLAN_SEAL_KEY_ID: undefined,
    });
    expect(service.isAvailable()).toBe(true);
    expect(service.open(await sealWith(service), CONTEXT)).toEqual(PLAN);
  });
});

describe('clampDecidedAt (#131)', () => {
  // Imported lazily: it lives beside the replay handler, which pulls in the whole sync service.
  const now = new Date('2026-10-08T12:00:00Z');
  const load = async () => (await import('./sync.service')).clampDecidedAt;

  it('believes a plausible decision time, so the follow-up counts from it', async () => {
    const clampDecidedAt = await load();
    expect(clampDecidedAt('2026-10-06T09:30:00Z', now)).toEqual(new Date('2026-10-06T09:30:00Z'));
  });

  it('never lets a device clock put the decision in the future', async () => {
    const clampDecidedAt = await load();
    expect(clampDecidedAt('2026-10-09T00:00:00Z', now)).toEqual(now);
  });

  it('falls back to now for a missing, unreadable or implausibly old time', async () => {
    const clampDecidedAt = await load();
    expect(clampDecidedAt(undefined, now)).toEqual(now);
    expect(clampDecidedAt('yesterday', now)).toEqual(now);
    expect(clampDecidedAt('2026-01-01T00:00:00Z', now)).toEqual(now);
  });
});
