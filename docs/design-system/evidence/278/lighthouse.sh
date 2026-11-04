#!/usr/bin/env bash
# #278: Lighthouse 12.8.2 against the web build at BASE_URL, three runs per form factor, and the
# median run's scores and timings into <before|after>/lighthouse.json. Needs Playwright's Chromium.
set -euo pipefail
OUT="$(cd "$(dirname "$0")" && pwd)/${1:-after}"
BASE="${BASE_URL:-http://localhost:3100}/"
TMP="$(mktemp -d)"
export CHROME_PATH="${CHROME_PATH:-$(ls -d "$HOME"/Library/Caches/ms-playwright/chromium-*/chrome-mac*/*.app/Contents/MacOS/* | head -1)}"
mkdir -p "$OUT"
for form in mobile desktop; do
  preset=()
  [ "$form" = desktop ] && preset=(--preset=desktop)
  for run in 1 2 3; do
    npx -y lighthouse@12.8.2 "$BASE" ${preset[@]+"${preset[@]}"} --only-categories=performance,accessibility \
      --output=json --output-path="$TMP/$form-$run.json" --chrome-flags="--headless=new" --quiet
  done
done
node -e '
const fs = require("fs");
const [tmp, out] = process.argv.slice(1);
const result = {};
for (const form of ["mobile", "desktop"]) {
  const runs = [1, 2, 3].map((n) => JSON.parse(fs.readFileSync(`${tmp}/${form}-${n}.json`, "utf8")));
  runs.sort((a, b) => a.categories.performance.score - b.categories.performance.score);
  const r = runs[1];
  const a = r.audits;
  result[form] = {
    runs: runs.map((x) => Math.round(x.categories.performance.score * 100)),
    performance: Math.round(r.categories.performance.score * 100),
    accessibility: Math.round(r.categories.accessibility.score * 100),
    lcp: a["largest-contentful-paint"].displayValue,
    lcpElement: a["largest-contentful-paint-element"]?.details?.items?.[0]?.items?.[0]?.node?.selector,
    fcp: a["first-contentful-paint"].displayValue,
    tbt: a["total-blocking-time"].displayValue,
    cls: a["cumulative-layout-shift"].displayValue,
    failedAccessibility: r.categories.accessibility.auditRefs
      .filter((ref) => a[ref.id].score !== null && a[ref.id].score < 1)
      .map((ref) => ref.id),
  };
}
fs.writeFileSync(`${out}/lighthouse.json`, JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify(result, null, 2));
' "$TMP" "$OUT"
