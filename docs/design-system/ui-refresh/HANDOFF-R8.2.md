# Handoff: R8.2 Device and breakpoint matrix

Continue on `ui-refresh/r1-1-tokens`, direct mode, local commits only. Never push. W1 to W4 and
Polish 2 units 1/2/3 are complete. R8.1's route plan and observations are in `R8.1-REVIEW.md` and
`../route-audit/README.md`. Read those, `apps/web/AGENTS.md`, `apps/web/PRODUCT.md`, MASTER and
`NKWAPA-UI-REFRESH-MASTER.md` state/focus/motion/performance rules before editing.

Implement the next Phase R8 bullet only: **device and breakpoint matrix**. Distinguish emulated
viewports from physical devices. Keep permissions, APIs, clinical validation and offline/sync
semantics unchanged. Use the existing seeded audit database and refuse any other database.
Never open or commit real patient references, and never print environment values.

Cover 320, 390, 599/600, 744, 839/840, 1024 and 1199/1200/1440, both themes, touch and mouse,
200% text, keyboard traversal, short landscape height, safe areas and the virtual keyboard where
hardware is available. Prioritize data entry, encounter tabs/forms, More/sync sheets, phone chat,
portal forms and role homes. W4 already has ten volunteer width/theme captures and six-role home
axe checks; use that evidence, then fill gaps. 320px clinic names deliberately truncate while
retaining the full accessible name.

Carry the R8.1 limitations explicitly: root global-error font/token behavior without RootLayout;
valid one-off auth/claim states; conditional care-plan/finalization forms; screen readers and
physical devices; Keycloak over local HTTP prevents WebKit sign-in. Do not claim these are checked
from a clean normal-route audit. Keep the earlier product/infra follow-ups (version checks,
Crisis acknowledgement, offline empty-medication attestation and staging auth memory) separate.

Validation: production build, standalone TypeScript, changed-file ESLint/Prettier, Jest with
`--maxWorkers=2`; focused Chromium once with one worker, only affected specs. Exclude #197 locally.
Use the permanent route audit when shared source changes justify it; it requires a synthetic
fixture manifest and now fails on missing coverage. Write `R8.2-REVIEW.md`, update PROGRESS and the
screen matrix, record exact failures/skips, and hand to role-based navigation tests (next R8
bullet). Do not deploy, push or create GitHub issues.
