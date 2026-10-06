/**
 * Write the offline and job execution matrix document from the table the suite checks.
 *
 * The matching test fails when the file and the table disagree, so this is how the file is brought
 * back into step after a scenario, a fixture, or a test name changes.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { renderOfflineJobMatrix } from '../src/testing/offline-job-matrix-doc';

const target = resolve(__dirname, '../../../docs/security/offline-job-execution-matrix.md');
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, renderOfflineJobMatrix());
console.log(`Wrote ${target}`);
