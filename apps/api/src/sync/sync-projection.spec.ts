import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SYNC_PATIENT_SELECT, SYNC_PATIENT_WITHHELD } from './sync-projection';

/** Field names declared on one Prisma model, ignoring relations and block attributes. */
function modelFields(model: string): string[] {
  const schema = readFileSync(
    resolve(__dirname, '../../../../packages/db/prisma/schema.prisma'),
    'utf8',
  );
  const body = new RegExp(`^model ${model} \\{([\\s\\S]*?)^\\}`, 'm').exec(schema)?.[1];
  if (!body) throw new Error(`Model ${model} not found`);

  const scalarTypes =
    /^(String|Int|Float|Boolean|DateTime|Decimal|BigInt|Bytes|Json|Sex|NationalIdType|PatientLocationStatus|GhanaRegion)$/;

  return body
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('//') && !line.startsWith('@@'))
    .map((line) => line.split(/\s+/))
    .filter(([, type]) => type && scalarTypes.test(type.replace(/[?[\]]/g, '')))
    .map(([name]) => name);
}

describe('offline sync patient projection', () => {
  const selected = Object.keys(SYNC_PATIENT_SELECT);
  const withheld = Object.keys(SYNC_PATIENT_WITHHELD);

  it('never sends the encrypted national id or its hash', () => {
    // Both were shipped to every browser and written to IndexedDB, and neither was ever read.
    expect(selected).not.toContain('nationalIdCiphertext');
    expect(selected).not.toContain('nationalIdHash');
    expect(withheld).toContain('nationalIdCiphertext');
    expect(withheld).toContain('nationalIdHash');
  });

  it('still sends what the offline registry and chart render', () => {
    for (const field of [
      'id',
      'patientCode',
      'primaryClinicId',
      'firstName',
      'lastName',
      'nationalIdLast4',
      'residentialRegion',
      'updatedAt',
    ]) {
      expect(selected).toContain(field);
    }
  });

  it('requires a decision for every patient column', () => {
    // A migration that adds a column must either send it deliberately or record why it is
    // withheld. Before this, a new column reached every device automatically.
    const undecided = modelFields('Patient').filter(
      (field) => !selected.includes(field) && !withheld.includes(field),
    );
    expect(undecided).toEqual([]);
  });

  it('does not both send and withhold the same column', () => {
    expect(selected.filter((field) => withheld.includes(field))).toEqual([]);
  });

  it('explains every withheld column', () => {
    for (const [field, reason] of Object.entries(SYNC_PATIENT_WITHHELD)) {
      expect(reason.length).toBeGreaterThan(30);
      expect(field).not.toBe('');
    }
  });
});
