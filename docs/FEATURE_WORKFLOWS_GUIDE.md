# Feature Workflows Guide

This guide explains how the currently implemented product is intended to work across staff, admin, and patient surfaces.

It focuses on real workflow behavior, not internal code structure.

---

## 1. Who Uses What

| User type    | Main surfaces                                                        |
| ------------ | -------------------------------------------------------------------- |
| Volunteer    | patients, encounters, queues, my assigned                            |
| Doctor       | queues, encounters, dashboard                                        |
| Doctor       | queues, encounters, dashboard, notifications, my assigned            |
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
3. If an email address was given, an invitation email is sent to it.
4. The invite remains pending for claim.
5. When the patient logs in, `/auth/whoami` can return `PATIENT_CLAIM_REQUIRED`.
6. The user completes `/claim-record`.
7. The patient record becomes linked to that portal account.

What the invitation email contains:

- the clinic name and the patient's first name
- the patient code, which the claim step requires
- a link to sign in, when a public web address is configured
- the invite expiry, when one was set

It deliberately contains no other identifying detail. The address is supplied by staff
and is unverified until the account is claimed.

Delivery status:

- the invite card on the chart shows whether the email was queued, sent, or failed
- a failed invite explains the reason and what to do about it
- "Resend invite email" sends the same invite again without changing its identity
- a phone-only invite sends nothing and says so, rather than reporting a failure

Important safety rules:

- merged charts cannot be claimed
- charts missing required identity details can block claim completion
- clinic staff should always link or invite from the correct chart
- an invite email alone never grants access; the claim step still matches email, patient
  code, and date of birth

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

## 10. Notification Workflow

Every message the clinic sends is recorded in one place and reviewed from the
notifications surface. Reminders, portal invites, appointment updates, and staff access
notices all appear there.

### Follow-up reminders

1. A doctor sets a follow-up date in the care plan.
2. The encounter is finalized.
3. Reminder records are created.
4. BullMQ workers deliver them through the configured SMS or email provider.

### Appointment reminders

1. Staff confirm an appointment request.
2. Reminder records are created for available contact channels and linked to the appointment.
3. Rescheduling suppresses queued reminders for the previous appointment time and creates replacement reminders for the new time.
4. Cancellation, completion, and no-show states suppress future queued appointment reminders.
5. If a patient has no usable contact method, a failed reminder record is kept with `NO_CONTACT_METHOD`.
6. Workers re-check appointment state before sending, so cancelled, completed, no-show, or stale rescheduled reminders are not delivered.

### Appointment updates

1. Confirming, rescheduling, or cancelling an appointment emails the patient, when an
   address is on file.
2. A reschedule email names both the previous and the new time.
3. A cancellation email carries the reason staff entered.
4. Completion and no-show send nothing. They are internal outcomes.

### Staff access notices

1. Granting or removing a clinic role emails the staff member.
2. Deactivating an account emails them, saying whether it applies to one clinic or to
   the whole account.
3. Re-granting a role somebody already holds sends nothing, because nothing changed.
4. A staff member with no email address on file still has their access changed; the
   ledger records that no message could be sent.

### Status review

Staff review queued, sent, delivered, or failed messages from the notifications surface,
filtered by status, channel, type, or date. Appointment rows also summarize reminder
state with queued, delivered, and failed counts, so operators can spot delivery issues
without leaving the schedule. Those counts include only the 24-hour reminder, not the
appointment update emails.

Two things worth knowing when reading a status:

- **Only SMS reports Delivered.** The SMS provider sends a delivery receipt; SMTP has no
  equivalent, so an email that was accepted stops at Sent. That is success, not a stall.
- **A failed row explains itself.** Each failure names what went wrong and what to do,
  and says nothing about retrying where retrying cannot help, such as a reminder
  suppressed because its appointment was cancelled.

### When email is unavailable

If the server is set to send real email but the SMTP settings are incomplete, the
notifications surface shows a banner naming the missing settings, and affected messages
are recorded as failed with `EMAIL_NOT_CONFIGURED` rather than disappearing. The API
still starts and every other workflow continues to work.

Outside production the fake provider is normal: messages are recorded and logged but not
delivered, and the banner says so rather than reporting a fault.

### Email configuration

Application email is configured with `EMAIL_PROVIDER`, `SMTP_HOST`, `SMTP_PORT`,
`SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE`, `EMAIL_FROM`, `EMAIL_REPLY_TO`, and
`APP_PUBLIC_URL`. See `.env.example` for the full annotated list.

- `SMTP_USER` and `SMTP_PASS` are optional, but only as a pair. Leave both blank for an
  unauthenticated relay; setting one without the other is reported as a misconfiguration.
- `APP_PUBLIC_URL` is what links in outbound mail are built from. When it is unset, mail
  is sent without a link rather than with a broken one.
- Locally, point the app at the Mailpit in `infra/nkwapa/docker-compose.yml`
  (`SMTP_HOST=localhost`, `SMTP_PORT=1025`) and read the inbox at http://localhost:8025.

### Authenticating the sending domain

Configuring SMTP makes the app able to send. It does not make receiving providers trust
what arrives. Since 2024 Gmail and Yahoo reject or spam-folder unauthenticated mail, so the
domain in `EMAIL_FROM` needs three DNS records before patient mail is reliable:

- **SPF** — one TXT record at the apex naming every service allowed to send. For Google
  Workspace that is `v=spf1 include:_spf.google.com ~all`. Exactly one SPF record per
  domain; adding a second is a permanent error that fails worse than having none.
