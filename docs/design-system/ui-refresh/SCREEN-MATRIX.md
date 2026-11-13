# UI Refresh Screen Matrix

Every App Router page in `apps/web/app` as of `57e138a9` (2026-11-07). Update a cell only with evidence (screenshot path, test run, or PR).

Legend: `—` not reviewed, `WIP` in progress, `PASS` verified, `FAIL` needs correction, `N/A` not applicable. Phase is the refresh phase that owns the screen.

R8.2 verification remains **WIP for form-chain coverage**, not an all-green matrix. Fresh-server
invocation: 89 passed / 35 failed; affected-spec rerun: 58 passed / 8 failed (six setup passes
in each). Homes pass 24/24 across 384 existing cases; overlays pass 8/8; focused role audit
passes 6/6. The enlarged-text interview rail was fixed after the rerun and DOM-checked, without
another spec invocation. Four portal landscape failures are classified harness, not product
(strong inference from isolated reachability checks). Later interview/station/appointment
branches remain unreached. Details: `R8.2-REVIEW.md`, `R8.2-DEFERRED-CHECKS.md`.
No new matrix cases or contact-sheet reviews were added. Route cells below are not upgraded
from unreached or failed evidence. Hardware and dedicated-state exclusions remain open.

R8.3 adds navigation evidence, not blanket route-cell upgrades: one final invocation,
48 passed / 8 failed (six setup passes included). All five staff shell presentations and existing
patient portal shell checks pass; eight new staff/doctor/volunteer/manager traversal cases pass.
Four director/patient traversal harness failures were corrected after the run without rerunning.
All four R8.2 staff form chains pass, including later DM/Review and the ended station fixture;
four portal landscape harness failures persist and appointment matrix branches remain unreached.
596 geometry observations report no document/main overflow; 19 individual PNGs were reviewed,
without contact sheets. Actual old API HTN/vitals correction resends apply and drain after removing
baseUpdatedAt. Full details and capture-state limits: `R8.3-REVIEW.md` and
`R8.3-DEFERRED-CHECKS.md`. These results supersede the affected R8.2 gaps above while retaining
historical counts and hardware/state exclusions.

