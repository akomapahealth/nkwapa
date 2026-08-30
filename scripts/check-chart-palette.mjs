#!/usr/bin/env node
/*
  Verifies the chart series palette in apps/web/app/globals.css.

  MASTER.md's closing rule is "never change a token value without re-measuring every pairing it
  appears in". For colour that is a computation, not a judgement, so it belongs in CI rather than
  in a reviewer's eye. The palette this replaced had --chart-5 and --chart-1 at ΔE 6.1 under
  *normal* vision -- two series a full-colour reader could not reliably tell apart -- and nobody
  noticed for as long as the tokens existed, because nothing measured them.

  The checks and thresholds are the ones from the `dataviz` skill, restated here so this script
  has no dependency outside Node:

    1. Lightness band     OKLCH L within 0.43-0.77 light, 0.48-0.67 dark.
    2. Chroma floor       OKLCH C >= 0.10. Below it a hue reads as grey and stops doing identity work.
    3. CVD separation     ΔE (Euclidean in OKLab x100) >= 8 under protanopia, deuteranopia and
                          tritanopia, simulated with Machado-Oliveira-Fernandes 2009 at severity 1.
                          6-8 is a floor band, legal only where the chart also encodes the series
                          without colour.
    4. Normal-vision floor  worst pair ΔE >= 15 unsimulated. A hard gate: secondary encoding does
                          not excuse two series a full-colour reader cannot separate.
    5. Contrast vs surface  >= 3:1 against the card surface, or the chart must label its series
                          directly. Yellow cannot reach 3:1 on a near-white ground at any
                          lightness that still reads as yellow, so --chart-2 is a permitted WARN
                          and the charts that use it carry a legend and direct labels.

  Adjacent pairs are what a line or grouped-bar chart puts side by side. All pairs is the harder
  test and applies where any two marks can touch -- scatter, and pie. The all-pairs result is why
  there is no pie chart in this product: past three series it cannot be satisfied by any palette.

  Usage: node scripts/check-chart-palette.mjs
*/

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CSS = resolve(ROOT, 'apps/web/app/globals.css');

const BAND = { light: [0.43, 0.77], dark: [0.48, 0.67] };
const CHROMA_FLOOR = 0.1;
const CVD_TARGET = 8;
const CVD_FLOOR = 6;
const NORMAL_FLOOR = 15;
const CONTRAST_MIN = 3;

/** Slots allowed to sit below 3:1 because their hue cannot reach it. Each needs direct labels. */
const CONTRAST_EXEMPT = { light: new Set(['--chart-2']), dark: new Set() };

const MACHADO = {
  protan: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deutan: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritan: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};

const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/** `H S% L%` as written in globals.css -> linear-light sRGB. */
function hslTokenToLinear(token) {
  const [h, s, l] = token.split(/\s+/).map(Number.parseFloat);
  const sat = s / 100;
  const lig = l / 100;
  const k = (n) => (n + h / 30) % 12;
  const a = sat * Math.min(lig, 1 - lig);
  const f = (n) => lig - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)].map((v) => toLinear(Math.max(0, Math.min(1, v))));
}

function oklab([r, g, b]) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

const lightness = (lin) => oklab(lin)[0];
const chroma = (lin) => {
  const [, a, b] = oklab(lin);
  return Math.hypot(a, b);
};

function simulate(lin, kind) {
  const M = MACHADO[kind];
  const clamp = (c) => Math.max(0, Math.min(1, c));
  return M.map((row) => clamp(row[0] * lin[0] + row[1] * lin[1] + row[2] * lin[2]));
}

function deltaE(a, b, kind) {
  const x = oklab(kind ? simulate(a, kind) : a);
  const y = oklab(kind ? simulate(b, kind) : b);
  return 100 * Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}

