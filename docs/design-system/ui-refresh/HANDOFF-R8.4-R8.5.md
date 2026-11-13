# Handoff: R8.4 clinical workflow and R8.5 offline/sync regression

Use Phase R8's clinical workflow and offline/sync bullets in
`../NKWAPA-UI-REFRESH-MASTER.md` on `ui-refresh/r1-1-tokens`.
Local commits only; never push. Reuse existing e2e workflows first; add coverage only
for an uncovered workflow. Cover registration/check-in/vitals/HTN/DM/clinician plan/
finalization, prescriptions, notes/cosign, offline save/reconnect/sync, conflict and
blocked/retry states, and Polish 2 unit 5's second-user overwrite inbox notice.

During implementation use only TypeScript, changed-file lint/Prettier and affected
Jest (`--maxWorkers=2`). Build fresh API/web for exactly one final Playwright
invocation, one worker, zero retries, excluding #197 and including the eight open
R8.3 cases. No contact sheets or theme sweeps. Give harness failures at most one
fix attempt; record remaining harness gaps. Commit real product fixes separately.
Report actual passes, fixes and open gaps in `R8.4-R8.5-REVIEW.md`.
