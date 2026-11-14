# Task: record the Crisis BP acknowledgement (backend, separate branch)

Owner decision 2026-11-08 (PROGRESS Decision Log): a Crisis reading interrupts staff vitals entry, and the acknowledgement is recorded. The interruption shipped in R1.4b on `ui-refresh/r1-1-tokens`, frontend only. This task records the acknowledgement. It changes the API and sync, so it does not belong on the UI refresh branch.

## What exists (R1.4b)

- `components/VitalsForm.tsx`: after a save succeeds, if the saved reading classifies as `CRISIS` (`classifyBloodPressure`, 180/120 or higher) and that reading has not already been alerted, it awaits `confirmAction({ acknowledgeOnly: true, ... })`. The dialog is "This visit needs a clinician now", and its one button is "I've told a clinician".
- The reading is always saved first. The dialog holds back only what the page does next.
- Nothing is stored. Reopening a visit whose crisis reading was already saved does not alert again.

## What to record

One audit event per acknowledgement, through the existing `AuditService.logWrite`. `action` is a free string, so no migration is needed:

- `action`: `BP_CRISIS_ACKNOWLEDGED`
- `entityType`: `Encounter`, `entityId`: the encounter id
- `afterJson`: `{ vitalsId, systolicBp, diastolicBp, acknowledgedAt }`. The reading is part of what was acknowledged. A later edit of the vitals must not make the event describe a different number.
- `actorUserId` and `clinicId` come from the request, never from the body.

## Open design points (decide before building)

1. **Offline.** Vitals save offline-first through the outbox, so the dialog can be acknowledged with no connection. A plain POST would lose those. The acknowledgement should travel through the same sync push as the vitals, ordered after them. That touches offline sync semantics, which need their own review.
2. **Permission.** Use whoever may write vitals for that encounter (the same permission the vitals sync path checks). It must not become a new role grant.
3. **`acknowledgedAt`.** Device time when queued offline, and server receive time beside it. Never only one of them.
4. **Surfacing.** Whether doctors see "Crisis acknowledged by X at T" on the encounter or in the review queue is a product question, not part of this task.

## Tests the backend PR needs

- The service writes exactly one event with the reading in `afterJson`, using the request's actor and clinic.
- A user without vitals write permission for that clinic is refused, and nothing is written.
- Sync: an acknowledgement queued offline after its vitals lands after them, and replays idempotently (a retried push does not write two events).
- Frontend: `VitalsForm` calls the new path only from the dialog's button, never on a save without a crisis.

## Not in scope

- Patient portal self-reports. The owner excluded them until a clinician writes the patient-facing wording.
- Changing the classifier or the thresholds.
