#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname } from 'node:path';

const args = new Set(process.argv.slice(2));
const stagedOnly = args.has('--staged');

const BLOCKED_PATH_PATTERNS = [
  /(^|\/)\.env($|\.)/,
  /(^|\/)\.envrc$/,
  /(^|\/)id_(rsa|ed25519)$/,
  /\.(pem|key|p12|pfx|crt|cer)$/i,
  /\.secret(\.|$)/i,
];

const BINARY_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.ico',
  '.pdf',
  '.zip',
  '.gz',
  '.tgz',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.mp4',
  '.mov',
  '.webm',
]);

const DIRECT_SECRET_PATTERNS = [
  {
    label: 'private key block',
    regex: /-----BEGIN (?:RSA|DSA|EC|OPENSSH|PGP|PRIVATE) PRIVATE KEY-----/,
  },
  {
    label: 'GitHub token',
    regex: /\b(?:ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{20,})\b/,
  },
  {
    label: 'AWS access key',
    regex: /\bAKIA[0-9A-Z]{16}\b/,
  },
  {
    label: 'Google API key',
    regex: /\bAIza[0-9A-Za-z\-_]{35}\b/,
  },
  {
    label: 'Slack token',
    regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/,
  },
  {
    label: 'Stripe live key',
    regex: /\b(?:sk_live|rk_live)_[0-9A-Za-z]+\b/,
  },
  {
    label: 'SendGrid token',
    regex: /\bSG\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/,
  },
];

const SENSITIVE_ENV_KEYS = new Set([
  'DATABASE_URL',
  'REDIS_URL',
  'KEYCLOAK_CLIENT_SECRET',
  'PII_ENCRYPTION_KEY_BASE64',
  'NATIONAL_ID_PEPPER',
  'NATIONAL_ID_ENCRYPTION_KEY',
  'RESEARCH_GITHUB_TOKEN',
  'SMTP_PASS',
  'TWILIO_AUTH_TOKEN',
  'SENTRY_DSN',
  'VERCEL_TOKEN',
  'RAILWAY_TOKEN',
]);

function gitList(commandArgs) {
  return execFileSync('git', commandArgs, { encoding: 'utf8' })
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function listCandidateFiles() {
  const files = stagedOnly
    ? gitList(['diff', '--cached', '--name-only', '--diff-filter=ACMR'])
    : gitList(['ls-files', '--cached', '--others', '--exclude-standard']);

  return [...new Set(files)].filter((file) => {
    if (!existsSync(file)) {
      return false;
    }

    const stats = statSync(file);
    return stats.isFile();
  });
}

function shouldAllowPath(filePath) {
  return (
    filePath.endsWith('.env.example') ||
    filePath === 'apps/web/next-env.d.ts' ||
    filePath.startsWith('node_modules/')
  );
}

function isSensitivePath(filePath) {
  return BLOCKED_PATH_PATTERNS.some((pattern) => pattern.test(filePath));
}

function isBinaryContent(filePath, content) {
  if (BINARY_EXTENSIONS.has(extname(filePath).toLowerCase())) {
    return true;
  }

  return content.includes('\0');
}

function isSafePlaceholder(value) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  return [
    'replace_me',
    'replace_me_if_confidential_client',
    'changeme',
    'placeholder',
    'example',
    'fake',
    '<',
    '>',
    'localhost',
    '127.0.0.1',
    'nkwapa',
  ].some((token) => normalized.includes(token));
}

function scanEnvAssignments(filePath, content, issues) {
  const lines = content.split('\n');
  lines.forEach((line, index) => {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) {
      return;
    }

    const [, key, rawValue] = match;
    if (!SENSITIVE_ENV_KEYS.has(key)) {
      return;
    }

    const value = rawValue.trim();
    if (isSafePlaceholder(value)) {
      return;
    }

    if ((key === 'DATABASE_URL' || key === 'REDIS_URL') && /localhost|127\.0\.0\.1/.test(value)) {
      return;
    }

    issues.push(`${filePath}:${index + 1} contains a non-placeholder value for ${key}`);
  });
}

function scanConnectionStrings(filePath, content, issues) {
  const regex = /\bpostgres(?:ql)?:\/\/([^:\s]+):([^@\s]+)@([^\s/]+)/g;
  for (const match of content.matchAll(regex)) {
    const [, user, password, host] = match;
    if (
      /localhost|127\.0\.0\.1/.test(host) ||
      (user === 'nkwapa' && password === 'nkwapa') ||
      isSafePlaceholder(user) ||
      isSafePlaceholder(password)
    ) {
      continue;
    }

    issues.push(`${filePath} contains a non-local PostgreSQL connection string`);
  }
}

function main() {
  const files = listCandidateFiles();
  const issues = [];

  for (const file of files) {
    if (isSensitivePath(file) && !shouldAllowPath(file)) {
      issues.push(`${file} matches a blocked sensitive file pattern`);
      continue;
    }

    const content = readFileSync(file, 'utf8');
    if (isBinaryContent(file, content)) {
      continue;
    }

    DIRECT_SECRET_PATTERNS.forEach(({ label, regex }) => {
      if (regex.test(content)) {
        issues.push(`${file} appears to contain a ${label}`);
      }
    });

    scanEnvAssignments(file, content, issues);
    scanConnectionStrings(file, content, issues);
  }

  if (issues.length > 0) {
    console.error('Sensitive file or secret-like content detected:\n');
    issues.forEach((issue) => console.error(`- ${issue}`));
    process.exit(1);
  }

  console.log(
    `Secret scan passed for ${files.length} ${stagedOnly ? 'staged' : 'tracked/untracked'} files.`,
  );
}

main();
