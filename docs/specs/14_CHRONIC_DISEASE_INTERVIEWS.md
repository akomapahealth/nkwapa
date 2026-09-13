# Guided Hypertension and Diabetes Interviews

## Status and scope

Current, behind disabled-by-default API and web feature flags. Supersedes
`HTN_DIABETES_WORKFLOWS_V1.md`, which described a four-field hypertension record and a
classification the system was supposed to compute but never did.

Each encounter has at most one hypertension assessment and at most one diabetes screening, the same
records as before. They were extended, not replaced: `classification`, `suspected`, `confirmed`,
`glucoseMgDl`, `glucoseType`, `hba1cPercent` and `symptoms` all kept their names and meanings,
because the dashboard groups by them, the research transform reads them, the patient chart renders
them, and the offline client caches them.

## What the volunteer records, and what the server decides

The tabs are a guided interview: a volunteer clicks through the sections while examining the
patient, and the record is saved on every tab change. Because most reads therefore see a
half-answered row, **every answer scale carries `NOT_ASSESSED`**. An unasked question and an
answered "no" are different clinical facts, and collapsing them would let a generated note state
that a patient denied a symptom nobody mentioned.

Four values are derived by the server on every write and ignored if a client sends them:

| Derived                                           | From                           | Lives in                                 |
| ------------------------------------------------- | ------------------------------ | ---------------------------------------- |
| `derivedClassification`                           | the encounter's `Vitals` row   | `packages/db/src/bp-classification.ts`   |
| `urgentReviewRequired` / `urgentReviewReasons`    | symptoms plus the reading      | `{hypertension,diabetes}-interview.ts`   |
| `phq2Total` / `phq2Positive` / `distressPositive` | the two instruments            | `packages/db/src/phq2.ts`                |
| `derivedSuspicion`                                | today's glucose and its timing | `packages/db/src/diabetes-thresholds.ts` |

The encounter form calls the same functions so a volunteer sees the consequence of an answer while
the patient is still in the room, but the stored value is always the server's. A device deciding
for itself whether a visit needs a clinician is a device that can be wrong in the direction that
matters.

## Today's measurements are read, not copied

The hypertension interview displays today's blood pressure, pulse and anthropometrics and never
stores them. `Vitals` is the one place a measurement lives, so an encounter cannot hold two
disagreeing answers to "what was the blood pressure today", and correcting a mistyped vital
corrects the classification derived from it with no second edit. A schema test asserts no
`systolicBp` column ever appears on the assessment.

The **repeat** reading is different and is stored, because it is a second measurement rather than a
copy of the first. It is taken as a pair or not at all: falling back value by value would pair a
repeat systolic with the initial diastolic and produce a blood pressure nobody measured.

A confirmed repeat outranks the reading that prompted it wherever the two disagree, including in
the patient-portal and patient-chart trends. Plotting the initial value would put the measurement
the system itself judged unreliable into the trend a clinician reads to decide whether treatment is
working, and would show a spike on exactly the visits where somebody did the careful thing.

Tobacco is recorded once per encounter, on `TobaccoScreening`, captured with the vitals. The
interview reads that record rather than asking again; `TobaccoUseStatus` gained
`CURRENT_OCCASIONAL` and `CURRENT_DAILY` so the finer granularity the interview wanted is not lost.

## The form seeds once per record

The encounter page loads these records asynchronously and refetches after every save, so the
interview has to take its values from a record that arrives after it mounted -- and must not take
them again when the same record comes back. Re-seeding on every refetch reset whatever had been
answered while that request was in flight, and said the save had succeeded while doing it. It
reached the offline round-trip: the queued edit replayed the previous answers, the server applied
it, and the outbox drained, so every signal the volunteer and the tests had said the change had
landed.

`shouldSeedFormValues` is the rule, keyed on the record's identity rather than the object's, and
it is stated apart from the hook because both ways of getting it wrong are silent. The clinician
plan is keyed on its encounter, having no id of its own.

## Two symptom lists, two questions

Diabetes records symptoms twice, on purpose.

- `symptoms` asks about the past month. It is a recall question.
- `urgentSymptoms` asks about this minute, and is the only one that escalates.

The clinical specification named vomiting, confusion, difficulty breathing, loss of consciousness
and an active foot wound as requiring immediate review while listing none of them except the wound
in its own checklist — and that checklist asks about the past month. Asking them separately is what
makes the specification's own escalation rule implementable. "Had a foot wound last month" and "has
an open wound now" are different facts, and a schema test asserts the two vocabularies cannot
converge.

## Medications are the reconciled list

