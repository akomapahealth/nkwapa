# Nkwapa EMR: User-Side Testing Guide (by Role)

This guide describes how to perform thorough manual testing of the Basic UI with different user roles. Use it for QA, UAT, or regression testing.

---

## Prerequisites

### 1. Keycloak Setup

**Keycloak creates users for login only.** Roles are **not** stored in Keycloak. Create users in Keycloak Admin Console (Users → Add user), then assign roles via Nkwapa Admin UI or the seed script.

See [USER_AND_ROLE_SETUP_GUIDE.md](./USER_AND_ROLE_SETUP_GUIDE.md) for the full workflow.

| Role | Assigned via | Clinic Scope |
|------|---------------|--------------|
| VOLUNTEER | Nkwapa Admin → Staff | Per-clinic |
| PRECEPTOR | Nkwapa Admin → Staff | Per-clinic |
| DOCTOR | Nkwapa Admin → Staff | Per-clinic |
| MANAGER | Nkwapa Admin → Staff | Per-clinic |
| DIRECTOR | Nkwapa Admin → Staff (System Admin only) | Per-clinic |
| SYSTEM_ADMIN | Seed script or Nkwapa Admin (System Admin only) | Global (clinicId=null) |

Ensure each test user has at least one clinic membership (UserClinicRole in DB) with the desired role. Run the seed first, then assign roles via Admin → Staff.

### 2. Database Seed

```bash
pnpm db:seed
```

Set environment variables:

- `SEED_SYSTEM_ADMIN_SUB` – Keycloak `sub` of your admin user
- `SEED_SAMPLE_PATIENT=true` – Creates a demo patient and encounters (requires `NATIONAL_ID_ENCRYPTION_KEY`)

### 3. Redis (for Reminders)

The reminder worker uses Redis (BullMQ). Ensure Redis is running:

```bash
# If using docker-compose
cd infra/nkwapa && docker compose up -d redis
```

Set `REDIS_URL=redis://localhost:6379` in `.env`.

### 4. Multi-Role Test User (Optional)

Assign VOLUNTEER + PRECEPTOR + DOCTOR to one user to test tab switching and role-based UI in a single session.

---

## Test Matrix by Role

### VOLUNTEER

| Flow | Steps | Expected |
|------|-------|----------|
| Login + redirect | Log in → app loads | Redirect to `/queues` |
| Queues | View Queues page | Only "Drafts" tab visible |
| Create patient | Patients → New Patient → fill form → submit | Success, redirect to patient profile |
| Start visit | Patient profile → Start New Visit | Encounter wizard opens |
| Encounter wizard | Vitals → HTN → Diabetes → Review → Submit | Encounter moves to Review queue |
| Submit for review | Encounter detail (DRAFT) → Submit for Review | Status → IN_REVIEW |
| Cannot finalize | Encounter detail (IN_REVIEW) | No "Finalize" or "Preceptor Review" buttons |
| Cannot see audit | Sidebar / direct URL | Audit link hidden or "No access" |
| Cannot see settings | Sidebar / direct URL | Settings link hidden or "No access" |
| Cannot see reminders | Sidebar / direct URL | Reminders link hidden or "No access" |
| Sync button | Header | Disabled if user lacks SYNC.PUSH or SYNC.PULL |

### PRECEPTOR

| Flow | Steps | Expected |
|------|-------|----------|
| Queues | View Queues page | "Needs Review" tab visible (default if no Doctor) |
| Preceptor review | Open encounter from Review → Preceptor Review | Encounter moves to Finalize queue |
| Cannot finalize | Encounter detail (IN_REVIEW, preceptor-reviewed) | No "Finalize" button |
| Cannot see settings | Sidebar | Settings link hidden or 403 |

### DOCTOR

| Flow | Steps | Expected |
|------|-------|----------|
| Queues | View Queues page | "Ready to Finalize" tab visible and default |
| Care plan | Encounter detail → Care Plan tab → fill form → Save | Care plan saved |
| Finalize | Encounter detail → Finalize | Status → FINALIZED, read-only |
| Follow-up reminder | Set follow-up date in care plan → Finalize | Reminder created (QUEUED); worker processes → SENT (check Reminders page or DB) |
| Read-only finalized | Open finalized encounter | No edit controls, care plan displayed |

### MANAGER

| Flow | Steps | Expected |
|------|-------|----------|
| Audit | Sidebar → Audit | Audit page loads |
| Audit filters | Set date range, action, actor, entityType, requestId → Apply | Filtered results |
| Audit pagination | Scroll / Load more | Next page loads via cursor |
| Reminders | Sidebar → Reminders | Reminders page loads (REMINDER_READ) |
| Cannot see settings | Sidebar | Settings link hidden or "No access" |

### DIRECTOR

| Flow | Steps | Expected |
|------|-------|----------|
| Settings | Sidebar → Settings | Clinic settings page loads |
| Toggle research | Toggle research_enabled → Save | Settings persist |
| Audit | Audit page | RESEARCH_SETTINGS.UPDATE event visible after toggle |
| Reminders | Sidebar → Reminders | List reminders; filter by status, date range |
| Clinics | Sidebar → Clinics | List clinics (only those they direct); create clinic; edit clinic |
| Staff | Sidebar → Staff | List users; assign MANAGER/DOCTOR/PRECEPTOR/VOLUNTEER for their clinics |

---

## Scenario Checklist

### 1. Login + Bootstrap

- [ ] Redirect to Keycloak login
- [ ] After login, redirect to `/queues`
- [ ] Single clinic: clinic auto-selected
- [ ] Multiple clinics: clinic selector in header
- [ ] `activeClinicId` persisted in localStorage

### 2. Queues

