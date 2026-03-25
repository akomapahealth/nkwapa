# Nkwapa User Testing Guide

This guide is the current manual QA and user acceptance checklist for the implemented product surface.

Use it when testing releases, validating new role setup, or checking whether a workflow still behaves as expected after code changes.

---

## 1. Prerequisites

### Infrastructure

Make sure these are available:

- Postgres
- Redis
- Keycloak
- API
- Web app

Local infra shortcut:

```bash
cd infra/nkwapa
docker compose up -d
```

### Database and seed

Run:

```bash
npm run db:generate
npm run db:migrate:dev
npm run db:seed
```

Recommended seed inputs:

- `SEED_SYSTEM_ADMIN_SUB`
- `SEED_SYSTEM_ADMIN_NAME`
- `SEED_SAMPLE_PATIENT=true` if you want quick demo data

### Auth setup

Create test users in Keycloak first.

Then have each test user log into Nkwapa once before expecting them to appear in the admin tables.

See:

- `docs/USER_AND_ROLE_SETUP_GUIDE.md`

---

## 2. Suggested Test Accounts

At minimum create these users:

- one `SYSTEM_ADMIN`
- one `DIRECTOR`
- one `MANAGER`
- one `DOCTOR`
- one `PRECEPTOR`
- one `VOLUNTEER`
- one `PATIENT`

Optional power-user account:

- one user with `VOLUNTEER`, `PRECEPTOR`, and `DOCTOR` in the same clinic to test role switching and combined visibility

---

## 3. Global Smoke Test

Run this first before deep role testing:

1. open the web app
2. confirm login redirects to Keycloak
3. log in
4. confirm the app loads without console-breaking behavior
5. confirm clinic selector is present for multi-clinic users
6. confirm active clinic switching updates accessible screens
7. confirm logout/login roundtrip still works

---

## 4. System Admin Test Matrix

### Access and setup

- [ ] `/admin/clinics` loads
- [ ] `/admin/users` loads
- [ ] all-users view is available
- [ ] clinic-scoped view is available when a clinic is selected

### Clinic management

- [ ] create clinic works
- [ ] newly created clinic appears in listings

### User role management

- [ ] assign `DIRECTOR` role to a clinic user
- [ ] assign `MANAGER` role to a clinic user
- [ ] assign `PATIENT` role to a patient user
- [ ] assign `SYSTEM_ADMIN` globally when appropriate

### Lifecycle

- [ ] deactivate a user globally
- [ ] deactivated user cannot successfully bootstrap into the app
- [ ] self-deactivation is blocked

---

## 5. Director Test Matrix

### Research and clinic settings

- [ ] `/settings/clinic` loads
- [ ] research enabled toggle persists
- [ ] "director approval required" toggle persists

### Research export console

- [ ] `/clinics/[clinicId]/research/exports` loads
- [ ] export request with date range succeeds
- [ ] pending export can be approved
- [ ] pending export can be rejected
- [ ] completed export shows metadata and download action
- [ ] failed export shows retry action

### Admin and oversight

- [ ] `/admin/users` loads in clinic-scoped mode
- [ ] clinic roster visibility is correct
- [ ] allowed role assignments work
- [ ] audit page loads
- [ ] dashboard loads director metrics

---

## 6. Manager Test Matrix

### Today board

- [ ] `/today` loads
- [ ] selected date changes data set
- [ ] active shifts list renders
- [ ] check-ins group by status
- [ ] assignment modal opens for waiting patient
- [ ] only active staff appear in assignment options
- [ ] reassignment flow works

### Clinic operations

- [ ] manager can check into a shift
- [ ] manager can check out own shift
- [ ] manager can see active shifts for the clinic
- [ ] manager can create patient check-ins if that flow is available in the UI/API path under test

### Management views

- [ ] audit page loads
- [ ] dashboard loads manager/director-level metrics
- [ ] `/admin/users` allows allowed lifecycle actions

---

## 7. Volunteer Test Matrix

### Patient and encounter flow

- [ ] `/patients` loads
- [ ] new patient form works
- [ ] patient profile loads
- [ ] new encounter starts successfully
- [ ] vitals form saves
- [ ] diabetes screening form saves
- [ ] hypertension form saves
- [ ] submit for review works

### Consent

- [ ] patient consent page loads
- [ ] consent grant works
- [ ] consent revoke works

### Ops

- [ ] `/my/assigned` loads
- [ ] volunteer can check in for shift
- [ ] volunteer sees assigned patients
- [ ] volunteer can start intake from assigned list
- [ ] start intake routes into encounter page

---

## 8. Preceptor Test Matrix

- [ ] queues page shows review workload
- [ ] encounter in review is visible
- [ ] preceptor review action works
- [ ] preceptor cannot finalize if not permitted
- [ ] dashboard loads preceptor metrics
- [ ] assigned or clinical visibility behaves correctly in current clinic

---

## 9. Doctor Test Matrix

