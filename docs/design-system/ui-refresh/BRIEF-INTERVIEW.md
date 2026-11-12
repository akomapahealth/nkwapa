# Brief: the read-aloud interview (hypertension and diabetes)

Status: approved 2026-11-12; hypertension built (31fb02c5 and after), diabetes next. Source: impeccable critique of the data-entry
flows (20/40, snapshot `.impeccable/critique/2026-11-12T16-22-26Z__apps-web-components-encounters.md`)
and the owner interview recorded in `apps/web/PRODUCT.md`.

## 1. Job and audience

A volunteer at the intake station, on a shared clinic laptop, reads each question aloud to the patient
and types the answer while looking up between the screen and the patient. Doctors open the same
interview from the encounter page to read, correct or complete it. Mode: Operate. Success: the
volunteer always knows where they are, what is left and whether it is saved, never paraphrases a
field name into a question on the spot, and loses nothing when interrupted.

## 2. Outcome and proof

- One section per screen: Hypertension has 8 sections, Diabetes 6, then a review screen each.
- Every question's heading is the sentence to say aloud (the existing `hint` prop becomes the spoken
  question; the current field label stays as the short label used on the review screen and chart).
- Captured data is identical: same fields, units, validation, payload builders
  (`toHypertensionPayload`, diabetes equivalent), Dexie rows and outbox mutations. Unanswered
  questions still save `NOT_ASKED`.
- Proof it worked: re-run critique; target heuristics 1, 3, 5, 6, 7 at 3 or better; interview page
  height at 1440 no taller than one screen plus the footer per section.

## 3. Selected direction

Inside the established Layered Clinical Workspace world (MASTER.md). No new visual world.

- **Structure:** a section rail (left at desktop, a compact "Section 3 of 8" switcher on phones)
  listing each section with its count ("6 of 9 asked") and a state: not started, in progress,
  needs a fix, done. The review screen is the rail's last item.
- **Focal moment:** the spoken question, set larger than anything else on the screen, answer
  controls directly under it.
- **Answers:** single choices with five or fewer options render as a segmented radio group with
  number-key shortcuts (1-9) shown on the buttons; longer lists stay as a select. Multi-choice
  groups (symptoms, conditions, substances) render as a checkbox grid with "None" visually
  separated. "Not asked" is an explicit, quiet choice at the end of each question, never
  pre-selected on screen.
- **Advance:** Enter or "Next section" saves the section locally (the existing handleSave path,
  called per section) and moves on; Back never discards. The crisis/escalation notice stays live
  and pinned above the section when triggered.
- **Skip logic:** only where the answer is implied. Repeat systolic/diastolic appear only when "BP
  measurement repeated today" is yes; usual home readings only when "Checks BP at home" is yes;
  "Describe…" fields only on Other. Hidden questions save exactly what they save today when
  hidden.
- **Review screen:** every section with its answers in short-label form, unanswered questions
  listed with jump links, the escalation summary, then Save. Saving still goes through the same
  handleSave and outbox.
- **Persistent footer:** sticky at the bottom of the interview: save state ("Unsaved changes",
  "Saved on this device", "Synced 10:42"), Back, Next section / Review.

## 4. Scope and boundaries

- In: HypertensionInterviewForm, DiabetesInterviewForm, InterviewQuestion; the encounter page tabs
  that host them; the intake station (`StationForm` case INTAKE) gains "Interviews" after the
  medical history panel, where the volunteer chooses which interview(s) to run (no automatic
  rule); the new-encounter wizard steps reuse the same component.
- Moved out of the interview tab: prescriptions, longitudinal history panels, the clinician
  classification override and the clinician plan render only on the encounter page for clinical
  users, below or beside the interview, never inside the volunteer's sections.
- Untouched: API contracts, permissions, URL state, offline behaviour, test ids, payloads,
  escalation rules (`@nkwapa/db`), the encounter workflow (submit, review, finalize).
- Anti-goals: one-question-per-screen; a wizard that blocks Back; required stars on every
  question; colour-only state; animation on keyboard-driven advance.

## 5. States and ranges

Sections hold 2 to 12 questions; multi-choice groups up to 10 options plus None; clinician plan
14 options (clinician-only). States: pristine, in progress, invalid (needs a fix, rail shows it,
focus goes to the first invalid answer), saving, saved locally, synced, offline, read-only after
finalize, crisis escalation active, interrupted (draft persists across tab switch and reload via
the existing local record plus an in-progress draft).

## 6. Interaction and layout

Desktop: rail 240px, section column up to 720px, footer spanning the column. Phone: rail collapses
to a section switcher at the top; footer sticky above the bottom nav. Keyboard: Tab order follows
the screen; 1-9 select an answer in the focused group; Enter advances; Shift+Enter or Back
returns. Motion: a short cross-fade between sections only when advancing with the pointer; none
for keyboard advance (MASTER 9.1).

## 7. Constraints and open decisions

- Reuse: FormSectionCard, field.tsx primitives (`fieldErrorProps`, `focusFirstInvalid`),
  InlineNotice, SegmentedControl (extend for radio semantics), useSync status, confirmAction.
- WCAG 2.2 AA; 44px targets on touch, 36/40px on mouse; radios are real `role=radiogroup`.
- Decided by owner 2026-11-12: one section per screen; interviews in both places; intake station;
  volunteer chooses which interviews to run; unanswered saves NOT_ASKED.
- Spoken wording: hypertension's 33 questions drafted from the current labels and approved by the
  owner 2026-11-12 (`ask` props in HypertensionInterviewForm). Diabetes wording is still to be
  drafted and reviewed before merge.
- Answer meanings (`descriptions` on ChoiceQuestion): only where the volunteer maps the patient's
  words to a clinical category (HTN and DM status, HbA1c status, BP repeat, glucose sample timing).
  Never on validated scales (PHQ-2, DDS-2), whose wording must stay as published. Drafted
  2026-11-12 for owner review.
- Skip logic as built: a follow-up group is hidden only while it is empty, so validation never
  points at a field the volunteer cannot see (`showsRepeatReadings`, `showsHomeReadings`).
