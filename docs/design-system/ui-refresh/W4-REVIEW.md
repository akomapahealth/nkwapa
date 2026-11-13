# W4: Volunteer home

The volunteer home keeps `VolunteerWelcome`, its 34px phone greeting and shift-row Refresh.
The compact station line follows, then "Your clinic day": real shift state, a link to the
existing shift controls, the actual station/worklist destination and draft-visit count. Draft
patient names stay on the worklist instead of filling the checklist. HAP draft counts and
patient links remain when present. Shared clinic charts and "Today at a glance" are removed
from the volunteer branch. The non-volunteer/fallback branches and W2 precedence are unchanged.

The line uses the W1 stop/count vocabulary and existing station-workspace cache shape, reads,
polling and pending-shift overlay. It does not claim a patient or change offline replay behavior.
Unknown reads do not say off duty; failed refreshes retain the known line and offer retry. Empty
stations, zero drafts, pending shift end and saved-copy states are explicit. "Also on your plate"
remains empty for the lowest-precedence volunteer role. No extra writes or permissions.

Validation: audit-flag production build, standalone TypeScript, changed-file ESLint and Prettier
passed. Web Jest: 100 suites, 1,073 tests, two workers. Focused Chromium initially 80 passed and
three stale assertions failed: two still sought the removed Open queues shortcut and one expected
margins around phone chat. Updated them to the actual worklist link and the full-height sheet.
The focused rerun passed 9/9, including all three affected cases and six role-home evidence tests.
The real draft-count assertion, shift start/end/refusal/offline cases, station workflows, role
precedence, refresh resilience and dark-mode scans passed.

Visual evidence: `/private/tmp/nkwapa-polish2/w4`. Thirty cases over six roles, both themes:
zero axe findings, zero document overflow, one h1 each. Volunteer captures cover 1440, 1024, 744,
390 and 320; a 320px capture at 200% text also has zero overflow. Inspected desktop light and
320px dark against the approved pilot. Captures use the real clock, after 05:00 in Accra, with the
morning greeting. No landing asset uses this volunteer home, so no public image was replaced.

The full route walk follows immediately in R8.1 and also checks this unchanged home; it is not
claimed from the thirty home cases alone. Physical devices, virtual keyboard and screen readers
remain unverified. W1/W2/W3 matrix entries use their recorded validations, not invented new runs.
