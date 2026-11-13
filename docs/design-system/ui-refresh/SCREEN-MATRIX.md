# UI Refresh Screen Matrix

Every App Router page in `apps/web/app` as of `57e138a9` (2026-11-07). Update a cell only with evidence (screenshot path, test run, or PR).

Legend: `—` not reviewed, `WIP` in progress, `PASS` verified, `FAIL` needs correction, `N/A` not applicable. Phase is the refresh phase that owns the screen.

R8.2 remains **WIP**, with exact results and remaining checks in `R8.2-REVIEW.md` and
`R8.2-DEFERRED-CHECKS.md`. The single original-build invocation finished 46 passed / 36 failed
(including six setup passes). New matrix captures: 384 homes, 64 registration, 48 self-report,
12 overlays. Early home captures sometimes show loading. The later encounter/station/appointment
matrix chains were not reached; existing clinical specs cover only their own declared cases.
Targeted corrections are committed but not browser-verified. No route cells below are upgraded
from failed, loading or unreached evidence.

| R8.2 screen group                                                 |             Captures | Result / gap                                                                                        |
| ----------------------------------------------------------------- | -------------------: | --------------------------------------------------------------------------------------------------- |
| Six role homes                                                    |                  384 | All W/T/L conditions captured; 19 overflow observations, some early loading; post-fix rerun pending |
| Registration                                                      |                   64 | 320px/200% main overflow; required-ID fixture blocked encounter entry                               |
| Self-report                                                       |                   48 | All normal widths plus 320px/200%; submit clipping blocked later conditions                         |
| Encounter Vitals/HTN/DM, interview sections/Review, station visit |      0 in new matrix | Not reached; existing HTN/DM/vitals specs do not fill every matrix combination                      |
| Appointment request                                               |      0 in new matrix | Not reached after self-report failure                                                               |
| More/sync/chat                                                    |                   12 | 320 × 640 in four contexts; axe failure prevented other conditions                                  |
| Registration keyboard at 200%                                     | 0 completed captures | Original focus locator failed; corrected harness unverified                                         |

W = all eleven widths × 900; T = 320/600/840/1200 × 900 at 200% root text; L = 744 × 360.
Both themes and mouse/emulated touch apply separately. Details and hardware exclusions are in
the deferred list. Contact-sheet review is not full-resolution inspection or physical-device QA.

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
