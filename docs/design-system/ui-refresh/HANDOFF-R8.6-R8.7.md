# Handoff: R8.6 visual regression and R8.7 accessibility

Scope: Phase R8 in `../NKWAPA-UI-REFRESH-MASTER.md`, on
`ui-refresh/r1-1-tokens`. Local commits only, never push. Reuse R8.1's route
inventory, R8.2's device matrix and R7.6's contrast/focus coverage. Add light-only
390/1440 main-screen baselines per role with future comparison support, axe on
the R8.1 routes, and keyboard checks for clinical forms and dialogs.

Use only tsc, changed-file lint/Prettier and affected Jest (`--maxWorkers=2`)
during implementation. Build fresh API/web, then run Playwright exactly once,
one worker, excluding #197. Include all ten R8.4/R8.5 failures and their pending
harness corrections, the eight open R8.3 cases, and volunteer-note submission to
any doctor through cosign, plan and finalization. Do not edit migration
`20261113190000`. Give harness failures at most one fix attempt and record gaps.
Commit real product fixes separately. Report measured results and limitations in
`R8.6-R8.7-REVIEW.md`.