- **DKIM** — generated in the Google Admin console under Apps → Google Workspace → Gmail →
  Authenticate email, then published as a `google._domainkey` TXT record. Publish the
  record first and start authentication only once it resolves.
- **DMARC** — a `_dmarc` TXT record saying what to do when the first two fail.

**Publish DKIM before tightening DMARC.** A policy of `p=quarantine` or `p=reject` with no
DKIM record leaves SPF alignment as the only thing standing between a patient invite and
the spam folder. Start at `p=none` with a `rua=` reporting address, confirm from the
reports that mail authenticates, and only then tighten.

This failure is invisible from inside the product, which is what makes it worth stating
here. The delivery ledger records `SENT` when the relay accepts a message, and SMTP offers
no delivery receipt, so an invite that was quarantined looks exactly like one that arrived.
Staff will chase the patient rather than the DNS. Verify with an external mailbox and read
the raw headers for `spf=pass` and `dkim=pass`; mail between two addresses inside the same
Workspace tenant can pass internally while failing for everyone else.

**Keycloak email is configured separately.** Verify-email and password-reset messages are
sent by Keycloak using the `KC_SMTP_*` settings on the Keycloak service. Those are a
different service, a different mailbox configuration, and are not affected by any of the
variables above.

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

---

## 12. Feature Flag Convention

Feature flags are temporary rollout controls for changes where independently enabling or disabling
the API and web experience reduces release risk. V1 flags use environment variables and the typed
readers in `apps/api/src/common/feature-flags.ts` and `apps/web/lib/feature-flags.ts`; do not read
feature-flag environment variables directly at call sites.

### Naming and defaults

- API flags use `FEATURE_<DOMAIN>_<CAPABILITY>_ENABLED`.
- Browser-visible flags use the paired
  `NEXT_PUBLIC_FEATURE_<DOMAIN>_<CAPABILITY>_ENABLED` name.
- Only a trimmed, case-insensitive `true` enables a flag.
- Missing, empty, `false`, and invalid values fail closed to disabled in every environment.
- Public `NEXT_PUBLIC_*` values are embedded when Next.js builds. Changing one requires rebuilding
  and redeploying the web app.

The medical history and allergies workflow uses the first registered pair:

```dotenv
FEATURE_MEDICAL_HISTORY_ENABLED=false
NEXT_PUBLIC_FEATURE_MEDICAL_HISTORY_ENABLED=false
```

### Reading flags

The API is authoritative. A disabled API feature must reject access before running feature logic;
the web flag only controls whether the corresponding entry point is shown.

```ts
import { NotFoundException } from '@nestjs/common';
import { isApiFeatureEnabled } from '../common/feature-flags';

export function assertMedicalHistoryEnabled() {
  if (!isApiFeatureEnabled('medicalHistory')) {
    throw new NotFoundException();
  }
}
```

```tsx
import { isWebFeatureEnabled } from '@/lib/feature-flags';

export function MedicalHistoryEntry() {
  return isWebFeatureEnabled('medicalHistory') ? <MedicalHistoryTab /> : null;
}
```

Never use a browser flag as authorization or as a substitute for permissions, tenant isolation,
validation, or audit controls.

### Adding and rolling out a flag

1. Confirm that independent rollback materially reduces risk and name an owner in the feature issue.
2. Register the typed key and explicit environment-variable reader in each affected app.
3. Add the variable with a `false` default to local, staging, and production environment templates.
4. Test parsing, mapping, disabled behavior, and both enabled and disabled feature paths.
5. Enable and validate the API first. Then enable, rebuild, and deploy the web app.

For medical history, validation includes clinic isolation, immutable revision conflicts,
no-known-allergies transitions, offline replay, and prescription acknowledgement. The complete
clinical rollout checklist is in `docs/specs/07_MEDICAL_HISTORY_AND_ALLERGIES.md`.

Medication reconciliation uses a separate pair:

```dotenv
FEATURE_MEDICATION_RECONCILIATION_ENABLED=false
NEXT_PUBLIC_FEATURE_MEDICATION_RECONCILIATION_ENABLED=false
```

Its release validation covers exact-list reconciliation, no-known-current attestation,
preferred-pharmacy uniqueness and transitions, prescription-permission separation, offline replay,
and clinic isolation. See `docs/specs/08_MEDICATION_RECONCILIATION_AND_PHARMACIES.md`.

HAP clinical notes use an online-only pair:

```dotenv
FEATURE_CLINICAL_NOTES_ENABLED=false
NEXT_PUBLIC_FEATURE_CLINICAL_NOTES_ENABLED=false
```

The API flag protects every note route, while the web flag controls encounter, patient-chart,
dashboard, and cosign-queue entry points. Enable the API first, then rebuild with the web flag.
Rollback occurs in the opposite order. Clinical-note validation includes database immutability,
explicit clinic clinical roles, assignment snapshots, idempotent signing, audit redaction, downstream
exclusion, offline content removal, and responsive browser coverage. See
`docs/specs/10_CLINICAL_NOTES.md`.

If rollback is needed, disable and redeploy the web app first, then disable the API after clients no
longer expose the feature.

### Removing a flag

Flags are not permanent application settings. After full rollout and the agreed rollback window,
the owning feature issue must schedule removal. The removal change deletes the disabled branch,
typed registry entries, environment variables, flag-specific tests, and stale documentation
together. Do not add flags for authorization policy, permanent tenant configuration, or low-risk
changes that can ship normally.