- [ ] queues page shows finalize-ready encounters
- [ ] encounter detail loads for in-review encounter
- [ ] care plan can be saved
- [ ] prescriptions can be created
- [ ] prescriptions can be edited before finalization
- [ ] encounter finalization works
- [ ] finalized encounter becomes read-only
- [ ] follow-up reminder is created when follow-up date exists
- [ ] `/my/assigned` shows assigned patients when relevant
- [ ] dashboard loads doctor metrics

---

## 10. Patient Portal Test Matrix

### Bootstrap

- [ ] patient can log into the portal app shell
- [ ] `/portal` loads
- [ ] patient sees summary content, not staff admin pages

### Measurements and self-reports

- [ ] `/portal/health` loads
- [ ] new BP reading can be added
- [ ] new glucose reading can be added
- [ ] new weight reading can be added if exposed in current UI
- [ ] trend charts update
- [ ] `/portal/self-reports` loads
- [ ] `/portal/self-reports/new` works

### Appointments

- [ ] `/portal/appointments/request` loads
- [ ] valid date range request submits
- [ ] invalid end-before-start is rejected
- [ ] `/portal/appointments` shows new request

---

## 11. Admin Lifecycle Test Matrix

Use `/admin/users`.

- [ ] inactive filter works
- [ ] active filter works
- [ ] role filter works
- [ ] user detail sheet opens
- [ ] role revoke works for allowed targets
- [ ] clinic deactivate works for allowed targets
- [ ] global deactivate works for system admin

After deactivation:

- [ ] affected user receives disabled-user behavior on next auth/bootstrap

---

## 12. Reminder Test Matrix

- [ ] `/reminders` loads for roles with reminder read permission
- [ ] queued reminder records appear after finalization with follow-up date
- [ ] reminder statuses can be filtered
- [ ] if fake provider is used, queue still processes without external service
- [ ] if Twilio mode is enabled, webhook route accepts delivery callback correctly

---

## 13. Research Export Test Matrix

### Settings

- [ ] research-disabled clinic blocks export request
- [ ] research-enabled clinic accepts request
- [ ] approval-required clinic keeps request pending
- [ ] auto-approved clinic queues immediately

### Export behavior

- [ ] export list renders
- [ ] detail metadata renders
- [ ] row counts render when available
- [ ] completed export can download ZIP
- [ ] failed export can retry

### Data safety checks

- [ ] exported artifact contains manifest and CSV pack
- [ ] no patient names in exported files
- [ ] no phone numbers in exported files
- [ ] no raw internal IDs in de-identified CSV output

---

## 14. Dashboard Test Matrix

- [ ] dashboard loads with correct clinic context
- [ ] summary cards render
- [ ] role-specific sections appear only for matching roles
- [ ] charts render without errors
- [ ] recent activity or trend sections contain expected values for seeded data

---

## 15. Offline and Sync Test Matrix

Core staff flows only:

- [ ] offline create or draft behavior still works where supported
- [ ] outbox count increases when local changes are queued
- [ ] sync button or sync provider drains outbox when online
- [ ] synced data becomes visible in server-backed views

Known caveat:

- newer ops and portal features should be tested with connectivity because they are more online-first

---

## 16. Recommended End-to-End Smoke Script

### Staff path

1. Log in as `VOLUNTEER`.
2. Create a patient.
3. Start a new encounter.
4. Fill vitals and screening.
5. Submit for review.

6. Log in as `PRECEPTOR`.
7. Open the encounter.
8. Complete preceptor review.

9. Log in as `DOCTOR`.
10. Open the encounter.
11. Add care plan and prescription.
12. Finalize encounter.

### Ops path

13. Log in as `MANAGER`.
14. Open `/today`.
15. Check in as manager or confirm other staff active shifts.
16. Create or confirm a patient check-in.
17. Assign volunteer and doctor.

18. Log in as `VOLUNTEER`.
19. Open `/my/assigned`.
20. Start intake for assigned patient.

### Research path

21. Log in as `DIRECTOR`.
22. Enable research settings if needed.
23. Open research exports page.
24. Request export.
25. Approve export if required.
26. Confirm processing completes and download is available.

### Portal path

27. Log in as `PATIENT`.
28. Open `/portal`.
29. Log a measurement.
30. Request an appointment.

### Admin path

31. Log in as `SYSTEM_ADMIN`.
32. Open `/admin/users`.
33. Deactivate a non-critical test user.
34. Confirm disabled user can no longer bootstrap.

---

## 17. Common QA Failure Patterns

### "No access" in UI

Check:

- role assignment in Nkwapa
- active clinic
- effective permissions from `/auth/whoami`

### API 403 even though login worked

Check:

- `X-Clinic-Id`
- clinic membership
- whether the route expects global or clinic-scoped permission

### Reminder never sends

Check:

- Redis
- API worker process
- provider config

### Research export never completes

Check:

- research enabled setting
- approval state
- Redis
- GitHub env vars
- API logs for transform or sync failure

### Portal data missing

Check:

- patient role
- patient account link
- clinic context

---

## 18. Related Guides

- `docs/FEATURE_WORKFLOWS_GUIDE.md`
- `docs/USER_AND_ROLE_SETUP_GUIDE.md`
- `IMPLEMENTATION_STATUS.md`
- `memory.md`