const relativeLuminance = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
function contrast(a, b) {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Pull one declaration out of the `:root` or `.dark` block. */
function readTokens(css) {
  const rootStart = css.indexOf(':root');
  const darkStart = css.indexOf('.dark');
  if (rootStart === -1 || darkStart === -1 || darkStart < rootStart) {
    throw new Error('globals.css no longer has a :root block followed by a .dark block');
  }
  const blocks = { light: css.slice(rootStart, darkStart), dark: css.slice(darkStart) };

  const pick = (block, name) => {
    const match = block.match(new RegExp(`${name}:\\s*([^;]+);`));
    if (!match) throw new Error(`${name} is missing`);
    return match[1].trim();
  };

  return Object.fromEntries(
    Object.entries(blocks).map(([mode, block]) => [
      mode,
      {
        surface: pick(block, '--card'),
        series: [1, 2, 3, 4, 5].map((n) => ({
          name: `--chart-${n}`,
          token: pick(block, `--chart-${n}`),
        })),
      },
    ]),
  );
}

function checkMode(mode, { surface, series }) {
  const failures = [];
  const warnings = [];
  const surfaceLin = hslTokenToLinear(surface);
  const marks = series.map((s) => ({ ...s, lin: hslTokenToLinear(s.token) }));
  const [lo, hi] = BAND[mode];

  for (const mark of marks) {
    const L = lightness(mark.lin);
    if (L < lo || L > hi) {
      failures.push(`${mark.name} L ${L.toFixed(3)} is outside the ${mode} band ${lo}-${hi}`);
    }
    const C = chroma(mark.lin);
    if (C < CHROMA_FLOOR) {
      failures.push(`${mark.name} chroma ${C.toFixed(3)} is below ${CHROMA_FLOOR}; it reads grey`);
    }
    const ratio = contrast(mark.lin, surfaceLin);
    if (ratio < CONTRAST_MIN && !CONTRAST_EXEMPT[mode].has(mark.name)) {
      failures.push(
        `${mark.name} contrast ${ratio.toFixed(2)}:1 on the ${mode} card is below ${CONTRAST_MIN}:1`,
      );
    } else if (ratio < CONTRAST_MIN) {
      warnings.push(
        `${mark.name} contrast ${ratio.toFixed(2)}:1 — permitted, but every chart using it must label its series directly`,
      );
    }
  }

  for (const scope of ['adjacent', 'all']) {
    let worstCvd = { value: Infinity };
    let worstNormal = { value: Infinity };
    for (let i = 0; i < marks.length; i += 1) {
      for (let j = i + 1; j < marks.length; j += 1) {
        if (scope === 'adjacent' && j !== i + 1) continue;
        const label = `${marks[i].name} vs ${marks[j].name}`;
        const normal = deltaE(marks[i].lin, marks[j].lin);
        if (normal < worstNormal.value) worstNormal = { value: normal, label };
        for (const kind of ['protan', 'deutan', 'tritan']) {
          const value = deltaE(marks[i].lin, marks[j].lin, kind);
          if (value < worstCvd.value) worstCvd = { value, label: `${label} (${kind})` };
        }
      }
    }

    if (worstNormal.value < NORMAL_FLOOR) {
      failures.push(
        `${mode}/${scope}: ${worstNormal.label} is ΔE ${worstNormal.value.toFixed(1)} to normal vision, below the ${NORMAL_FLOOR} floor`,
      );
    }
    if (worstCvd.value < CVD_FLOOR) {
      failures.push(
        `${mode}/${scope}: ${worstCvd.label} is ΔE ${worstCvd.value.toFixed(1)}, below the ${CVD_FLOOR} floor`,
      );
    } else if (worstCvd.value < CVD_TARGET) {
      warnings.push(
        `${mode}/${scope}: ${worstCvd.label} is ΔE ${worstCvd.value.toFixed(1)}, inside the ${CVD_FLOOR}-${CVD_TARGET} floor band — legal only where the series is also encoded without colour`,
      );
    }

    const verdict = worstCvd.value >= CVD_TARGET ? 'ok' : 'floor band';
    console.log(
      `  ${mode}/${scope.padEnd(8)} worst CVD ΔE ${worstCvd.value.toFixed(1).padStart(5)} (${verdict}), normal ΔE ${worstNormal.value.toFixed(1).padStart(5)}`,
    );
  }

  return { failures, warnings };
}

const tokens = readTokens(readFileSync(CSS, 'utf8'));
console.log('Chart series palette — apps/web/app/globals.css');
const all = { failures: [], warnings: [] };
for (const mode of ['light', 'dark']) {
  const result = checkMode(mode, tokens[mode]);
  all.failures.push(...result.failures);
  all.warnings.push(...result.warnings);
}

for (const warning of all.warnings) console.log(`  WARN  ${warning}`);
for (const failure of all.failures) console.error(`  FAIL  ${failure}`);

if (all.failures.length) {
  console.error(`\nChart palette check failed with ${all.failures.length} problem(s).`);
  process.exit(1);
}
console.log('\nChart palette check passed.');
