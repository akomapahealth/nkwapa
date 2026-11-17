import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findBlocking } from './check-audit.mjs';

const advisory = (id, severity, title = 't') => ({
  source: 1,
  url: `https://github.com/advisories/${id}`,
  severity,
  title,
});
const report = {
  vulnerabilities: {
    picomatch: { via: [advisory('GHSA-fc5q-39xc-vjpf', 'high')] },
    fdir: { via: ['picomatch'] },
    lodash: { via: [advisory('GHSA-aaaa-bbbb-cccc', 'moderate')] },
    tiny: { via: [advisory('GHSA-low0-low0-low0', 'low')] },
  },
};
const exceptions = [{ id: 'GHSA-fc5q-39xc-vjpf', package: 'picomatch', reviewBy: '2027-01-31' }];
const day = new Date('2026-11-17T12:00:00Z');

test('an accepted advisory passes; anything else at the level blocks', () => {
  const { blocking, accepted, expired } = findBlocking(report, 'moderate', exceptions, day);
  assert.deepEqual(
    accepted.map((a) => a.id),
    ['GHSA-fc5q-39xc-vjpf'],
  );
  assert.deepEqual(
    blocking.map((a) => a.id),
    ['GHSA-aaaa-bbbb-cccc'],
  );
  assert.equal(expired.length, 0);
});

test('an exception past its review date fails instead of passing', () => {
  const { expired } = findBlocking(report, 'critical', exceptions, day);
  assert.equal(expired.length, 0, 'below the level, nothing to judge');
  const later = findBlocking(report, 'high', exceptions, new Date('2027-02-01T00:00:00Z'));
  assert.deepEqual(
    later.expired.map((a) => a.id),
    ['GHSA-fc5q-39xc-vjpf'],
  );
});

test('an exception covers only its own package', () => {
  const moved = {
    vulnerabilities: { other: { via: [advisory('GHSA-fc5q-39xc-vjpf', 'high')] } },
  };
  assert.equal(findBlocking(moved, 'high', exceptions, day).blocking.length, 1);
});