- [ ] Default tab: Finalize (Doctor) > Review (Preceptor) > Drafts (Volunteer)
- [ ] Tabs hidden when user lacks permission
- [ ] Row click navigates to encounter detail
- [ ] Empty states render correctly

### 3. Patient Create

- [ ] Online: success → redirect to patient profile
- [ ] Offline: pending banner → sync → success
- [ ] Duplicate national ID (409): Dialog with "Open existing patient" and "Search again" actions

### 3b. Encounter Data Persistence

- [ ] Switching tabs (Vitals → Screening → Hypertension) auto-saves current section before switching
- [ ] Submit for Review saves all sections and triggers sync before changing status
- [ ] Data is visible to Preceptor/Doctor after sync completes (click Sync if "Pend" count > 0)

### 4. Encounter Workflow

- [ ] Volunteer: create → vitals → HTN → DM → submit → disappears from Drafts, appears in Review
- [ ] Preceptor: open from Review → Preceptor Review → disappears from Review, appears in Finalize
- [ ] Doctor: open from Finalize → care plan → Finalize → read-only
- [ ] FINALIZED encounter: no edit controls

### 5. Consent

- [ ] Consent tab visible only if user has CONSENT.RECORD
- [ ] Grant: status GRANTED, snapshot stored
- [ ] Revoke: status REVOKED
- [ ] Consent badge on patient profile

### 6. Sync

- [ ] Indicator: online/offline, pending count
- [ ] "Sync now" enabled only if user has both SYNC.PUSH and SYNC.PULL
- [ ] "Sync now" drains outbox when enabled
- [ ] Offline create → sync → data appears on server

### 7. Audit

- [ ] Manager/Director: `/audit` loads, filters work (from, to, action, actor, entityType, requestId)
- [ ] "Load more" appears when more results available (cursor pagination)
- [ ] Volunteer: nav link hidden or "No access"

### 8. Settings

- [ ] Director: `/settings/clinic` loads, toggles persist
- [ ] Volunteer: nav link hidden or "No access"

### 9. Reminders

- [ ] Director/Manager: `/reminders` loads (REMINDER.READ)
- [ ] Filters: status (QUEUED/SENT/FAILED), date range
- [ ] Finalize encounter with follow-up date + patient phone → reminder created (QUEUED)
- [ ] Worker running → reminder transitions to SENT (check Reminders page)

---

## Quick Manual Test Script

Run this sequence for a fast smoke test:

```
1. Login as VOLUNTEER
   → Create patient "Test A"
   → Start New Visit
   → Complete wizard (vitals, HTN, DM)
   → Submit for Preceptor Review

2. Login as PRECEPTOR
   → Open encounter from Needs Review
   → Preceptor Review

3. Login as DOCTOR
   → Open encounter from Ready to Finalize
   → Add care plan (counseling, meds, follow-up date)
   → Finalize

4. Login as MANAGER
   → /audit
   → Verify ENCOUNTER.* events
   → /reminders (if REMINDER_READ)

5. Login as DIRECTOR
   → /settings/clinic
   → Toggle research_enabled
   → /audit → verify RESEARCH_SETTINGS.UPDATE
   → /reminders → verify follow-up reminder (SENT if worker ran)
```

---

## Routes Reference

| Route | Purpose | Permissions |
|-------|---------|-------------|
| `/` | Redirect to `/queues` | Any |
| `/queues` | Queue landing (Drafts/Review/Finalize tabs) | ENCOUNTER.READ |
| `/patients` | Patient search | PATIENT.SEARCH |
| `/patients/new` | New patient form | PATIENT.CREATE |
| `/patients/[patientId]` | Patient profile | PATIENT.READ |
| `/patients/[patientId]/consent` | Record consent | CONSENT.RECORD |
| `/patients/[patientId]/encounters/new` | Check-in wizard | ENCOUNTER.CREATE |
| `/encounters/[encounterId]` | Encounter detail | ENCOUNTER.READ |
| `/audit` | Audit log | AUDIT.READ |
| `/reminders` | Reminder queue | REMINDER.READ |
| `/settings/clinic` | Clinic research settings | RESEARCH.SETTINGS.UPDATE |
| `/admin/clinics` | Admin: list, create, edit clinics | CLINIC.MANAGE |
| `/admin/users` | Admin: list users, assign/remove roles | CLINIC.MANAGE |

---

## Troubleshooting

- **403 on API calls**: Check `X-Clinic-Id` header and user's clinic membership (UserClinicRole in DB).
- **"No access" page**: User lacks required permission; check role assignments in Nkwapa Admin → Staff (roles are in the database, not Keycloak).
- **Volunteer gets "No access" on New Patient**: Verify the user has **VOLUNTEER** (not MANAGER or PRECEPTOR) assigned for the active clinic in Admin → Staff. MANAGER and PRECEPTOR do not have PATIENT.CREATE. Also ensure the correct clinic is selected in the header dropdown (multi-clinic users).
- **Sync button disabled**: User needs both SYNC.PUSH and SYNC.PULL; VOLUNTEER/PRECEPTOR/DOCTOR/MANAGER/DIRECTOR have these by default.
- **Encounter not in queue**: Verify `status` and `preceptorReviewedById` / `doctorFinalizedById` match queue stage.
- **Sync not clearing**: Check network, token validity, and server logs for mutation errors.
- **Audit empty**: Ensure `from`/`to` date range includes recent events.
- **Reminder stays QUEUED**: Ensure Redis is running and API server is up (BullMQ worker runs in same process).
- **Encounter data not visible after Submit for Review**: Data auto-saves when switching tabs and before submit. If the Preceptor still doesn't see vitals/screening, ensure the volunteer clicked Sync (or Sync ran automatically) before submitting. "Pend: N" in the header indicates outbox items awaiting sync.
