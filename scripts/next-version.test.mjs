import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bumpFromLabels,
  labelHint,
  latestVersion,
  nextVersion,
  planRelease,
  suggestedBump,
} from './next-version.mjs';

const TAGS = ['v20261010.001944', 'v1.0.0'];

function release(labels, tags = TAGS) {
  return planRelease({ tags, headTags: [], labels }).tag;
}

test('a release label bumps v1.0.0 by its part', () => {
  assert.equal(release(['release:minor']), 'v1.1.0');
  assert.equal(release(['release:patch', 'enhancement']), 'v1.0.1');
  assert.equal(release(['release:major']), 'v2.0.0');
});

test('a bump resets the smaller parts', () => {
  assert.deepEqual(nextVersion([1, 4, 7], 'minor'), [1, 5, 0]);
  assert.deepEqual(nextVersion([1, 4, 7], 'major'), [2, 0, 0]);
});

test('the latest version ignores date tags and compares numerically, not as text', () => {
  assert.deepEqual(
    latestVersion(['v20261010.001944', 'v1.9.0', 'v1.10.0', 'v1.2.3', 'nope']),
    [1, 10, 0],
  );
  assert.equal(latestVersion(['v20261010.001944']), null);
});

test('the label must be exactly one release:* label', () => {
  assert.throws(() => bumpFromLabels([]), /exactly one.*found: none/);
  assert.throws(() => bumpFromLabels(['enhancement']), /found: none/);
  assert.throws(
    () => bumpFromLabels(['release:minor', 'release:patch']),
    /found: release:minor, release:patch/,
  );
  assert.equal(bumpFromLabels(['bug', 'release:patch']), 'patch');
});

test('commits suggest major for a breaking change, minor for a feat, otherwise patch', () => {
  assert.equal(suggestedBump(['fix(web): x', 'feat!: drop the v1 API']).bump, 'major');
  assert.equal(
    suggestedBump(['fix: x\n\nBREAKING CHANGE: the sync payload changed']).bump,
    'major',
  );
  assert.equal(suggestedBump(['chore: x', 'feat(db): a seed plan', 'fix: y']).bump, 'minor');
  assert.equal(
    suggestedBump(['fix(api): x', 'chore: y', 'Merge pull request #210 from a/b']).bump,
    'patch',
  );
  assert.equal(suggestedBump([]).bump, 'patch');
});

test('a feature mentioned in a body is not a feat commit', () => {
  assert.equal(suggestedBump(['fix: x\n\nfeat: was considered']).bump, 'patch');
});

test('the hint fires only when the label is smaller than the commits suggest', () => {
  const minor = suggestedBump(['feat(db): a seed plan']);
  assert.match(
    labelHint('patch', minor),
    /suggest a \*\*minor\*\*.*feat\(db\): a seed plan.*release:patch/,
  );
  assert.equal(labelHint('minor', minor), null);
  assert.equal(labelHint('major', minor), null);
});

test('a re-run reuses the tag already on the commit instead of bumping again', () => {
  const plan = planRelease({
    tags: [...TAGS, 'v1.1.0'],
    headTags: ['v1.1.0'],
    labels: ['release:minor'],
  });
  assert.deepEqual(plan, { tag: 'v1.1.0', previous: 'v1.0.0', isNew: false });
});

test('a new release names the previous tag for the notes', () => {
  assert.deepEqual(planRelease({ tags: TAGS, headTags: [], labels: ['release:minor'] }), {
    tag: 'v1.1.0',
    previous: 'v1.0.0',
    isNew: true,
  });
});

test('no merged pull request means no tag, never a guessed bump', () => {
  assert.match(planRelease({ tags: TAGS, headTags: [], labels: null }).skip, /no release label/);
});

test('a missing baseline tag is an error, not v0.0.1', () => {
  assert.throws(() => release(['release:patch'], ['v20261010.001944']), /No vX.Y.Z tag/);
});
