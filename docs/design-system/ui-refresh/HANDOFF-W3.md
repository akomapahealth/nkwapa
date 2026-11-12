# Handoff: W3 Patients and Queues to the pilot tables

Continue the frontend-only refresh on `ui-refresh/r1-1-tokens`. Direct mode (no learning
guardrails, no teach-back). Implement **W3 only**, validate, write `W3-REVIEW.md`, a `PROGRESS.md`
entry, update `PHASE-W.md` progress and write `HANDOFF-W4.md`, commit locally. Do not push.

Read first: `PHASE-W.md` (W3 row), `W2-REVIEW.md` and `W1-REVIEW.md` (the pattern), the pilot
screens `r0-pilot/index.html` `#s-patients` and `#s-queues` and `evidence/r0/patients-*`,
`evidence/r0/queues-*` (1440, 1024, 744, 390, 360, dark, plus the phone filter sheet), MASTER
sections 8.1, 10.1, 11.1, "Patient registry and records (#270)" and "Role homes (W2)", and
`apps/web/AGENTS.md`.

## Target (pilot)

- **Patients** (`components/patients/PatientRegistryScreen.tsx`, `PatientRegistryCard.tsx`; the
  route file is a 25-line wrapper): title with the result count beside it, search with a `/`
  shortcut hint (name, code, phone or ID last 4), filter chips (existing location and screened
  filters, #224; the phone opens them in the existing Sheet), columns Patient (name + code), Phone
  (masked as today), Last visit, Location from `lg`, then one quiet "View" and one outline "Check
  in" per row. Phone: cards, same two actions.
- **Queues** (`app/(workspace)/queues/page.tsx`, 548 lines): the pilot list. Keep the tab
  deep-links the dashboards use (`/queues?tab=drafts|review|finalize|cosign`), counts per tab and
  every row action.
- Keep URL state, clinic scope, masking, check-in behaviour, permissions, offline and stale states,
  sorting and pagination. Do not invent columns the API lacks: note any in the review.

## Tests that name today's strings

Grep `e2e/` for every UI string, role or class you change (memory: "Fast low-memory e2e recipe").
Likely: `patient-registry-screened`, `patient-identity`, `queue-workspace`, `stale-refresh`,
`shell-*`, `keyboard-focus`, `dark-mode`, `route-audit-findings`, `patient-merge-preview`. Update to
the new structure without weakening what they check.

## Validation

As `HANDOFF-R8.1.md` "Validation": recreate `S/audit-env.sh` and `S/env.sh` from `HANDOFF-R2.1.md`,
audit-flag build, tsc, changed-file lint/format, Jest `--maxWorkers=2`, focused Chromium in one
invocation with one worker, six-role route audit both themes (baseline W2: 228 rows, 0 violations,
0 minor, 0 overflow, one h1). Visual evidence from a synthetic `nkwapa_shots` database (MASTER 12),
1440 / 1024 / 744 / 390 / 320 in both themes beside the pilot; drop it afterwards. Keycloak only
redirects to `localhost:3000`; nothing else may hold the port.

**Shots timing (found in W2):** the API measures live waits from its real clock, so `SHOTS_NOW`
must be close to the real time, not a fixed morning, or waits print negative. Run captures that
show times during Accra daytime.

Optional from W2: the landing manager shot greets "Good evening" (captured at night). Re-capture
it during Accra daytime under a new name if a morning greeting is wanted (`W2-REVIEW.md`, Open).