Neither interview holds a medication name or dose. `PatientMedicationRecord` /
`PatientMedicationRevision` is the patient's medication of record, and the interview reads it,
filtered by `Drug.category` through `packages/db/src/medication-classes.ts`.

What is new is `EncounterMedicationAdherence`: what a volunteer observed about one reconciled
medication at one visit — took it today, doses missed in the past week, supply remaining, barriers.
These are observations about a medication, not properties of it; writing them as a revision would
fill the medication history with non-changes and corrupt `lastReconciledAt`.

The row records both the medication and the revision the volunteer had on screen, so a later
reconciliation cannot silently re-point a recorded observation at a different dose.

> **Known limitation.** `DrugCategory` mixes indication with pharmacologic class, has no member for
> ACE inhibitors, ARBs or calcium channel blockers, and defaults to `OTHER`, so a real catalogue
> will have most antihypertensives invisible to a category filter. The interview works around this
> with an explicit "other current medications" group the volunteer pulls from. The taxonomy needs
> its own change; see issue #114.

## The supervising clinician's half

Two things only a clinician may record, both behind `CAREPLAN.CLINICIAN_PLAN`, granted to `DOCTOR`
alone:

- the **plan** — plan items, BP goal, follow-up window and owner, comments
- an **override** of the derived classification

Enforced in three places, because a boundary that depends on one layer is one refactor from not
being a boundary:

1. The API refuses the clinician-plan route, and refuses an override on the ordinary write. The
   override fields sit on the volunteer-writable payload because they belong to the record rather
   than to the plan, so without that check the derivation would be advisory.
2. The sync pull withholds every clinician-plan column
   (`SYNC_{HYPERTENSION_ASSESSMENT,DIABETES_SCREENING}_WITHHELD`). IndexedDB is readable in
   devtools, so caching a doctor-only plan on a volunteer's laptop would defeat the permission
   rather than enforce it.
3. The web renders nothing in its place. A disabled section still tells a volunteer what a doctor
   may do.

The API response **omits** the block rather than blanking it. A key present with a null value tells
a reader there is a plan they cannot see.

The override seeds from the derivation rather than from `UNKNOWN`: a clinician ticking that box is
disagreeing about a degree, not starting from nothing.

## Follow-up resolves to a date

The guided plan collects a relative window, because that is how a clinician thinks. It is resolved
to a concrete `CarePlan.followUpDate` in the same transaction, because that column is what
`EncounterService` schedules the patient's reminder from when the encounter is finalized. Storing
only the window would leave a plan that reads as complete and schedules nothing.

`followUpOwner` is genuinely new and has no equivalent elsewhere.

## The generated note

`POST /clinics/:clinicId/encounters/:encounterId/clinical-note/seed` composes both interviews into
the HAP draft. It is a pure function over the stored row — no LLM; this repository has no AI
dependency — and it writes through the ordinary `createDraft`/`updateDraft` path, so authorship,
the DRAFT-only rule, the optimistic version check and the immutability triggers all still decide
whether it lands.

Determinism is the contract, because a signed note is hashed: no locale formatting, no clock, no
randomness, fixed paragraph order. Both conditions compose in a fixed order and regenerate
wholesale, so pressing the button twice produces the same note — which also makes it destructive to
a draft that has been edited, so the panel confirms first.

Three things the note will not say:

- It omits the clinician plan for a reader without the permission, rather than rendering an empty
  heading that reveals one exists.
- It states a classification with the reading it was derived from, and reports both when a clinician
  overrode it. A classification alone reads as a judgement; naming the measurement is what lets a
  reviewer disagree with it.
- It describes an incomplete PHQ-2 as incomplete rather than scoring it zero, and says an
  unknown-context glucose cannot be classified rather than guessing a timing.

The specification's "Reviewed by / Date and time" trailer is deliberately not generated.
`ClinicalNote` records the cosigner and time in columns and hashes the signed body; a name written
into the text is a second copy that can disagree with the columns attesting it.

## Thresholds awaiting clinical sign-off

Five clinical decisions — seven constants, since two are systolic/diastolic pairs — are marked
`PROVISIONAL` in four places in code, and **must be ratified by Akomapa's medical director before
clinical use**. They are named constants rather than inline numbers so correcting one is a
reviewable single-line change.

