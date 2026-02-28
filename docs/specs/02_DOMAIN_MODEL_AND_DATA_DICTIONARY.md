⸻

/docs/specs/02_DOMAIN_MODEL_AND_DATA_DICTIONARY.md

Purpose

Define v1 domain entities, schema fields, and clinic scoping rules. This is the source of truth for Prisma schema.

Naming + IDs
	•	Primary keys: UUID (use UUID v4 or v7; Prisma supports uuid() by default; if v7 is desired later we can generate at app layer).
	•	Human-friendly patient identifier: patient_code (unique).

Core Entities (v1)

Clinic

Represents a physical clinic/location.
	•	id
	•	name
	•	region (optional)
	•	is_active

User

Identity is managed by Keycloak; app stores profile + clinic mappings.
	•	id
	•	keycloak_sub (unique)
	•	display_name
	•	email (optional)
	•	phone_e164 (optional)
	•	is_active

UserClinicRole (mapping)
	•	id
	•	user_id
	•	clinic_id (nullable for System Admin global role)
	•	role enum:
	•	SYSTEM_ADMIN
	•	DIRECTOR
	•	MANAGER
	•	DOCTOR
	•	PRECEPTOR
	•	VOLUNTEER
	•	created_at

Patient (PII)

Global patient record (may visit multiple clinics).
	•	id (UUID)
	•	patient_code (unique, generated)
	•	primary_clinic_id (clinic that first registered them)
	•	first_name, last_name
	•	dob (nullable if unknown)
	•	sex enum (MALE/FEMALE/OTHER/UNKNOWN)
	•	phone_e164 nullable
	•	email nullable
	•	national_id_type enum (VOTER_ID / NATIONAL_ID / PASSPORT / OTHER)
	•	national_id_ciphertext (string/blob)
	•	national_id_hash (unique)
	•	national_id_last4 nullable
	•	timestamps

PatientConsent

Consent record for research usage.
	•	id
	•	patient_id
	•	clinic_id (where consent was recorded)
	•	consent_type enum: RESEARCH_DEIDENTIFIED
	•	status enum: GRANTED, REVOKED
	•	consent_version string (e.g., “v1”)
	•	consent_text_snapshot text
	•	granted_at
	•	revoked_at nullable
	•	recorded_by_user_id
	•	optional witness fields

Encounter (v1 minimal)

Represents a visit/check-in.
	•	id
	•	clinic_id
	•	patient_id
	•	status enum: DRAFT, IN_REVIEW, FINALIZED
	•	created_by_user_id (volunteer)
	•	preceptor_reviewed_by nullable
	•	doctor_finalized_by nullable
	•	timestamps

Vitals
	•	id
	•	clinic_id
	•	encounter_id
	•	systolic_bp, diastolic_bp
	•	heart_rate
	•	weight_kg, height_cm, bmi (computed ok)
	•	notes nullable

DiabetesScreening
	•	id
	•	clinic_id
	•	encounter_id
	•	glucose_mg_dl nullable
	•	glucose_type enum: FASTING, RANDOM, UNKNOWN
	•	hba1c_percent nullable
	•	symptoms json (or booleans)
	•	notes nullable

HypertensionAssessment
	•	id
	•	clinic_id
	•	encounter_id
	•	classification enum (NORMAL/ELEVATED/STAGE1/STAGE2/CRISIS/UNKNOWN)
	•	suspected boolean
	•	confirmed boolean
	•	notes nullable

CarePlan (v1 basic)
	•	id
	•	clinic_id
	•	encounter_id
	•	counseling_given boolean
	•	follow_up_date nullable
	•	medication_prescribed boolean
	•	notes nullable

Reminder
	•	id
	•	clinic_id
	•	patient_id
	•	encounter_id nullable
	•	channel enum SMS/EMAIL
	•	to_address
	•	template_key
	•	payload_json
	•	scheduled_at
	•	sent_at nullable
	•	status enum QUEUED/SENT/FAILED
	•	provider_message_id nullable

ClinicResearchSettings
	•	clinic_id (PK)
	•	research_enabled boolean
	•	requires_director_approval_each_export boolean default true
	•	updated_by_user_id
	•	updated_at

ResearchExport
	•	id
	•	clinic_id
	•	requested_by_user_id
	•	approved_by_user_id (Director)
	•	status enum PENDING/APPROVED/REJECTED/COMPLETED
	•	dataset_version integer
	•	policy_version_snapshot string
	•	timestamps

AuditEvent

Append-only audit log (critical).
	•	id
	•	clinic_id nullable (global events)
	•	actor_user_id
	•	action string (e.g., PATIENT.CREATE)
	•	entity_type
	•	entity_id
	•	before_json nullable
	•	after_json nullable
	•	request_id
	•	ip_address nullable
	•	user_agent nullable
	•	created_at

Clinic scoping rules
	•	Patients are global, but access is restricted by role and clinic relationship:
	•	Volunteers/Doctors/Managers see patients they created or patients with encounters in their clinic.
	•	Directors can see all patients in clinics they manage.
	•	System Admin sees all.
	•	Encounters, vitals, screenings, care plans are always scoped to clinic_id.
	•	Consents are clinic-recorded but apply to research export decisions.
	•	Clinic.country_code (default "GH")
	•	Patient.phone_e164 must be E.164 if present

