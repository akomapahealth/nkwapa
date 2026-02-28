⸻

/docs/specs/04_OFFLINE_FIRST_AND_SYNC.md

Goal

Enable offline-first functionality:
	•	Create patient
	•	Create encounter
	•	Record vitals and HTN/DM screening
	•	Record consent
All offline-capable and sync when online.

Client storage

Use IndexedDB via Dexie.

Local tables (IndexedDB)
	•	patients
	•	encounters
	•	vitals
	•	diabetes_screenings
	•	hypertension_assessments
	•	care_plans
	•	patient_consents
	•	outbox (mutations queue)
	•	sync_state (last sync cursor per clinic)

Outbox mutation format

Each mutation is an object:
	•	id (uuid)
	•	entity_type
	•	entity_id
	•	operation (UPSERT/DELETE)
	•	clinic_id
	•	payload_json
	•	idempotency_key
	•	created_at

Sync protocol (v1)

Endpoint: POST /sync/push

Client sends ordered outbox mutations.
Server:
	•	validates RBAC + clinic scope
	•	applies idempotently
	•	emits audit events
	•	returns accepted mutations + any conflicts

Endpoint: GET /sync/pull?clinic_id=...&since=cursor

Server returns changes since cursor (by updated_at or incremental change log).

Conflict resolution
	•	Patients: do not auto-merge; return “duplicate suspected” if national_id_hash conflicts.
	•	Encounters/vitals/screening: server canonical wins if encounter is FINALIZED.
	•	Draft encounter edits: last write wins with version check.

UI requirements
	•	Persistent “Sync status” indicator
	•	Manual “Sync now” button
	•	Conflict dialog for duplicates