| Constant                                 | Provisional value | Why it is not settled                                                                                                                                                                                        |
| ---------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `BP_ESCALATION_SYSTOLIC` / `_DIASTOLIC`  | 180 / 120         | The specification asks for "Akomapa's locally approved escalation protocol". No such protocol exists in this repository; what is written down is an ACC/AHA _staging_ scheme, which is a different decision. |
| `BP_HYPOTENSION_SYSTOLIC` / `_DIASTOLIC` | 90 / 60           | "Low BP or dizziness" is a listed review reason with no stated threshold.                                                                                                                                    |
| `DM_BEFORE_MEAL_SUSPICION_MG_DL`         | 126               | The interview adds a pre-meal timing; no threshold is documented for it. Mapped to the approved fasting rule.                                                                                                |
| `DM_POST_PRANDIAL_2H_SUSPICION_MG_DL`    | 200               | Same, mapped to the approved random rule.                                                                                                                                                                    |
| `DM_HYPOGLYCEMIA_MG_DL`                  | 70                | Hypoglycemia drives escalation but no value is stated.                                                                                                                                                       |

The approved rules — fasting ≥ 126, random ≥ 200, and the ACC/AHA staging bands — are implemented
as written. Crisis is evaluated before stage 2 because the bands overlap; a test pins that, since
ascending evaluation would classify a hypertensive emergency as stage 2.

## Access and lifecycle

- Reads require `SCREENING.READ` and clinic-scoped access; writes require `SCREENING.WRITE`,
  matching clinic and patient scope, and a non-finalized encounter.
- The clinician plan additionally requires `CAREPLAN.CLINICIAN_PLAN`.
- Finalized records stay visible read-only.
- Every mutation records the actor and an audit event.
- The generated note inherits the clinical-note access boundary in full; see `10_CLINICAL_NOTES.md`.

## Offline

The interviews are local-first and replay through the outbox as `hypertension_assessment`,
`diabetes_screening` and `encounter_medication_adherence`, validated by the same DTOs the REST
routes use. Before this change hypertension had no REST module at all and was written only by an
inline, unvalidated upsert in the sync handler, so a payload naming a classification outside the
enum was accepted.

**The clinician plan is online-only**, and says so when the connection drops rather than failing
quietly. `SYNC.PUSH` is held by four roles, and the precedent here — a finalize a replay cannot
perform, a clinical note that never leaves the server — is that a clinician's deliberate, audited
act stays online. This is a real constraint on a doctor working without signal and is tracked on
issue #114 rather than hidden.

Because the interview writes through the outbox and the plan writes over REST, saving a plan first
flushes the queue. Otherwise a clinician who completed the interview and moved straight to the plan
would be refused by a server that had not seen the screening yet, and the refusal would read as the
plan being rejected rather than as a queue that had not drained.

## Feature flags and rollout

```dotenv
NEXT_PUBLIC_FEATURE_GUIDED_CHRONIC_TABS_ENABLED=false
```

One flag, and it is web-only.

The API routes are permission-gated and validated, and every column the migrations add is additive
with a default, so the server surface is safe to leave live whether or not the interview is being
shown. What the flag decides is which form the encounter tabs render.

A second, API-side flag was written and then removed before this shipped, because it would have had
to agree with this one, and the failure when two such flags disagree is the tabs rendering while
every save returns 404. `10_CLINICAL_NOTES.md` does gate both sides, for a different reason: note
content is server-only by policy, so there is something worth refusing at the API independently.

`NEXT_PUBLIC_*` values are inlined into the bundle at build time, so turning this on requires a
**rebuild** of the web app rather than a restart, and the value must be the literal string `true` —
`parseFeatureFlag` compares against it exactly, so `1` or `yes` read as off.

Both forms write the same record, so a clinic can be switched back mid-rollout without losing
anything. Migrations are additive and no existing column was dropped.

Before clinical enablement:

1. Ratify the provisional thresholds above with the medical director and correct them.
2. Deploy both migrations and verify the backfills against PostgreSQL: a pre-interview
   classification survives and is marked `classificationOverridden`, `collectedAt` takes the
   record's own creation time rather than the deploy clock, and an existing glucose reading gains a
   suspicion result only where an approved rule applies.
3. Verify the role matrix, the clinician-plan refusal for every non-doctor role, and that the sync
   pull omits every clinician-plan column.
4. Set `NEXT_PUBLIC_FEATURE_GUIDED_CHRONIC_TABS_ENABLED=true` where the web app is built — the
   hosting project's environment for a deployed environment, `.env` locally — and rebuild. A
   restart does not pick it up.
5. Validate at a real clinic session before removing the old tabs.

## Release-gate evidence

Migration replay against PostgreSQL 16 with seeded pre-interview rows, the shared-rule unit suites
(`bp-classification`, `phq2`, `diabetes-thresholds`, the JSONB parsers), service role and
derivation specs, the sync projection and role-matrix drift tests, the extended clinical-note
non-exposure spec, and Playwright coverage of both interviews, the clinician-plan boundary from
both sides, the generated note, and a refetch held open across an edit to prove the form does
not discard it. Exact command results belong in the pull request.
