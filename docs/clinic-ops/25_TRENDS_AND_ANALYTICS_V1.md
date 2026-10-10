# 25. Trends And Analytics V1

## Status

Partially implemented.

Role-aware dashboards and portal trend views are live. Deeper analytics, broader cohort views, and organization-level reporting remain follow-on work.

---

## Goal

Provide basic graphs for each role (patient and staff) and lay foundation for clinic-level analytics.

Patient trends (v1)
• BP trend: combine Encounter Vitals + PatientMeasurements(BP)
• Glucose trend: combine Encounter DiabetesScreening + PatientMeasurements(GLUCOSE)
• Follow-up adherence: appointment request/appointment completion (later)

Endpoints
• GET /patients/me/trends?from=&to= (patient)
• GET /patients/:patientId/trends?from=&to= requires PATIENT_READ

Response format:

{
"bp": [{ "t": "ISO", "sys": 130, "dia": 85, "source": "ENCOUNTER|PATIENT" }],
"glucose": [{ "t": "ISO", "value": 210, "type": "RANDOM", "source": "ENCOUNTER|PATIENT" }]
}

Audit events

No audit on reads.

UI

Basic line charts; filter buttons: 30/90/180 days.
