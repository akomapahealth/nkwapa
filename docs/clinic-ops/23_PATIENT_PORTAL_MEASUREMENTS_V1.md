# 23. Patient Portal Measurements V1

## Status

Implemented for the core portal measurement and trends flow.

The broader patient portal is still evolving, so use `IMPLEMENTATION_STATUS.md` and `docs/FEATURE_WORKFLOWS_GUIDE.md` for the live feature surface.

---

## Goal

Patients self-log measurements (BP, glucose, weight). Staff can view in patient chart and trends.

Prisma

PatientAccountLink

Fields:
• id, patientId, keycloakSub
• timestamps
Unique:
• keycloakSub

PatientMeasurement

Fields:
• id, patientId
• recordedAt
• source enum: PATIENT | STAFF
• type enum: BP | GLUCOSE | WEIGHT
• payloadJson (JSON)
• notes?
• linkedEncounterId?
• timestamps

Indexes:
• (patientId, recordedAt)
• (patientId, type, recordedAt)

Endpoints

Patient
• POST /patients/me/measurements
• GET /patients/me/measurements?type=&from=&to=

Staff
• GET /patients/:patientId/measurements?from=&to= requires PATIENT_READ

Validation rules
• BP payload must include systolic/diastolic; optional pulse
• glucose payload must include value and type FASTING/RANDOM
• enforce sane ranges (don’t overdo; basic constraints only)

Audit events
• MEASUREMENT.CREATE (for both patient and staff source)

⸻
