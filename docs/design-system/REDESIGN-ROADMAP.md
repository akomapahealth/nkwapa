# Nkwapa 2.0 roadmap and handoff log

Read this first if you are picking up epic #229. The spec is [NKWAPA-2-REDESIGN-MASTER.md](NKWAPA-2-REDESIGN-MASTER.md); the epic body on GitHub maps its phases to the epic's older numbering and holds the dependency map.

## Where it stands (2026-11-01)

- **Phase 00 is done.** Direction A, Ruled Chart, approved 2026-11-01 (rules in MASTER.md section 12). Still open before #266 and #267: the two navigation moves and the Manager and Director test identities (DESIGN-DIRECTION.md, open decisions).
- Sub-issues #261 to #283 exist and are attached to #229 with dependencies by number.
- Branch `design/229-phase-00` holds the Phase 00 work, uncommitted at handoff: `apps/web/e2e/design-baseline.spec.js`, `apps/web/PRODUCT.md`, the docs in this folder, `concepts/`. The spec file itself was provided by the owner.

## Phase 00 outputs

| Deliverable                                                                                                               | Where                                                                           |
| ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Design audit, screenshot inventory, accessibility baseline, role-task matrix, component inventory, compatibility findings | [PHASE-00-AUDIT.md](PHASE-00-AUDIT.md)                                          |
| Route inventory (55 pages, 11 missing from the epic)                                                                      | [ROUTE-INVENTORY.md](ROUTE-INVENTORY.md)                                        |
| Three concepts, comparison, recommendation                                                                                | [DESIGN-DIRECTION.md](DESIGN-DIRECTION.md) and the review artifact linked there |
| Product context for design tools                                                                                          | `apps/web/PRODUCT.md`                                                           |

## Next steps, in order

1. ~~Owner approves a direction (#262)~~: done, A.
2. Fix the critical `button-name` axe finding on `/patients/new` (small, can go first).
3. #263 compatibility spike on a throwaway branch; record adopt or reject per library in MASTER.md; move fonts to `next/font`.
4. #264 tokens, then #265 components, then #266 shell and #267 nav utilities. Each is its own PR from `release/dev`.
5. Phases 03 to 09 per the dependency map in #229.

## Rules that bit before (from project memory)

- Do not stack PRs into parent branches; #152 to #155 never reached `release/dev`. Branch each from `release/dev`.
- Local e2e needs the CI env (feature flags including `NEXT_PUBLIC_*`, rate limits, mail) and a rebuild, or about 12 unrelated specs fail.
- Run e2e with one worker; cap Jest at 2 workers. The pre-push hook runs the full suite.
- Any full reseed desyncs Keycloak subs in `.env`; every staff route then says "No clinic selected".
- Never put production patient data in screenshots, docs, PRs or artifacts.

## Log

| Date       | Entry                                                                                                                                                                                     |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-01 | Phase 00: baseline captured (126 screenshots, 84 axe scans), audit written, three directions published for review, #261 to #283 created, epic #229 extended. Awaiting direction approval. |
| 2026-11-01 | Owner approved A, Ruled Chart. Rules added to MASTER.md section 12; #262 updated.                                                                                                         |
