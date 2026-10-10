/**
 * Write the patient identity matrix document from the table the API enforces.
 *
 * The matching test fails when the file and the code disagree, so this is how the file is brought
 * back into step after a duplicate rule, a merge refusal, or a claim outcome changes.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { renderPatientIdentityMatrix } from '../src/testing/patient-identity-matrix-doc';

const target = resolve(__dirname, '../../../docs/security/patient-identity-matrix.md');
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, renderPatientIdentityMatrix());
console.log(`Wrote ${target}`);
