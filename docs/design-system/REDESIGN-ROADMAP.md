# Nkwapa 2.0 roadmap and handoff log

Read this first if you are picking up epic #229. Implementing agents: follow [CODEX-HANDOFF.md](CODEX-HANDOFF.md) phase by phase. The spec is [NKWAPA-2-REDESIGN-MASTER.md](NKWAPA-2-REDESIGN-MASTER.md); the epic body on GitHub maps its phases to the epic's older numbering and holds the dependency map.

## Where it stands (2026-11-01)

- **Phase 00 is done.** Direction A, Ruled Chart, approved 2026-11-01 (rules in MASTER.md section 12). The navigation moves are confirmed and Manager and Director seed identities are approved (DESIGN-DIRECTION.md, owner decisions). No owner decision blocks Phase 01.
- Sub-issues #261 to #283 exist and are attached to #229 with dependencies by number.
- Phase 00 documentation and baseline are merged into `release/dev` in PR #284. Manager-only and Director-only E2E identities are merged in PR #285.
- Before Phase 01: the #261 registration label fix is ready for review in [PR #286](https://github.com/akomapahealth/nkwapa/pull/286), branched directly from `release/dev`. The fixed route has zero WCAG-tagged axe violations in light/dark at 1440/390. [Evidence](evidence/261/README.md). Await merge before marking the fix complete; #263 has not started.

## Phase 00 outputs

| Deliverable                                                                                                               | Where                                                                           |
| ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Design audit, screenshot inventory, accessibility baseline, role-task matrix, component inventory, compatibility findings | [PHASE-00-AUDIT.md](PHASE-00-AUDIT.md)                                          |
| Route inventory (55 pages, 11 missing from the epic)                                                                      | [ROUTE-INVENTORY.md](ROUTE-INVENTORY.md)                                        |
| Three concepts, comparison, recommendation                                                                                | [DESIGN-DIRECTION.md](DESIGN-DIRECTION.md) and the review artifact linked there |
| Product context for design tools                                                                                          | `apps/web/PRODUCT.md`                                                           |

## Next steps, in order

1. ~~Owner approves a direction (#262)~~: done, A.
2. ~~Add Manager-only and Director-only E2E identities~~: merged in PR #285 (mind the Keycloak sub desync after any reseed).
3. Review and merge [PR #286](https://github.com/akomapahealth/nkwapa/pull/286), the critical `button-name` fix on `/patients/new`; implementation and focused verification are complete. Stop here for owner review before #263.
4. #263 compatibility spike on a throwaway branch; record adopt or reject per library in MASTER.md; move fonts to `next/font`.
5. #264 tokens, then #265 components, then #266 shell and #267 nav utilities. Each is its own PR from `release/dev`.
6. Phases 03 to 09 per the dependency map in #229.

## Rules that bit before (from project memory)

- Do not stack PRs into parent branches; #152 to #155 never reached `release/dev`. Branch each from `release/dev`.
- Local e2e needs the CI env (feature flags including `NEXT_PUBLIC_*`, rate limits, mail) and a rebuild, or about 12 unrelated specs fail.
- Run e2e with one worker; cap Jest at 2 workers. The pre-push hook runs the full suite.
- Any full reseed desyncs Keycloak subs in `.env`; every staff route then says "No clinic selected".
- Never put production patient data in screenshots, docs, PRs or artifacts.

## Log

| Date       | Entry                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-01 | Phase 00: baseline captured (126 screenshots, 84 axe scans), audit written, three directions published for review, #261 to #283 created, epic #229 extended. Awaiting direction approval.                                                                                                                                                                                                                                                                                       |
| 2026-11-01 | Owner approved A, Ruled Chart. Rules added to MASTER.md section 12; #262 updated.                                                                                                                                                                                                                                                                                                                                                                                               |
| 2026-11-01 | Owner confirmed the navigation moves and approved Manager and Director seed identities.                                                                                                                                                                                                                                                                                                                                                                                         |
| 2026-11-01 | Before Phase 01, #261: opened [PR #286](https://github.com/akomapahealth/nkwapa/pull/286) from `release/dev` to associate the Sex label and select. Four fixed-route axe scans are clean; four keyboard/axe regressions and the existing no-ID workflow pass; 919 web unit tests, builds, security scan, lint, typecheck and formatting pass. Before/after screenshots and axe JSON are in `evidence/261/`. Pending review and merge; #229 checklist updated, #263 not started. |
