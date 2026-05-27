Got it. Your permission keys are clean and consistent — we can map them to nav visibility + route guards without inventing anything. Then we’ll move straight into the next backend items (1–3) with an agent-executable plan; and I’ll also outline the duplicate-patient conflict workflow (4) so UI can pick it up right after.

⸻

1. Permission mapping → Nav items + Route Guards

Navigation map (Basic UI)

Queues (landing: /queues)
• Show “Queues” parent if user has any of:
• ENCOUNTER_READ or ENCOUNTER_CREATE or ENCOUNTER_REVIEW or DOCTOR_FINALIZE
• Child tabs:
• Drafts: ENCOUNTER_READ (and typically ENCOUNTER_CREATE)
• Review: ENCOUNTER_REVIEW
• Finalize: DOCTOR_FINALIZE

Patients
• Show “Patients” nav if user has any of:
• PATIENT_SEARCH or PATIENT_READ or PATIENT_CREATE
• /patients (list/search): requires PATIENT_SEARCH
• /patients/new: requires PATIENT_CREATE
• /patients/:id: requires PATIENT_READ (or allow via PATIENT_SEARCH + server enforces read)

Encounter
• /patients/:id/encounters/new: requires ENCOUNTER_CREATE
• /encounters/:id: requires ENCOUNTER_READ

Consent UI (inside patient profile)
• Show consent grant/revoke controls if CONSENT_RECORD

Audit
• Show “Audit” nav if AUDIT_READ
• /audit: requires AUDIT_READ

Settings
• Show “Clinic Settings” nav if RESEARCH_SETTINGS_UPDATE or CLINIC_MANAGE
• /settings/clinic: requires RESEARCH_SETTINGS_UPDATE (and/or CLINIC_MANAGE, but your mapping uses RESEARCH_SETTINGS_UPDATE for research toggles)

Sync status / manual sync
• Sync pill shows for everyone, but “Sync now” action requires both:
• SYNC_PUSH and SYNC_PULL

Frontend route guard policy (simple, consistent)
• Every page under (app) uses whoami bootstrap.
• Route guard checks effective permissions:
• if '\*' allow all
• else require the page’s permission
• If denied: show a friendly “No access” page with a link back to /queues.

Backend guard policy (truth source)
• Backend uses your decorators/guards:
• @RequirePermission(PERMISSIONS.X)
• @ClinicScoped() + ClinicScopeGuard for any clinic route
• Frontend is convenience only; backend is enforcement.

⸻

2. Next backend items (clinic-ready): detailed, agent-executable plan

You listed 4. We’ll tackle 1–3 as backend deliverables and 4 as a UI workflow (with a small backend support endpoint if needed).

2.1 Reminder worker + Fake SMS provider

Goal: When a Doctor finalizes an encounter with followUpDate, a reminder is scheduled and “sent” by a worker (fake provider in dev), with auditable results.

Backend tasks 1. Reminder scheduling hook

    •	In Encounter finalize flow (or CarePlan write):
    •	if followUpDate exists and patient has phoneE164:
    •	create Reminder row:
    •	status=QUEUED
    •	scheduledAt = followUpDate (or followUpDate - 1 day if you prefer; make it configurable later)
    •	channel=SMS
    •	toAddress=patient.phoneE164
    •	templateKey="FOLLOWUP_REMINDER_V1"
    •	payloadJson includes patientCode, clinicName, followUpDate
    •	audit: REMINDER.CREATE
    •	else if no contact:
    •	create Reminder FAILED with failureReason=NO_CONTACT_METHOD (optional but useful), audit it.

    2.	Worker process

    •	Add apps/api/src/reminders/ module OR apps/api/src/worker.ts entrypoint.
    •	Use Redis queue (BullMQ recommended).
    •	Job payload: reminderId
    •	Worker pulls reminder, checks scheduledAt <= now, sends, updates status.

    3.	Fake SMS provider

    •	Implementation: writes to logs + stores providerMessageId="fake:<uuid>".
    •	Also store “sent body” in logs (not DB) or put into payloadJson.sentBody for dev only (prefer logs).

    4.	Endpoints

    •	GET /clinics/:clinicId/reminders?status=&from=&to=&cursor= requires REMINDER_READ
    •	(Optional dev) POST /clinics/:clinicId/reminders/test requires SYSTEM_ADMIN or CLINIC_MANAGE

    5.	Configuration

    •	.env:
    •	SMS_PROVIDER=fake|twilio (twilio later)
    •	REMINDER_POLL_INTERVAL_MS=... (if polling)
    •	Keep Twilio out for now, but design provider interface cleanly.

Acceptance criteria
• Finalize encounter with follow-up date → reminder row created
• Worker running → reminder transitions QUEUED → SENT
• AuditEvent created for reminder create + send
• Listing reminders works and respects clinic scope

⸻

2.2 Encounter state machine hardening (server-side)

Goal: Make it impossible for clients (or sync) to violate workflow rules.

Rules (v1)
• DRAFT:
• Volunteer can write vitals/screening, and submit for review
• IN_REVIEW:
• Doctor can write screening + mark clinical reviewed
• Doctor can write care plan + finalize, but only if clinical reviewed (configurable later)
• FINALIZED:
• No edits to vitals/screening/care plan (except SYSTEM_ADMIN; break-glass later)

