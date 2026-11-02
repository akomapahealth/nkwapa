# Route inventory

Regenerated 2026-11-01 for #261 (epic #229, Phase 00) with:

```bash
find apps/web/app -name page.tsx | sed -E 's#^apps/web/app##; s#/page\.tsx$##; s#/\([^)]*\)##g' | sort
```

55 pages. Route groups like `(workspace)` are stripped. **New** marks the 11 routes missing from the epic #229 route table. "Sub-issue" is where the route is redesigned.

| Route                                                                                                                                   | Area                              | Primary roles                        | Sub-issue  |
| --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ------------------------------------ | ---------- |
| `/`                                                                                                                                     | Marketing                         | public                               | #278       |
| `/privacy`, `/terms`                                                                                                                    | Marketing                         | public                               | #279       |
| `/cookies` **New**                                                                                                                      | Marketing                         | public                               | #279       |
| `/status` **New**                                                                                                                       | Marketing                         | public                               | #279       |
| `/research` **New**                                                                                                                     | Marketing                         | public                               | #279       |
| `/volunteers`, `/volunteers/events`, `/volunteers/events/[eventId]` **New**                                                             | Marketing                         | public                               | #279       |
| `/login`, `/accept-invite`, `/claim-record`                                                                                             | Auth and onboarding               | all                                  | #277       |
| `/account`, `/account/name` **New**                                                                                                     | Account                           | all staff                            | #267       |
| `/settings` **New**                                                                                                                     | Account                           | all staff                            | #267       |
| `/dashboard`                                                                                                                            | Overview                          | all staff, role-aware                | #268, #269 |
| `/today`                                                                                                                                | Care delivery                     | Manager                              | #271       |
| `/stations`, `/stations/setup`, `/stations/visits/[visitId]`                                                                            | Care delivery                     | Manager, Volunteer, Doctor           | #271       |
| `/my/assigned`                                                                                                                          | Care delivery                     | Volunteer, Doctor                    | #271       |
| `/queues`                                                                                                                               | Care delivery                     | Doctor, Manager                      | #272       |
| `/patients`, `/patients/new`, `/patients/[patientId]`, `/patients/[patientId]/consent`                                                  | Patients                          | Director, Manager, Doctor, Volunteer | #270       |
| `/patients/[patientId]/encounters/new`, `/encounters/[encounterId]`                                                                     | Encounters                        | Doctor, Volunteer                    | #272       |
| `/clinics/[clinicId]/patients`, `.../new`, `.../[patientId]`, `.../[patientId]/consent`                                                 | Patients (clinic-scoped)          | as above                             | #270       |
| `/clinics/[clinicId]/patients/[patientId]/edit` **New**                                                                                 | Patients (clinic-scoped)          | as above                             | #270       |
| `/clinics/[clinicId]/encounters`, `.../[encounterId]`                                                                                   | Encounters (clinic-scoped)        | Doctor                               | #272       |
| `/appointments`                                                                                                                         | Appointments                      | staff with `APPOINTMENT.READ`        | #273       |
| `/audit`, `/staff-activity`                                                                                                             | Oversight                         | Director, Manager, System Admin      | #274, #275 |
| `/metrics`                                                                                                                              | Oversight                         | Director, Manager                    | #275       |
| `/notifications` (`/reminders` redirects here)                                                                                          | Oversight, moving to header       | `REMINDER.READ`                      | #267, #274 |
| `/settings/clinic`                                                                                                                      | Oversight, moving to profile menu | `RESEARCH.SETTINGS.UPDATE`           | #267, #274 |
| `/clinics/[clinicId]/research/exports`                                                                                                  | Oversight                         | Director                             | #275       |
| `/admin/clinics`, `/admin/users`                                                                                                        | Administration                    | System Admin                         | #274       |
| `/admin/duplicates`, `/admin/duplicates/cross-clinic`                                                                                   | Administration                    | System Admin, Director               | #274       |
| `/admin/data-requests` **New**                                                                                                          | Administration                    | System Admin                         | #274       |
| `/reports/organization`                                                                                                                 | Administration                    | System Admin, Director               | #275       |
| `/portal`, `/portal/health`, `/portal/appointments`, `/portal/appointments/request`, `/portal/self-reports`, `/portal/self-reports/new` | Patient portal                    | Patient                              | #276       |

Roles per route are taken from `apps/web/lib/app-nav.ts` permissions and the route guards. They are a planning summary, not an authorization reference; `RouteGuard` and the API stay the source of truth.
