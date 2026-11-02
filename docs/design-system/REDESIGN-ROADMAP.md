# Nkwapa 2.0 roadmap and handoff log

Read this first if you are picking up epic #229. Implementing agents: follow [CODEX-HANDOFF.md](CODEX-HANDOFF.md) phase by phase. The spec is [NKWAPA-2-REDESIGN-MASTER.md](NKWAPA-2-REDESIGN-MASTER.md); the epic body on GitHub maps its phases to the epic's older numbering and holds the dependency map.

## Where it stands (2026-11-01)

- **Phase 00 is done.** Direction A, Ruled Chart, approved 2026-11-01 (rules in MASTER.md section 12). The navigation moves are confirmed and Manager and Director seed identities are approved (DESIGN-DIRECTION.md, owner decisions). No owner decision blocks Phase 01.
- Sub-issues #261 to #283 exist and are attached to #229 with dependencies by number.
- Phase 00 documentation and baseline are merged into `release/dev` in PR #284. Manager-only and Director-only E2E identities are merged in PR #285.
- Before Phase 01: the #261 registration label fix is merged in [PR #286](https://github.com/akomapahealth/nkwapa/pull/286), with zero WCAG-tagged axe violations in light/dark at 1440/390. [Evidence](evidence/261/README.md). #261 is closed and the #229 prerequisite checklist is checked.
- #263 feasibility and self-hosted fonts are merged in [PR #287](https://github.com/akomapahealth/nkwapa/pull/287); all CI checks passed. #262 and #263 are closed. Owner-approved animation and selective UI adoption decisions remain in MASTER.md section 13.
- #264 tokens and typography is ready for review in [PR #288](https://github.com/akomapahealth/nkwapa/pull/288), branched directly from `release/dev`. Ruled/status tokens, eight opt-in type roles and CI contrast validation are verified. [Evidence](evidence/264/README.md). No shared component migration yet; #265 has not started.

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
3. ~~Fix the critical `button-name` finding on `/patients/new`~~: merged in PR #286; #261 closed.
4. ~~#263 feasibility and self-hosted fonts~~: merged in PR #287, CI passed; owner decisions recorded.
5. Review and merge [PR #288](https://github.com/akomapahealth/nkwapa/pull/288) for #264, then #265 components, #266 shell and #267 nav utilities. Stop here before #265; each issue gets its own PR from `release/dev`.
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

| 2026-11-01 | PR #286 merged into `release/dev`; #261 closed as completed and the #229 prerequisite checked. Started #263 from the updated base, with the compatibility work isolated on a disposable branch. |
| 2026-11-01 | #263: opened [PR #287](https://github.com/akomapahealth/nkwapa/pull/287) from `release/dev`. Fonts self-hosted with next/font; disposable compatibility spike completed, selective shadcn adoption proposed, Bklit/Kokonut/Sileo adoption rejected. No production dependency added. 108 app axe scans clean before and after, 57 E2E and 919 unit tests pass, production build and required static checks pass. Evidence in `evidence/263/`. #229 checklist updated; pending owner decision and merge, stopped before #264. |
| 2026-11-01 | Owner updated #263 direction: animated charts are welcome; shadcn, Bklit and Kokonut may be adopted selectively after compatibility, token, contrast, target-size and reduced-motion repairs. Initial blanket Bklit/Kokonut rejection superseded. Sileo rejection approved; retain Sonner. PR #287 and #229 updated; no chart implementation or dependency change in this decision update. Stopped before #264. |
| 2026-11-01 | PR #287 merged into `release/dev` with all CI checks passing; #263 closed, #262 direction acceptance reconciled as complete, and #229 feasibility checklist checked. Started #264 from `release/dev` at `c3e654b`; no dependent component work started. |
| 2026-11-01 | #264: opened [PR #288](https://github.com/akomapahealth/nkwapa/pull/288) from `release/dev`. Added measured rule/status-surface tokens, eight opt-in type roles and a CI contrast check. All 24 intended pairs measured; four decorative pairings correctly exempt. 108 app axe scans clean before/after, four specimen axe/zoom cases pass, 44 E2E, 919 web unit and 20 script tests pass; build, lint, typecheck, palette, formatting and security checks pass. Evidence in `evidence/264/`. #229 checklist updated; pending review and merge, stopped before #265. |
