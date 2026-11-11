# Handoff: R4.1 Doctor review

Continue the frontend-only Layered Clinical Workspace refresh on
`ui-refresh/r1-1-tokens`. Learning guardrails stay suspended for this
sequence. Implement **R4.1 only**, validate, review, update docs and commit
locally. Do not push. Preserve unrelated work, including the owner's
`HANDOFF-R3.1.md` modification.

## Start here

Read `R3.8-REVIEW.md`, the latest `../PROGRESS.md` entry, `../MASTER.md`
(section 8 now holds pointer-aware sizing and `FormActions`), master spec
sections 7.9 and R4, `apps/web/AGENTS.md`, and the R0 pilot. Synthetic data
only; never open `references/01-current-ui` or `02-design-references`.

## New contracts from R3.8

- Controls size from tokens: 36px buttons and 40px fields on a mouse, 44px under
  touch. Never add `h-11`/`min-h-11` to Button, Input or SelectTrigger call
  sites. Use `h-auto` for wrapping labels.
- 4px control radius. Nothing rounder than 12px.
- Every form ends in `FormActions`: right-aligned from 600px, primary last;
  `split` for a start-edge Back or status note. Adopt it on each screen this
  unit touches.
- Encounter detail: back link, `h1` identity, right-aligned stage actions,
  ruled review route, prescriptions after the clinical tabs. Keep these.
- e2e: Desktop Chrome is `pointer: fine` even at 390px. Phone target checks need
  `hasTouch`; icon/small targets use `playwright/hit-target.js`.

## Scope

Doctor-facing review: HAP drafts and cosign, review queue entry points, sign-off
and finalization as seen by a doctor. Inspect the actual consumers first;
preserve permission gates, review/finalize semantics, locked records and offline
distinctions. No backend, auth or schema changes.

## Known before you start

- `portal-shell` held-changes test fails on baseline (sync pill `failed`, not
  `held`). Do not count it; do not chase it inside R4.1 unless it blocks.
- Carried: open-overlay accessibility, short dropdown rows, transient sync,
  backend Crisis acknowledgement, Sunday appointment lifecycle, physical
  devices, Safari/Firefox, screen readers.

Validation follows `HANDOFF-R3.8.md` (audit DB guard, low-memory recipe, one
worker, six-role audit, evidence under ignored `evidence/r4-1/after/`).
