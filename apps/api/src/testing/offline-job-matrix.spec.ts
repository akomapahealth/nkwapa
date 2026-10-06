import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  KNOWN_RISKS,
  MATRIX_CONDITIONS,
  OFFLINE_JOB_SCENARIOS,
  OWNER_SURFACES,
} from './offline-job-matrix';
import { renderOfflineJobMatrix } from './offline-job-matrix-doc';

/**
 * The matrix is only worth trusting while it is true. Each check here turns a way it could quietly
 * stop being true -- a renamed test, a manual step nobody wrote down, a hand-edited document --
 * into a failing build.
 */
const REPO_ROOT = resolve(__dirname, '../../../..');
const DOC_PATH = resolve(REPO_ROOT, 'docs/security/offline-job-execution-matrix.md');
const GUIDE_PATH = resolve(REPO_ROOT, 'docs/USER_TESTING_GUIDE.md');
const MANUAL_SECTION = '## 17d. Offline Replay And Background Job Matrix';

const readRepoFile = (file: string) => readFileSync(resolve(REPO_ROOT, file), 'utf8');

/** Section 17d alone, so an id mentioned elsewhere in the guide does not count as walked. */
function manualSection(): string {
  const guide = readFileSync(GUIDE_PATH, 'utf8');
  const start = guide.indexOf(MANUAL_SECTION);
  if (start === -1) return '';
  const next = guide.indexOf('\n## ', start + MANUAL_SECTION.length);
  return guide.slice(start, next === -1 ? undefined : next);
}

describe('offline and job execution matrix', () => {
  it('gives every scenario a unique id and fills in every column', () => {
    const ids = OFFLINE_JOB_SCENARIOS.map((scenario) => scenario.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const scenario of OFFLINE_JOB_SCENARIOS) {
      expect(scenario.id).toMatch(/^(OFF|NET|DUP|CON|CLN|TEN|JOB)-\d{2}$/);
      expect(scenario.scenario.trim()).not.toBe('');
      expect(scenario.fixture.trim()).not.toBe('');
      expect(scenario.expected.trim()).not.toBe('');
      expect(Object.keys(OWNER_SURFACES)).toContain(scenario.surface);
    }
  });

  it('proves every scenario somewhere, by a test or by a person', () => {
    const unproven = OFFLINE_JOB_SCENARIOS.filter(
      (scenario) => scenario.automated.length === 0 && !scenario.manual,
    ).map((scenario) => scenario.id);

    expect(unproven).toEqual([]);
  });

  it('automates at least one high-risk scenario for every condition', () => {
    for (const condition of MATRIX_CONDITIONS) {
      const automatedHighRisk = OFFLINE_JOB_SCENARIOS.filter(
        (scenario) =>
          scenario.condition === condition &&
          scenario.risk === 'high' &&
          scenario.automated.length > 0,
      );
      // The condition in the assertion, so a failure names which one lost its coverage.
      expect({ condition, automated: automatedHighRisk.length > 0 }).toEqual({
        condition,
        automated: true,
      });
    }
  });

  it.each(
    OFFLINE_JOB_SCENARIOS.flatMap((scenario) =>
      scenario.automated.map((test) => [scenario.id, test.file, test.test] as const),
    ),
  )('%s names a test that exists: %s', (_id, file, title) => {
    expect(existsSync(resolve(REPO_ROOT, file))).toBe(true);
    // The title as written in source, so a renamed or deleted test fails here instead of leaving
    // the matrix pointing at nothing.
    expect(readRepoFile(file)).toContain(title);
  });

  it('describes every manual scenario in section 17d of the user testing guide', () => {
    const section = manualSection();
    expect(section).not.toBe('');

    const missing = OFFLINE_JOB_SCENARIOS.filter((scenario) => scenario.manual)
      .map((scenario) => scenario.id)
      .filter((id) => !section.includes(`**${id}**`));
    expect(missing).toEqual([]);
  });

  it('names no scenario in the guide that the matrix does not hold', () => {
    const known = new Set(OFFLINE_JOB_SCENARIOS.map((scenario) => scenario.id));
    const named = [
      ...manualSection().matchAll(/\*\*((?:OFF|NET|DUP|CON|CLN|TEN|JOB)-\d{2})\*\*/g),
    ].map((match) => match[1]);

    expect(named.filter((id) => !known.has(id))).toEqual([]);
  });

  it('gives every known risk a filed follow-up issue and at least one scenario', () => {
    for (const [id, risk] of Object.entries(KNOWN_RISKS)) {
      expect(risk.followUp).toMatch(/^#\d+: /);
      expect(OFFLINE_JOB_SCENARIOS.some((scenario) => scenario.knownRisk === id)).toBe(true);
    }
  });

  it('matches the published matrix document', () => {
    // Run `npm run docs:offline-job-matrix --workspace=@nkwapa/api` after changing the table.
    expect(readFileSync(DOC_PATH, 'utf8')).toBe(renderOfflineJobMatrix());
  });
});
