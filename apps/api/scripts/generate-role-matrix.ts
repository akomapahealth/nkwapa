/**
 * Write the clinical records role matrix document from the surfaces the API enforces.
 *
 * The matching test fails when the file and the code disagree, so this is how the file is brought
 * back into step after a permission changes.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { renderRoleMatrix } from '../src/testing/role-matrix-doc';

const target = resolve(__dirname, '../../../docs/security/clinical-records-role-matrix.md');
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, renderRoleMatrix());
console.log(`Wrote ${target}`);
