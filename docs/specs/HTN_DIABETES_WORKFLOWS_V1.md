> **Superseded by `14_CHRONIC_DISEASE_INTERVIEWS.md`.** Kept for the record because it is where the
> blood-pressure staging bands and the diabetes suspicion thresholds were first written down, and
> those are still the approved rules.
>
> Two things below never matched the code and are now fixed rather than described: the system did
> not compute a BP classification (the dropdown was manual until #114), and the encounter state
> machine is documented in `02_DOMAIN_MODEL_AND_DATA_DICTIONARY.md` rather than here. The "Doctor
> flow" heading also appears twice, the first of which describes clinical review.

/docs/specs/HTN_DIABETES_WORKFLOWS_V1.md

Workflow states

Encounter states:
• DRAFT (volunteer entering data)
• IN_REVIEW (clinical reviewing)
• FINALIZED (doctor finalized)

Volunteer flow 1. Select or create patient 2. Create encounter 3. Record vitals:
• systolic/diastolic, HR, weight, height 4. Record diabetes screening:
• glucose value + type + symptoms 5. System computes BP classification (simple rule) 6. Submit for clinical review → encounter moves to IN_REVIEW

Doctor flow
• Review recorded vitals/screening
• Add notes/corrections
• Approve → stays IN_REVIEW but marked reviewed

Doctor flow
• Review everything
• Set diagnosis suspected/confirmed
• Create care plan:
• counseling
• meds flag
• follow-up date
• Finalize encounter → FINALIZED
• Trigger reminder scheduling if follow_up_date present

Threshold rules (v1 simplified)
• BP classification:
• Normal: <120 and <80
• Elevated: 120-129 and <80
• Stage 1: 130-139 or 80-89
• Stage 2: >=140 or >=90
• Crisis: >=180 or >=120
• Diabetes:
• if fasting glucose >= 126 → suspected DM
• if random glucose >= 200 → suspected DM
(Doctor can override.)

UI requirements
• Role-based queues:
• Volunteers see “Draft encounters”
• Doctors see “Needs review”
• Doctors see “Ready to finalize”
• “Finalize” is disabled until clinical review exists (configurable later)
