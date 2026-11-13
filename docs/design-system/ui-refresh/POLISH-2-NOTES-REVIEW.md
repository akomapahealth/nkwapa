# Polish 2, unit 2: Clinical note previews

Patient note summaries now include an assessment excerpt, falling back to history when assessment
is blank. Whitespace collapses; long excerpts end at a word boundary around 160 characters with
an ellipsis (a single overlong word is capped). Full assessment/history fields are removed from
the response. The repository does not select addenda text. Existing clinical-role, patient-scope
and RLS checks remain in place. The Notes tab renders up to two muted lines below each title.
No IndexedDB, sync projection, permission or caching changes.

Validation: API and audit-flag web builds, both standalone TypeScript checks, changed-file ESLint
and Prettier passed. Clinical-note API Jest: six suites, 89 tests; web Jest: 100 suites, 1,073 tests,
all with at most two workers. Tests cover truncation, whitespace/history fallback and denied reads
for patient, manager, director and system-admin-only actors. Focused Chromium: 10/10 passed
(including six auth setups), one worker, with a submitted-note preview assertion and existing
offline non-exposure check. Inspected synthetic preview captures at desktop light and phone dark;
captured 1440/390 in both themes. Evidence: `/private/tmp/nkwapa-polish2/unit2-*`.
