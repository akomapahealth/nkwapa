# Feature Workflows Guide

This guide explains how the currently implemented product is intended to work across staff, admin, and patient surfaces.

It focuses on real workflow behavior, not internal code structure.

---

## 1. Who Uses What

| User type    | Main surfaces                                                        |
| ------------ | -------------------------------------------------------------------- |
| Volunteer    | patients, encounters, queues, my assigned                            |
| Doctor       | queues, encounters, dashboard                                        |
| Doctor       | queues, encounters, dashboard, reminders, my assigned                |
| Manager      | today board, patients, audit, admin users, dashboard                 |
| Director     | clinic settings, research exports, admin users, audit, dashboard     |
| System admin | all clinics, all users, clinic lifecycle, merge and global oversight |
| Patient      | claim record, portal overview, health, self-reports, appointments    |

---

## 2. Login And App Entry

1. The user signs in through Keycloak.
2. The web app calls `/auth/whoami`.
3. The API returns memberships, active clinic, effective permissions, and onboarding state.
4. The app picks the active clinic from the stored clinic, request header, or first membership.
5. If the user is a patient with a pending invite, the app routes them to `/claim-record`.

Important rules:

- identity is managed by Keycloak
- permissions and clinic memberships are stored in Nkwapa
- a user usually needs to log in once before appearing in local admin tables

### Forgot password

1. The user opens the Keycloak Forgot Password link from the sign-in page.
2. Keycloak asks for username or email and sends the reset email through the realm SMTP settings.
3. The reset link opens the themed Keycloak update-password flow.
4. After the password is changed, Keycloak forces a fresh login and returns the user through the
   normal app redirect.

Recovery behavior:

- local development uses Mailpit at `http://localhost:8025`
- staging and production require real `KC_SMTP_*` secrets on the Keycloak service
- expired or invalid reset links show the branded recovery page with actions to request a new link
  or return to sign in
- admins should trigger password reset emails with Keycloak Admin REST `execute-actions-email` and
  `["UPDATE_PASSWORD"]`

---

## 3. Staff Clinical Workflow

Use this when the primary task is documenting care.

1. Search for an existing patient or create a new one.
2. Open the patient chart.
3. Start a new encounter.
4. Complete vitals and screening data.
5. Submit the encounter for review.
6. A clinical reviews the encounter.
7. A doctor finalizes the encounter, completes the care plan, and adds prescriptions if needed.

Finalization effects:

- the encounter becomes read-only
- follow-up reminders can be scheduled
- downstream ops status can be advanced by staff workflows

---

## 4. Operations-First Workflow

Use this when the clinic is working from the floor-management view.

1. Staff checks in for a shift.
2. Patients are checked in as they arrive.
3. A manager assigns a volunteer and doctor.
4. Volunteers or doctors open `/my/assigned`.
5. The volunteer starts intake from the assigned patient.
6. The workflow enters the regular encounter flow.

Main pages:

- `/today`
- `/my/assigned`

---

## 5. Patient Registry Workflow

### Create patient

1. Open `/patients/new`.
2. Enter demographics and contact details.
3. If national ID is provided, the backend stores encrypted and hashed values.
4. Submit the form.
5. The app redirects to the patient chart.

### Search or browse registry

1. Open `/patients`.
2. Search by name, patient code, phone, or related terms.
3. Use either classic paged browsing or the newer cursor-ready list API behavior behind the page.
4. Open the selected chart.

### Update chart

1. Open the patient detail page.
2. Use edit actions for demographics or chart maintenance.
3. Save changes.

---

## 6. Portal Link, Invite, And Claim Flow

There are two supported staff-side patterns for patient access:

### Direct link

Use when the patient already has a local Nkwapa user account.

1. Open the patient chart.
2. Use the portal-link action.
3. Search for eligible local users.
4. Link the correct identity to the chart.

### Invite and claim

Use when you want the patient to claim access later.

1. Open the patient chart.
2. Create a portal invite with email and/or phone.
3. The invite remains pending for claim.
4. When the patient logs in, `/auth/whoami` can return `PATIENT_CLAIM_REQUIRED`.
5. The user completes `/claim-record`.
6. The patient record becomes linked to that portal account.

Important safety rules:

- merged charts cannot be claimed
- charts missing required identity details can block claim completion
- clinic staff should always link or invite from the correct chart

---

## 7. Duplicate Patient Merge Workflow

Duplicate chart merge is currently a system-admin action.

1. Open the canonical patient chart.
2. Launch the merge dialog.
3. Search for the duplicate source chart.
4. Confirm the merge.
5. The source chart is marked as merged into the canonical chart.
6. The old patient code is retained as an alias for lookup and historical references.

Current constraint:

- merges are limited to records in the same clinic

---

## 8. Patient Portal Workflow

Once a patient account is linked or claimed, the patient can:

- open `/portal`
- log measurements in `/portal/health`
- submit self-reports in `/portal/self-reports`
- request appointments in `/portal/appointments`
- review trends, recent readings, recommendations, and reminders

Staff-facing related reads include:

- patient measurements
- patient trends
- patient self-reports
- appointment request review and confirmation/rejection

---

## 9. Research Export Workflow

1. A director or other authorized user opens the clinic research export console.
2. They request an export for a date range.
3. If the clinic requires approval, an approver approves it.
4. A background job creates the de-identified ZIP artifact.
5. The result can be downloaded and, when configured, synced to GitHub.

Gate checks:

- clinic research must be enabled
- requester needs `RESEARCH.EXPORT.REQUEST`
- approver needs `RESEARCH.EXPORT.APPROVE` when approval is required
- patient consent is evaluated at execution time

---

## 10. Reminder Workflow

### Follow-up reminders

1. A doctor sets a follow-up date in the care plan.
2. The encounter is finalized.
3. Reminder records are created.
4. BullMQ workers deliver them through the configured SMS or email provider.

### Status review

Staff can inspect queued, sent, delivered, or failed reminders from the reminder list.

---

## 11. Current UX Recovery Expectations

Users should not hit raw blank screens for normal failures.

Current product behavior includes:

- root loading skeletons while a route is still resolving
- app-wide error boundaries with retry actions
- inline API error messaging with recovery guidance
- not-found fallback state
- timeout and network-aware frontend API errors

This baseline exists across the app, though some newer pages still need more route-specific polish.
