⸻

/docs/specs/CONSENT_AND_RESEARCH_GATING_V1.md

Consent UX requirements
• Must display clear language:
• personal info like name/DOB/contact will NOT be used in research
• data is de-identified/anonymized
• patient can refuse without affecting care
• patient can revoke later
• Consent is recorded as:
• checkbox + staff attestation
• store consent_text_snapshot exactly
• Offline supported

Endpoints

POST /clinics/:clinicId/patients/:patientId/consents

Record consent (GRANTED)
Permission: CONSENT.RECORD

POST /clinics/:clinicId/patients/:patientId/consents/revoke

Revoke consent
Permission: CONSENT.RECORD (or higher)

PUT /clinics/:clinicId/research/settings

Director sets:
• research_enabled
• requires_director_approval_each_export (default true)

POST /clinics/:clinicId/research/exports/request

Request an export (creates ResearchExport PENDING)
Permission: RESEARCH.EXPORT.REQUEST

POST /clinics/:clinicId/research/exports/:exportId/approve

Director approves export
Permission: RESEARCH.EXPORT.APPROVE

Export gating logic (must pass all)
• Clinic research_enabled = true
• Patient consent status = GRANTED at time of export
• Director approval record exists for this export
• Audit event emitted for request/approve/complete

Revocation behavior
• Revocation prevents inclusion in future exports
• If datasets are versioned, revocation creates a “policy change” and future dataset version excludes.
