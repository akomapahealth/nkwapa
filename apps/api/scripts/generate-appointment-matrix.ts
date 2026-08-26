/**
 * Write the appointment lifecycle matrix document from the table the API enforces.
 *
 * The matching test fails when the file and the code disagree, so this is how the file is brought
 * back into step after a transition, a permission, or a reminder disposition changes.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { renderAppointmentLifecycleMatrix } from '../src/testing/appointment-matrix-doc';

const target = resolve(__dirname, '../../../docs/security/appointment-lifecycle-matrix.md');
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, renderAppointmentLifecycleMatrix());
console.log(`Wrote ${target}`);
