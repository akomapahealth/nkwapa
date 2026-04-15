/docs/specs/HTN_DIABETES_WORKFLOWS_V1.md

Workflow states

Encounter states:
• DRAFT (volunteer entering data)
• IN_REVIEW (preceptor reviewing)
• FINALIZED (doctor finalized)

Volunteer flow 1. Select or create patient 2. Create encounter 3. Record vitals:
• systolic/diastolic, HR, weight, height 4. Record diabetes screening:
• glucose value + type + symptoms 5. System computes BP classification (simple rule) 6. Submit to preceptor → encounter moves to IN_REVIEW

Preceptor flow
• Review recorded vitals/screening
• Add notes/corrections
• Approve → stays IN_REVIEW but marked preceptor-reviewed

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
• Preceptors see “Needs review”
• Doctors see “Ready to finalize”
• “Finalize” is disabled until preceptor review exists (configurable later)
