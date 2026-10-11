#!/usr/bin/env node
// Semantic release versions (#202). The release:* label on the PR merged into main decides the
// bump. The conventional-commit scan is only a hint, because a breaking change nobody wrote as
// `!` or `BREAKING CHANGE` would slip past it.
//
//   node scripts/next-version.mjs check <base>..<head>   PR check: exactly one release label.
//                                                       Prints a hint when the commits suggest a
//                                                       bigger bump than the label.
//   node scripts/next-version.mjs release                deploy.yml: prints the release plan as JSON.
//
// Both read the PR's label names from PR_LABELS, a JSON array. Empty or null means no PR was found
// (gh --jq prints nothing for null).
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const BUMPS = ['major', 'minor', 'patch'];
// Strict vX.Y.Z only. The old date tags (v20261010.001944) have two parts and never match.
const SEMVER_TAG = /^v(\d+)\.(\d+)\.(\d+)$/;
const BREAKING_SUBJECT = /^\w+(\([^)]*\))?!:/;
const BREAKING_FOOTER = /^BREAKING[ -]CHANGE:/m;
const FEAT_SUBJECT = /^feat(\([^)]*\))?:/;

export function formatVersion([major, minor, patch]) {
  return `v${major}.${minor}.${patch}`;
}

export function latestVersion(tags) {
  let best = null;
  for (const tag of tags) {
    const match = SEMVER_TAG.exec(tag.trim());
    if (!match) continue;
    const version = match.slice(1).map(Number);
    if (!best || compareVersions(version, best) > 0) best = version;
  }
  return best;
}

function compareVersions(a, b) {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

export function nextVersion([major, minor, patch], bump) {
  if (bump === 'major') return [major + 1, 0, 0];
  if (bump === 'minor') return [major, minor + 1, 0];
  if (bump === 'patch') return [major, minor, patch + 1];
  throw new Error(`Unknown bump "${bump}"`);
}

export function bumpFromLabels(labels) {
  const found = BUMPS.filter((bump) => labels.includes(`release:${bump}`));
  if (found.length !== 1) {
    const got = found.length ? found.map((b) => `release:${b}`).join(', ') : 'none';
    throw new Error(
      `A pull request into main needs exactly one of release:major, release:minor or release:patch (found: ${got}).`,
    );
  }
  return found[0];
}

// Full commit messages, subject first. Merge commits fall through to patch.
export function suggestedBump(messages) {
  const breaking = messages.find((m) => BREAKING_SUBJECT.test(m) || BREAKING_FOOTER.test(m));
  if (breaking) return { bump: 'major', because: breaking.split('\n')[0] };
  const feat = messages.find((m) => FEAT_SUBJECT.test(m));
  if (feat) return { bump: 'minor', because: feat.split('\n')[0] };
  return { bump: 'patch', because: null };
}

// Only a label smaller than the commits suggest is flagged. A bigger one is a person correcting
// the scan, which is the point of labels deciding.
export function labelHint(label, suggestion) {
  if (BUMPS.indexOf(label) <= BUMPS.indexOf(suggestion.bump)) return null;
  return (
    `The commits in this pull request suggest a **${suggestion.bump}** release ` +
    `(\`${suggestion.because}\`), but it is labelled \`release:${label}\`. ` +
    `The label decides the version, so check it before merging.`
  );
}

// headTags are the tags already on the commit being released, which makes a re-run reuse the
// tag it made instead of bumping again.
export function planRelease({ tags, headTags, labels }) {
  const existing = latestVersion(headTags);
  if (existing) {
    const previous = latestVersion(tags.filter((tag) => !headTags.includes(tag)));
    return {
      tag: formatVersion(existing),
      previous: previous && formatVersion(previous),
      isNew: false,
    };
  }
  if (labels === null) {
    return {
      skip: 'No merged pull request matches this commit, so there is no release label to read. Not tagged.',
    };
  }
  const bump = bumpFromLabels(labels);
  const latest = latestVersion(tags);
  if (!latest) throw new Error('No vX.Y.Z tag is reachable from this commit to bump from.');
  return {
    tag: formatVersion(nextVersion(latest, bump)),
    previous: formatVersion(latest),
    isNew: true,
  };
}

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8' });
}

function lines(text) {
  return text.split('\n').filter(Boolean);
}

function main([command, range]) {
  const labels = JSON.parse(process.env.PR_LABELS || 'null');

  if (command === 'check') {
    if (!range) throw new Error('Usage: next-version.mjs check <base>..<head>');
    const label = bumpFromLabels(labels ?? []);
    const messages = git('log', '--format=%B%x00', range)
      .split('\0')
      .map((m) => m.trim())
      .filter(Boolean);
    const hint = labelHint(label, suggestedBump(messages));
    if (hint) console.log(hint);
    return;
  }

  if (command === 'release') {
    const plan = planRelease({
      tags: lines(git('tag', '--merged', 'HEAD')),
      headTags: lines(git('tag', '--points-at', 'HEAD')),
      labels,
    });
    console.log(JSON.stringify(plan));
    return;
  }

  throw new Error(`Unknown command "${command ?? ''}". Use check or release.`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(`::error::${error.message}`);
    process.exit(1);
  }
}
