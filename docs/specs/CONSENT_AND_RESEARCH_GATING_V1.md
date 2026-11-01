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

Scheduled exports (#166)
• A director approves a schedule once (POST /clinics/:clinicId/research/schedules/:id/approve),
as a standing approval with a review date (default 12 months, at most 24)
• The gating above is checked again when each run starts, not only at approval. A run is recorded
SKIPPED with a reason, and the directors emailed, when research was turned off, the schedule is
no longer active, the review date has passed, or the approving director has lost the permission
• Every run, manual or scheduled, is SKIPPED when fewer than RESEARCH_MIN_SUBJECTS (default 10)
patients have GRANTED consent, so a small cohort is never published
• Editing an approved schedule sends it back for approval when the clinic requires approval per
export

Revocation behavior
• Revocation prevents inclusion in future exports
• Each run's changes.json and manifest count the subjects revoked since the previous run
• Published runs in R2 expire by the bucket's lifecycle rule (90 days recommended), so a revoked
subject's rows leave storage then; older runs are not rewritten
• If datasets are versioned, revocation creates a “policy change” and future dataset version excludes.
