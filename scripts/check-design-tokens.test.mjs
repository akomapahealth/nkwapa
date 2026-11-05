import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  auditTokens,
  contrast,
  hslToRgb,
  readThemes,
  resolveToken,
} from './check-design-tokens.mjs';

const css = readFileSync(new URL('../apps/web/app/globals.css', import.meta.url), 'utf8');

test('WCAG endpoints are 21:1 and identical colours are 1:1', () => {
  assert.equal(contrast(hslToRgb('0 0% 0%'), hslToRgb('0 0% 100%')), 21);
  assert.equal(contrast(hslToRgb('188 100% 27%'), hslToRgb('188 100% 27%')), 1);
});

test('a dark status ink regression fails without being hidden by a passing light theme', () => {
  const dark = css.indexOf('.dark {');
  const broken =
    css.slice(0, dark) +
    css.slice(dark).replace(/--success-ink:[^;]+;/, '--success-ink: var(--success-surface);');
  const results = auditTokens(broken);
  assert.equal(
    results.find((r) => r.theme === 'light' && r.foreground === '--success-ink').pass,
    true,
  );
  assert.equal(
    results.find((r) => r.theme === 'dark' && r.foreground === '--success-ink').pass,
    false,
  );
});

test('missing dark surfaces cannot silently inherit the light surface', () => {
  const dark = css.indexOf('.dark {');
  const broken = css.slice(0, dark) + css.slice(dark).replace(/--warning-surface:[^;]+;/, '');
  assert.throws(() => readThemes(broken), /dark: missing --warning-surface/);
});

test('aliases reject missing references and cycles', () => {
  assert.throws(() => resolveToken({ '--a': 'var(--b)' }, '--a'), /Missing token/);
  assert.throws(() => resolveToken({ '--a': 'var(--b)', '--b': 'var(--a)' }, '--a'), /Circular/);
});
