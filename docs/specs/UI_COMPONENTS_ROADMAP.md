Since the plumbing is working, the smartest next move is to lock a basic, usable UI and then expand feature-by-feature without breaking offline/RBAC/audit.

Below is a detailed, comprehensive implementation list organized as: 1. What features still need work (v1 + near-term) 2. What UI screens/components you need (basic UI first) 3. Agent-ready execution plan (sequenced + parallelizable) 4. Backlog of future/additional features (so you don’t paint yourself into a corner)

⸻

1. Features still needed to make “v1 usable” (HTN/DM clinics)

A. Core clinical workflow completeness

Right now you likely have “create patient/encounter/screening/consent/sync.” To make it usable in clinic ops, you need: 1. Encounter state machine enforcement

    •	Allowed transitions:
    •	DRAFT → IN_REVIEW → FINALIZED
    •	Who can transition:
    •	Volunteer: create/edit DRAFT + submit for review
    •	Preceptor: review/edit, approve for doctor
    •	Doctor: finalize
    •	Hard rule:
    •	FINALIZED encounters become read-only (except admin break-glass later)
    •	Audit events:
    •	ENCOUNTER.SUBMIT_FOR_REVIEW
    •	ENCOUNTER.PRECEPTOR_REVIEW
    •	ENCOUNTER.FINALIZE

    2.	Clinical rules engine (v1 simple, but consistent)

    •	BP classification calculated and stored (normal/elevated/stage1/stage2/crisis)
    •	DM suspicion rules (fasting/random thresholds)
    •	Doctor override + override reason (small field)
    •	Flag “needs urgent attention” when crisis thresholds hit

    3.	Follow-up scheduling

    •	Doctor sets follow-up date in CarePlan
    •	System schedules reminder job
    •	Display follow-up on patient profile and encounter summary

    4.	Medication placeholder (v1 stub)

Even if full integration is later:

    •	Record “medication prescribed: yes/no”
    •	Optional: free-text medication notes (until integration)
    •	A structured model can come later

⸻

B. Offline + sync product readiness

Your sync works; now make it clinic-friendly: 1. Offline-first UX polish

    •	Always-visible sync indicator:
    •	Online/Offline
    •	pending mutations count
    •	last successful sync time
    •	“Sync now” button + progress status
    •	Conflict UI:
    •	duplicate national ID resolution flow (manual merge later, for now: pick existing vs cancel)

    2.	Data integrity

    •	Idempotency keys required on mutation apply
    •	Server rejects invalid transitions and returns structured errors
    •	Client “retries” failed outbox items with backoff

    3.	Local storage management

    •	Cache eviction rules:
    •	keep last N encounters per clinic (e.g., 30 days) locally
    •	keep patient index locally for search
    •	“Clear local cache” option (manager only)

⸻

C. Security + operational essentials (minimum viable)

You can do more later, but v1 needs: 1. Audit viewer (basic)

    •	A simple admin page to view audit events by:
    •	clinic
    •	user
    •	patient
    •	date range
    •	This is huge for debugging and trust

    2.	Rate limiting (basic)

    •	Apply to:
    •	auth-protected endpoints
    •	sync endpoints
    •	Redis-based limiter

    3.	Error handling + logging

    •	Standard error response schema
    •	Correlation IDs:
    •	request_id passed through logs + audit events

⸻

2. Basic UI to implement now (minimal but complete)

You said “basic UI now; later full dashboard like the mock images.” Great. Here’s the basic UI that still feels like a product.

A. App shell (global) 1. Top bar

    •	Clinic selector (locked to clinics user belongs to)
    •	Role badges (multiple roles)
    •	Sync status indicator
    •	User menu (logout)

    2.	Left nav (minimal)

Show based on permissions:

    •	Patients
    •	Check-in (New Encounter)
    •	Queues
    •	Drafts (Volunteer)
    •	Needs Review (Preceptor)
    •	Ready to Finalize (Doctor)
    •	Audit (Manager/Director/Admin)
    •	Settings (Director/Admin)