Backend tasks 1. Centralize transition logic in EncounterService

    •	Methods:
    •	submitForReview(encounterId, actor)
    •	reviewEncounter(encounterId, actor)
    •	finalize(encounterId, actor)
    •	Each method:
    •	loads encounter + related pieces
    •	verifies current status + required fields exist
    •	updates encounter fields
    •	emits audit events

    2.	Gate writes based on status

    •	In each upsert:
    •	Vitals upsert: allowed only if status !== FINALIZED
    •	Screening writes: allowed only if status !== FINALIZED
    •	Care plan: allowed if status === IN_REVIEW and actor has doctor perms (or manager/admin)

    3.	Structured errors

Return error codes UI can render:

    •	ENCOUNTER_FINALIZED_READONLY
    •	ENCOUNTER_INVALID_TRANSITION
    •	ENCOUNTER_MISSING_REQUIRED_FIELDS
    •	ENCOUNTER_ENCOUNTER_REVIEW_REQUIRED

Acceptance criteria
• Any attempt to edit FINALIZED encounter fails with 409 + code
• Submit/review/finalize enforce status transitions
• Sync push applying illegal mutations returns structured conflict results (per mutation)

⸻

2.3 Audit query filters + pagination

Goal: Make /audit usable and performant.

Backend tasks 1. Add query endpoint (clinic-scoped)

    •	GET /clinics/:clinicId/audit
    •	Params:
    •	from, to (ISO dates)
    •	action (exact match or prefix)
    •	actorUserId
    •	entityType
    •	entityId
    •	requestId
    •	cursor (opaque) and limit (default 50, max 200)

    2.	Cursor pagination

Use createdAt + id as cursor:

    •	response:
    •	items: AuditEvent[]
    •	nextCursor: string | null

Cursor encodes { createdAt, id } base64.

    3.	Index sanity (DB)

Ensure indexes already exist:

    •	(clinicId, createdAt)
    •	(actorUserId, createdAt)
    •	(action)

You already have most in Prisma schema.

Acceptance criteria
• Audit list supports filters without full table scan
• Pagination works deterministically

⸻

3. Conflict resolution UI improvements (duplicate patient)

This is mostly UI, but backend should support a better resolution workflow.

Current behavior (likely)
• Patient create returns 409 with existing patient summary when nationalIdHash conflicts.

Improved workflow (v1) 1. On 409 duplicate:

    •	Dialog shows:
    •	existing patient_code + name + phone
    •	Actions:
    •	“Open existing patient” (navigate to profile)
    •	“Search again” (closes dialog)
    •	“Create anyway” NOT allowed for now (prevents duplicates)

    2.	Add optional endpoint for “suspected duplicates” (future)

    •	GET /clinics/:clinicId/patients/duplicates?cursor=...
    •	Not needed for basic UI; just a future feature.

⸻

4. Agent prompts for the next backend items (copy/paste)

API Agent 1 — Reminders worker + fake SMS

Implement Reminder worker + Fake SMS provider.

Requirements:

- On encounter finalize, if carePlan.followUpDate exists, schedule Reminder row (QUEUED) with templateKey FOLLOWUP_REMINDER_V1 and payloadJson.
- Implement reminders module + queue using BullMQ (Redis).
- Implement worker entrypoint that processes queued reminders:
  - If scheduledAt <= now, send via SmsProvider
  - FakeSmsProvider logs and sets providerMessageId="fake:<uuid>"
  - Update Reminder status to SENT and sentAt.
- Add endpoints:
  - GET /clinics/:clinicId/reminders (filters + pagination optional) guarded by REMINDER_READ
- Emit audit events for REMINDER.CREATE and REMINDER.SENT (or REMINDER.SEND_FAILED).
- Keep provider interface extensible for Twilio later (but do not implement Twilio now).

Tests:

- finalize encounter creates reminder
- worker processes and marks as SENT

API Agent 2 — Encounter state machine enforcement

Harden encounter state machine server-side.

Implement:

- submitForReview: DRAFT -> IN_REVIEW (requires ENCOUNTER_SUBMIT_FOR_REVIEW)
- reviewEncounter: allowed only in IN_REVIEW (requires ENCOUNTER_REVIEW), sets preceptorReviewedById
- finalize: allowed only in IN_REVIEW and requires doctor perms; require preceptorReviewedById present; sets status FINALIZED and doctorFinalizedById

Enforce readonly:

- Reject vitals/screening/careplan writes when status FINALIZED (except SYSTEM_ADMIN)
  Return structured error codes.

Ensure sync mutations that attempt invalid edits return conflict responses per mutation.

Add audit events for each transition.
Add integration tests for transition rules and FINALIZED readonly enforcement.

API Agent 3 — Audit filters + cursor pagination

Implement clinic-scoped audit query endpoint with filtering and cursor pagination.

Endpoint:
GET /clinics/:clinicId/audit?from=&to=&action=&actorUserId=&entityType=&entityId=&requestId=&cursor=&limit=
Guard:

- AUDIT_READ + ClinicScope

Cursor:

- base64 encode { createdAt, id }
  Response:
- items + nextCursor

Add tests for:

- filtering by action and actor
- cursor pagination ordering stable

⸻

5. Quick note: nav/route guards implementation on web

Your UI agents should use these permission checks:
• /queues/\*: ENCOUNTER_READ AND one of:
• Drafts tab: ENCOUNTER_CREATE or ENCOUNTER_READ
• Review tab: ENCOUNTER_REVIEW
• Finalize tab: DOCTOR_FINALIZE
• /patients: PATIENT_SEARCH
• /patients/new: PATIENT_CREATE
• /patients/:id: PATIENT_READ
• /audit: AUDIT_READ
• /settings/clinic: RESEARCH_SETTINGS_UPDATE (or allow CLINIC_MANAGE too if you want)
