# Polish 2: critique sweep

Two independent Impeccable assessments: A reviewed task hierarchy and source; B ran the source
detector (zero findings). The parent supplies authenticated seeded captures because B's isolated
tab could reach only sign-in. Scores are Nielsen **quality**, 0 poor to 4 excellent, total /40.
Before scores were recorded before fixes. After scores reflect source review and the seeded captures below; these are expert judgments, not usability-study measurements.
Questions skipped: the owner requested direct implementation.

| Heuristic                       |    Before |     After |
| ------------------------------- | --------: | --------: |
| Visibility of system status     |         3 |         3 |
| Match with the real world       |         3 |         3 |
| User control and freedom        |         2 |         3 |
| Consistency and standards       |         2 |         3 |
| Error prevention                |         3 |         3 |
| Recognition rather than recall  |         3 |         3 |
| Flexibility and efficiency      |         2 |         3 |
| Aesthetic and minimalist design |         2 |         3 |
| Error recognition and recovery  |         3 |         3 |
| Help and documentation          |         3 |         3 |
| **Total**                       | **26/40** | **30/40** |

## Findings and changes

- Phone volunteer: chat's floating panel consumed working space and its launcher close sat over
  the page. Below 600px it now uses the shared full-height modal Sheet, preserving Escape, focus
  return and the desktop panel. Group member details remain in the conversation; empty groups
  say "No messages yet", while actual last-message previews stay intact.
- Doctor: repeated unreconciled labels and default Active history badges slowed scanning. Entirely
  unreconciled medication lists now say so once. Exceptional history statuses remain visible;
  the default Active badge is removed. Assessment previews were delivered in unit 2.
- Director: appointment filters, patient requests and data requests used different list idioms.
  They now use shared search/filter controls and metric strips. Appointment declines and research reruns/rejections are secondary disclosed actions; their primary decisions/downloads stay visible. Invitations retain W3's separate
  status/search rows, with open/expired figures in a strip. Data requests keep Complete visible
  and put Start/Decline in an action menu. The response form adopts the shared form-dialog layout.
- Research: row counts, artifact paths and provenance now sit in the existing Run details
  disclosure, alongside its lazily fetched steps and checksums. Summary and actions remain visible.
- Patient record: patient-reported empty-state body now matches the 14px description; identity
  badges sit separately from code and sex so they do not fragment that line on phones.
- Notifications regression: long invitation emails widened phone tiles by 27px in both themes after the invitation tests. Explicit grid tracks, minimum-width constraints and text wrapping contain them.
- Trends: Y-axis domain now has explicit 5% (minimum one-unit) headroom and footroom, including
  constant readings. Tooltip/table values are unchanged.

## Coverage and limits

Source review included Overview, hypertension/diabetes history, encounter/editor/cosign, care plan,
prescriptions, registration/check-in/vitals, InterviewFlow, screening and counselling, administration,
portal and shell. Existing InterviewFlow validation focus, mounted questions and saved status were
preserved. Baseline/after captures walk the staff route plan, record tabs and patient portal at
1440/390 in both themes. Dynamic encounter forms and open overlays need targeted runtime checks;
normal-route captures alone do not verify them.

320px clinic names remain deliberately truncated with their existing accessible label; fitting an
arbitrary name in that header would displace sync/account controls. Physical devices, screen
readers and the virtual keyboard remain unverified. Version checks and staging infrastructure are
outside the owner's explicit 1, 2, 3, W4, R8.1 sequence for this run.

## Validation

Production build, standalone TypeScript, changed-file ESLint/Prettier and web Jest (100 suites,
1,073 tests, two workers) passed. Source detector: zero findings. Baseline: 152 captures, zero
errors/overflow. After: 152 captures, zero errors; two 27px notification overflows led to the fix
above, checked again in final captures. Inspected patient-reported, profile, appointments, clinic
settings, notifications and phone chat captures; focused tests cover history/medication workflows,
profile at enlarged text, portal, research details and real chat delivery.

The initial focused run passed 63 tests before stopping on four stale heading selectors and a
sheet assertion sampled during entrance. A follow-up passed 34, including after capture, but
identified three stale expectations (the moved request figure, invitation filter label, and picker
focus). These tests were updated without removing their behavior checks. The last targeted run passed 9/10; its remaining failure caught dialog focus returning past the new action menu. The menu now explicitly restores its trigger, with a focused regression rerun recorded below. The known staff-profile editing spec was excluded
because this unit does not touch profile persistence. Dynamic care-plan/prescription/interview,
screening and counselling forms were reviewed in source; full runtime coverage is carried to R8.1.
Evidence lives in `/private/tmp/nkwapa-polish2`; no real patient references were opened.

Final focus regression: **1/1 passed** after capturing the trigger before Radix's pointer-down
open. Final appointment/research/notification evidence: **12 captures**, zero overflow at
1440/390, both themes. The last targeted batch's other nine checks passed, including phone chat,
request booking, cancellation/removal and research export processing. No remaining failure on the
changed behavior. Whole-route/runtime coverage limitations above remain explicit.
