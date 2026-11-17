#!/usr/bin/env node
/*
  `npm audit` with a short, dated list of accepted advisories. npm has no ignore option, so
  this runs the same two passes as before and fails on any advisory at or above the level that
  is not listed here. An exception that has passed its review date fails the check, so it is
  looked at again rather than forgotten. See docs/security/app-security-review.md (S3).
*/
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const EXCEPTIONS = [
  {
    id: 'GHSA-fc5q-39xc-vjpf',
    package: 'picomatch',
    reason:
      'ReDoS in picomatch <= 4.0.7 with no patched release. Reached in production deps only ' +
      'through @sentry/nextjs -> @rollup/plugin-commonjs, which runs at build time.',
    reviewBy: '2027-01-31',
  },
];

const LEVELS = ['info', 'low', 'moderate', 'high', 'critical'];

/** Advisories in an `npm audit --json` report at or above `level`, minus live exceptions. */
export function findBlocking(report, level, exceptions = EXCEPTIONS, today = new Date()) {
  const min = LEVELS.indexOf(level);
  const seen = new Map();
  for (const [name, entry] of Object.entries(report.vulnerabilities ?? {})) {
    for (const via of entry.via ?? []) {
      // A string names another vulnerable package; its own entry carries the advisory.
      if (typeof via !== 'object' || LEVELS.indexOf(via.severity) < min) continue;
      const id =
        String(via.url ?? '')
          .split('/')
          .pop() || `${name}:${via.title}`;
      seen.set(`${id} ${name}`, { id, package: name, severity: via.severity, title: via.title });
    }
  }
  const blocking = [];
  const accepted = [];
  const expired = [];
  for (const advisory of seen.values()) {
    const exception = exceptions.find(
      (e) => e.id === advisory.id && e.package === advisory.package,
    );
    if (!exception) blocking.push(advisory);
    else if (new Date(`${exception.reviewBy}T23:59:59Z`) < today) expired.push(advisory);
    else accepted.push(advisory);
  }
  return { blocking, accepted, expired };
}

function audit(args) {
  const run = spawnSync('npm', ['audit', '--json', '--workspaces', ...args], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  try {
    return JSON.parse(run.stdout);
  } catch {
    // Not a report (network or registry failure): never treat that as a pass.
    console.error(run.stderr || run.stdout);
    throw new Error('npm audit did not return a JSON report');
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  let failed = false;
  for (const [label, args, level] of [
    ['production dependencies', ['--omit=dev'], 'moderate'],
    ['all dependencies', [], 'critical'],
  ]) {
    const { blocking, accepted, expired } = findBlocking(audit(args), level);
    for (const a of accepted)
      console.log(`accepted (${label}): ${a.id} ${a.package} ${a.severity}`);
    for (const a of expired) {
      console.error(`exception past its review date (${label}): ${a.id} ${a.package}`);
    }
    for (const a of blocking) {
      console.error(`${a.severity} (${label}): ${a.id} ${a.package} ${a.title}`);
    }
    if (blocking.length || expired.length) failed = true;
  }
  if (failed) process.exit(1);
  console.log('Dependency audit passed.');
}