| Route                                              | Primary roles                            | Phase                       | Desktop | Tablet | Phone | Dark | QA  |
| -------------------------------------------------- | ---------------------------------------- | --------------------------- | ------- | ------ | ----- | ---- | --- |
| `/dashboard`                                       | all staff                                | R3 (volunteer), R4 (others) | —       | —      | —     | —    | —   |
| `/today`                                           | ops staff                                | R3                          | —       | —      | —     | —    | —   |
| `/stations`                                        | volunteer, staff with `OPS.STATION.WORK` | R3                          | —       | —      | —     | —    | —   |
| `/stations/setup`                                  | manager                                  | R4                          | —       | —      | —     | —    | —   |
| `/stations/visits/[visitId]`                       | station staff                            | R3                          | —       | —      | —     | —    | —   |
| `/my/assigned`                                     | assigned staff                           | R3                          | —       | —      | —     | —    | —   |
| `/queues`                                          | encounter roles                          | R3                          | —       | —      | —     | —    | —   |
| `/patients`                                        | `PATIENT.SEARCH`                         | R3                          | —       | —      | —     | —    | —   |
| `/patients/new`                                    | `PATIENT.CREATE`                         | R3                          | —       | —      | —     | —    | —   |
| `/patients/[patientId]`                            | clinical staff                           | R3                          | —       | —      | —     | —    | —   |
| `/patients/[patientId]/consent`                    | clinical staff                           | R3                          | —       | —      | —     | —    | —   |
| `/patients/[patientId]/encounters/new`             | clinical staff                           | R3                          | —       | —      | —     | —    | —   |
| `/encounters/[encounterId]`                        | clinical staff, doctor                   | R3, R4                      | —       | —      | —     | —    | —   |
| `/clinics/[clinicId]/patients`                     | clinic-scoped staff                      | R3                          | —       | —      | —     | —    | —   |
| `/clinics/[clinicId]/patients/new`                 | clinic-scoped staff                      | R3                          | —       | —      | —     | —    | —   |
| `/clinics/[clinicId]/patients/[patientId]`         | clinic-scoped staff                      | R3                          | —       | —      | —     | —    | —   |
| `/clinics/[clinicId]/patients/[patientId]/edit`    | clinic-scoped staff                      | R3                          | —       | —      | —     | —    | —   |
| `/clinics/[clinicId]/patients/[patientId]/consent` | clinic-scoped staff                      | R3                          | —       | —      | —     | —    | —   |
| `/clinics/[clinicId]/encounters`                   | clinic-scoped staff                      | R3                          | —       | —      | —     | —    | —   |
| `/clinics/[clinicId]/encounters/[encounterId]`     | clinic-scoped staff                      | R3, R4                      | —       | —      | —     | —    | —   |
| `/appointments`                                    | `APPOINTMENT.READ`                       | R3                          | —       | —      | —     | —    | —   |
| `/reminders`                                       | staff                                    | R4                          | —       | —      | —     | —    | —   |
| `/notifications`                                   | `REMINDER.READ`                          | R4                          | —       | —      | —     | —    | —   |
| `/volunteers`                                      | `VOLUNTEER.ROSTER.MANAGE`                | R4                          | —       | —      | —     | —    | —   |
| `/volunteers/events`                               | manager                                  | R4                          | —       | —      | —     | —    | —   |
| `/volunteers/events/[eventId]`                     | manager                                  | R4                          | —       | —      | —     | —    | —   |
| `/staff-activity`                                  | `AUDIT.READ`                             | R4                          | —       | —      | —     | —    | —   |
| `/audit`                                           | `AUDIT.READ`                             | R4                          | —       | —      | —     | —    | —   |
| `/metrics`                                         | `METRICS.READ`                           | R4                          | —       | —      | —     | —    | —   |
| `/research`                                        | `RESEARCH.EXPORT.REQUEST`                | R4                          | —       | —      | —     | —    | —   |
| `/clinics/[clinicId]/research/exports`             | research roles                           | R4                          | —       | —      | —     | —    | —   |
| `/reports/organization`                            | `ORGANIZATION.REPORT.READ`               | R4                          | —       | —      | —     | —    | —   |
| `/admin/clinics`                                   | `CLINIC.MANAGE`                          | R4                          | —       | —      | —     | —    | —   |
| `/admin/users`                                     | `CLINIC.MANAGE`                          | R4                          | —       | —      | —     | —    | —   |
| `/admin/duplicates`                                | `PATIENT.DUPLICATE.REVIEW`               | R4                          | —       | —      | —     | —    | —   |
| `/admin/duplicates/cross-clinic`                   | `PATIENT.DUPLICATE.REVIEW`               | R4                          | —       | —      | —     | —    | —   |
| `/admin/data-requests`                             | `PATIENT.DATA_REQUEST.MANAGE`            | R4                          | —       | —      | —     | —    | —   |
| `/settings`                                        | all signed in                            | R4                          | —       | —      | —     | —    | —   |
| `/settings/clinic`                                 | `RESEARCH.SETTINGS.UPDATE`               | R4                          | —       | —      | —     | —    | —   |
| `/account`                                         | all signed in                            | R5                          | —       | —      | —     | —    | —   |
| `/account/name`                                    | all signed in                            | R5                          | —       | —      | —     | —    | —   |
| `/status`                                          | all                                      | R5                          | —       | —      | —     | —    | —   |
| `/portal`                                          | patient                                  | R5                          | —       | —      | —     | —    | —   |
| `/portal/health`                                   | patient                                  | R5                          | —       | —      | —     | —    | —   |
| `/portal/appointments`                             | patient                                  | R5                          | —       | —      | —     | —    | —   |
| `/portal/appointments/request`                     | patient                                  | R5                          | —       | —      | —     | —    | —   |
| `/portal/self-reports`                             | patient                                  | R5                          | —       | —      | —     | —    | —   |
| `/portal/self-reports/new`                         | patient                                  | R5                          | —       | —      | —     | —    | —   |
| `/login`                                           | public                                   | R5                          | —       | —      | —     | —    | —   |
| `/accept-invite`                                   | invited staff                            | R5                          | —       | —      | —     | —    | —   |
| `/claim-record`                                    | patient                                  | R5                          | —       | —      | —     | —    | —   |
| `/` (marketing)                                    | public                                   | R6                          | —       | —      | —     | —    | —   |
| `/privacy`, `/terms`, `/cookies`                   | public                                   | R6                          | —       | —      | —     | —    | —   |

The Keycloak login theme lives outside `apps/web` and is tracked under R5.
