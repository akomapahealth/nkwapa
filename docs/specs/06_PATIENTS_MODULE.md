⸻

/docs/specs/06_PATIENTS_MODULE.md

Endpoints (v1)

POST /clinics/:clinicId/patients

Create patient, assign patient_code, store national ID securely.
	•	Requires permission: PATIENT.CREATE
	•	Offline supported via sync

GET /clinics/:clinicId/patients/search?q=...

Search by:
	•	patient_code
	•	name
	•	phone
	•	national id last4 (not full id)

GET /patients/:patientId

Get patient profile + recent encounters (scoped)

POST /clinics/:clinicId/encounters

Create new encounter/check-in for patient.

Patient code generation

Format: NKP-YYYY-######
	•	Sequence stored in DB (transactional)
	•	Unique constraint enforced

National ID security
	•	Encrypt national_id at app layer
	•	Store hash for dedup
	•	Only show last4 in UI

UI flows
	•	“New Patient” form
	•	“Search Patient” + quick select
	•	“Check-in” creates encounter