B. Screens (MVP set) 1. Login + bootstrap

    •	redirect to Keycloak
    •	on return: call /auth/whoami
    •	select default clinic
    •	store activeClinicId

    2.	Patients

    •	Patient Search
    •	search by patient_code, name, phone, last4 national ID
    •	results list + quick actions
    •	New Patient
    •	Ghana phone input (country locked)
    •	national ID type + value (masked input)
    •	demographic fields
    •	Patient Profile
    •	overview (demographics + consent status)
    •	encounters list (recent first)
    •	“Start New Visit” button
    •	consent section (grant/revoke)

    3.	Check-in (Encounter Wizard)

Single flow that adapts by role:

    •	Step 1: pick patient (search + create)
    •	Step 2: vitals
    •	Step 3: HTN assessment (auto classification)
    •	Step 4: DM screening
    •	Step 5: submit for preceptor review

    4.	Queues

    •	Volunteer Draft queue
    •	Preceptor review queue
    •	Doctor finalize queue

Each row shows:
• patient name + code
• encounter created time
• key alerts (BP stage, glucose threshold flags)
• action button: “continue”, “review”, “finalize”

    5.	Encounter Detail

    •	Read/Write depends on status + role
    •	Show:
    •	vitals
    •	screening
    •	computed classifications
    •	notes
    •	audit mini-timeline (optional basic)

    6.	Finalize Encounter (Doctor)

    •	care plan form:
    •	counseling given
    •	meds prescribed
    •	follow-up date
    •	notes
    •	“Finalize” action (locks)

    7.	Audit (basic)

    •	table of audit events
    •	filters by clinic/user/patient/date

    8.	Research Settings (Director)

    •	toggle: research enabled for clinic
    •	export request/approve workflow later, but settings screen now is fine

C. Component library checklist (so UI agents don’t freestyle)
• Data table component (patients list, queues)
• Form components with validation
• Status badges (draft/in review/finalized)
• Sync indicator component
• Clinic selector component
• Phone input component (locked GH)

⸻

3. Detailed agent plan (sequential + parallel)

Phase 1 — UI MVP (basic shell + workflows)

Agent UI-1: App Shell + Routing
• top bar (clinic selector, role badges, sync status)
• left nav (permission-based)
• route guards + bootstrap whoami

Agent UI-2: Patients
• search + create + profile
• consent section on profile

Agent UI-3: Encounter Wizard + Encounter Detail
• check-in wizard
• encounter detail view
• submit/review/finalize flows

Agent UI-4: Queues
• draft/review/finalize queues
• query endpoints and display

Phase 2 — Backend workflow hardening

Agent API-1: Encounter state machine
• enforce transitions
• role-based permissions per action
• reject edits after FINALIZED
• audit events

Agent API-2: Reminders
• reminder creation from care plan
• worker + fake SMS provider
• UI page to view reminder queue (optional now)

Agent API-3: Audit viewer endpoints
• list audit events with filters
• include correlation/request IDs

Phase 3 — Research gating (no export yet)

Agent API-4: Clinic research settings
• CRUD settings (Director only)
• audit events for changes
Agent UI-5: Settings UI
• toggle + status display

⸻

4. Future + additional features backlog (comprehensive)

Clinical expansion
• Full medication module + external partner integration
• Lab orders/results, attachments, PDFs
• Chronic disease longitudinal tracking (BP trend graphs, A1c history)
• ICD coding, problem list
• Immunizations, allergies (later)

Operations
• Appointment scheduling + calendar view
• Staff management UI (Manager/Director)
• Reports:
• HTN/DM prevalence
• follow-up adherence
• high-risk patient lists
• Export CSV reports per clinic

Research pipeline
• De-identification policy engine (field-level)
• Consent revocation propagation + dataset versioning
• Export to S3/MinIO + encrypted dataset storage
• Audit evidence + approval workflow UI

Security/compliance hardening
• Break-glass access (time-limited)
• Fine-grained permissions per clinic
• RLS (optional) for DB enforcement
• Advanced rate limiting + abuse detection
• Data retention + purge policies
• Backup/restore runbooks

Communications
• SMS provider integration (Twilio or Ghana provider)
• WhatsApp integration (future)
• templated messaging + localization

Platform
• Mobile-first PWA improvements
• Multi-region support (country codes, phone rules, formats)
• Monitoring dashboards (Grafana)
• Incident runbooks + alerting

⸻
