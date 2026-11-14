# Polish 2, unit 1: Settings

Personal settings now uses one ruled column in the requested order. Notifications links directly
to the existing `/account#notifications` controls, preserving old notification deep links and one
implementation. The installed state already existed; its description now also reflects installation.
Log out is separated from profile and tour actions. Clinic facts use bootstrap, `useClinicUnits`
and the existing clinic read endpoint for time zone; permitted editors link to `/admin/clinics`.
Repeated policy chips are removed. Approval is disabled with a reason when research is off;
unchanged settings explicitly say "No changes". Last-update provenance remains below the fields.

Validation: audit DB guard passed; production build, standalone TypeScript, changed-file ESLint
and Prettier passed. Web Jest: 100 suites, 1,073 tests passed, two workers. Focused Chromium:
17/17 passed (includes six auth setups), one worker. Captured both settings pages at 1440, 1024,
744, 390 and 320 in both themes, with zero document overflow. Inspected desktop light, phone dark,
and clinic phone light captures. Evidence: `/private/tmp/nkwapa-polish2/unit1-*`.

The sandboxed build stalled at compilation; the elevated build passed. No API contracts, write
endpoints, permissions or offline storage changed. Physical installed-PWA behavior was not tested.
