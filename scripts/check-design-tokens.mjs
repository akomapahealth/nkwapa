#!/usr/bin/env node
/**
 * #264: measure the intended Ruled Chart text/surface and rule/surface pairs.
 * Colour conversion and relative luminance follow WCAG's sRGB formula. Compare
 * full precision to the threshold; only round values in the printed report.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CSS = resolve(ROOT, 'apps/web/app/globals.css');
const STATUS = ['success', 'warning', 'info', 'destructive'];

export function readThemes(css) {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const block = (selector) => {
    const match = source.match(new RegExp(`${selector}\\s*\\{([^{}]*)\\}`));
    if (!match) throw new Error(`Missing theme: ${selector}`);
    return Object.fromEntries(
      [...match[1].matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]),
    );
  };
  const light = block(':root');
  const dark = block('\\.dark');
  // New semantic roles must be deliberate in both themes, rather than inherited
  // accidentally when a developer adds a light-only surface.
  for (const [mode, tokens] of Object.entries({ light, dark })) {
    for (const token of ['--rule', '--rule-strong', ...STATUS.map((s) => `--${s}-surface`)]) {
      if (!tokens[token]) throw new Error(`${mode}: missing ${token}`);
    }
  }
  return { light, dark: { ...light, ...dark } };
}

export function resolveToken(tokens, name, seen = new Set()) {
  if (seen.has(name)) throw new Error(`Circular token alias: ${name}`);
  const value = tokens[name];
  if (!value) throw new Error(`Missing token: ${name}`);
  const alias = value.match(/^var\((--[\w-]+)\)$/);
  if (!alias) return value;
  return resolveToken(tokens, alias[1], new Set([...seen, name]));
}

export function hslToRgb(value) {
  const match = value.match(/^([\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/);
  if (!match) throw new Error(`Expected an HSL triple, got: ${value}`);
  const [h, saturation, lightness] = match.slice(1).map(Number);
  if (
    ![h, saturation, lightness].every(Number.isFinite) ||
    h > 360 ||
    saturation > 100 ||
    lightness > 100
  ) {
    throw new Error(`Invalid HSL: ${value}`);
  }
  const s = saturation / 100;
  const l = lightness / 100;
  const a = s * Math.min(l, 1 - l);
  return [0, 8, 4].map((n) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
  });
}

export function contrast(a, b) {
  const luminance = (rgb) =>
    rgb
      .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
      .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
  const [low, high] = [luminance(a), luminance(b)].sort((x, y) => x - y);
  return (high + 0.05) / (low + 0.05);
}

export function auditTokens(css) {
  const themes = readThemes(css);
  const results = [];
  for (const [theme, tokens] of Object.entries(themes)) {
    const pairs = [
      ...STATUS.map((s) => [`--${s}-ink`, `--${s}-surface`, 4.5, 'status text and icon']),
      ...['--background', '--card'].flatMap((surface) => [
        ['--rule-strong', surface, 3, '2px group rule'],
        ['--rule', surface, null, 'decorative hairline; not a control boundary'],
        ['--foreground', surface, 4.5, 'primary text and figures'],
        ['--muted-foreground', surface, 4.5, 'supporting text'],
      ]),
    ];
    for (const [foreground, background, minimum, use] of pairs) {
      const ratio = contrast(
        hslToRgb(resolveToken(tokens, foreground)),
        hslToRgb(resolveToken(tokens, background)),
      );
      results.push({
        theme,
        foreground,
        background,
        ratio,
        minimum,
        use,
        pass: !minimum || ratio >= minimum,
      });
    }
  }
  return results;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const results = auditTokens(readFileSync(CSS, 'utf8'));
    if (process.argv.includes('--json')) console.log(JSON.stringify(results, null, 2));
    else {
      for (const r of results) {
        console.log(
          `${r.pass ? 'PASS' : 'FAIL'} ${r.theme} ${r.foreground} on ${r.background}: ${r.ratio.toFixed(2)}:1${r.minimum ? ` (>= ${r.minimum})` : ' (decorative)'}`,
        );
      }
    }
    if (results.some((r) => !r.pass)) process.exitCode = 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
