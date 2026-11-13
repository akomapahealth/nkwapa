# Handoff: R8.3 Role-based navigation tests

Scope comes from Phase R8 in `../NKWAPA-UI-REFRESH-MASTER.md`: the third bullet,
**role-based navigation tests**, after route audit and device/breakpoint matrix.
Work on `ui-refresh/r1-1-tokens`, direct mode, local commits only, never push.

Cover all six seeded roles: discoverable desktop/phone navigation, active destinations,
More/account menus, aliases/deep links and denied cross-role routes. Preserve existing
permissions, clinical validation, API and offline semantics. Reuse the guarded synthetic
`nkwapa_audit` setup; never print environment values or patient references.

Commit each implementation unit. During build run only TypeScript, changed-file lint/format
and affected Jest with `--maxWorkers=2`. Record browser/visual work in
`R8.3-DEFERRED-CHECKS.md`; execute it once at the end in one Playwright invocation, one worker,
`#197` excluded. No contact-sheet reviews. Build fresh API/web for that final verification.

Include R8.2's four staff form chains and four portal landscape chains, distinguishing
harness-only failures and unreached branches. Include a real API build before `6a1344c0`:
HTN and vitals corrections must sync after resend without `baseUpdatedAt` (fix `e46e5fc9`),
not remain blocked. Report actual outcomes and limitations in `R8.3-REVIEW.md`, update
progress/screen matrix, and leave later R8 clinical/offline/visual/a11y/performance phases
separate. Physical devices, screen readers and local HTTP WebKit remain prior limitations.
