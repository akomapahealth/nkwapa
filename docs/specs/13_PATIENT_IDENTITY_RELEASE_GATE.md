# Patient Identity Release Gate

## Status and scope

Covers the three workflows that decide which record a person's clinical history is filed under:
the suspected duplicate review queue, the patient merge and its preview, and the portal claim.
Canonical chart redirects sit underneath all three, because a merge leaves behind an id and a code
that must keep resolving to the record that survived.

Everything here is behaviour that already shipped, in the duplicate review queue, the merge preview
and safety checks, and the portal invite lifecycle. This gate is the regression net under it, and
it is the last identity work before cross-clinic consolidation, which is deliberately not covered.

## Why this workflow gets a gate

Two records for one person is a clinical safety problem: a doctor reads half a history and believes
it is all of it. Consolidating the wrong two is a worse one, and it cannot be undone from the
product. A mis-scoped claim is worse again, because it hands one patient another patient's whole
record with an audit trail describing it as an ordinary sign-in.

None of the three fails loudly. A duplicate rule that quietly stops matching empties a queue that
looks the same when it is empty because there are no duplicates. A claim that takes over an
occupied record succeeds. That is why the coverage here is exhaustive by construction rather than
by example: the tables in `apps/api/src/testing/patient-identity-matrix.ts` are asserted to account
for every rule and every refusal the domain defines, so a new one that nothing tests fails the
suite rather than shipping unexercised.

## What the gate found

### A claim could take over a record that was already someone else's

The claim checked whether the signed-in account was linked to a different patient. It never checked
the reverse. `PatientAccountLink` is unique on both columns and the claim upserts on `patientId`,
so a record already linked to somebody else did not collide — it was repointed at whoever presented
an invitation for it, `portalUserId` was overwritten in the same transaction, and the previous
owner kept a `PATIENT` role that granted them nothing.

`createPortalInvite` refuses to issue an invitation for a linked record, which is why this was hard
to reach. An invitation issued before the link, or carried onto a linked record by a merge, reaches
it — and those are exactly the situations where two people are already confused about who owns the
record. Fixed, with the re-claim case explicitly preserved.

### Following a merge pointer could take the process down

`findById` followed `mergedIntoPatientId` by calling itself, with nothing watching where it had
already been. The pointer is read out of a column, so a restored backup or a hand-run correction
can leave a loop in it, and a loop was not a wrong answer but an unbounded recursion. The test that
found this did not fail; it killed the jest worker with an out-of-memory abort. Now iterative, with
a visited set.

### A code merged twice resolved to a tombstone

`findByPatientCode` resolved a merge on the direct hit and not on the alias branch, so a code merged
A into B and then B into C answered with B: a record carrying no history, indistinguishable in shape
from a live one. `findByPatientCode` has no route caller today, so this was latent rather than
live; it is fixed because the asymmetry is the kind that becomes live the moment someone wires a
code lookup.

### Every claim refusal was a dead end

Twelve refusals, none carrying a code or a next step, so the error envelope fell back to
`BAD_REQUEST` and `REQUEST_FAILED`. One of them told a patient to update a chart they cannot open.
They now carry both, in the same shape the merge findings have used since the preview shipped.

### The redirect explained itself and then threw the explanation away

Arriving at a chart by the id of one a merge retired is ordinary — every appointment card the
clinic printed names the old record. It was announced as a success, in the product's own vocabulary,
and the notice was held in component state that the redirect's own route change discarded. The
reader was left on a different patient code than the one they clicked. It now travels in the
address.

### Blockers and warnings were told apart by colour alone

Same icon on both lists, no heading on either, so nothing on screen said a blocker was fatal — an
operator inferred it from a disabled button further down.

## Coverage

| Surface                                                                    | Where                                                                                 |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Duplicate rules, exact and fuzzy, through the queue                        | `apps/api/src/patients/patient-duplicate.service.spec.ts`                             |
| Blocking SQL: five branches, tombstone exclusion, clinic scope, ceiling    | `apps/api/src/patients/patient-duplicate.repository.spec.ts`                          |
| Every merge refusal and warning, both strategies, the commit-time re-check | `apps/api/src/patients/patient-merge.service.spec.ts`                                 |
| Canonical redirects: chains, cycles, aliases, the `includeMerged` scope    | `apps/api/src/patients/patient.repository.spec.ts`                                    |
| The chart route, and which record it authorises                            | `apps/api/src/patients/patients.controller.spec.ts`                                   |
| Every claim refusal and acceptance                                         | `apps/api/src/patient-portal/patient-claim.spec.ts`                                   |
| The claim endpoint's guards and rate limit                                 | `apps/api/src/patient-portal/patient-claim.controller.spec.ts`                        |
| Claim onboarding in `whoami`                                               | `apps/api/src/auth/auth.controller.spec.ts`                                           |
| The table against the code and the published matrix                        | `apps/api/src/patients/patient-identity-matrix.spec.ts`                               |
| A refused merge and the redirect banner, in a browser                      | `apps/web/e2e/patient-identity.spec.js`, `apps/web/e2e/patient-merge-preview.spec.js` |
| Claiming a record in a browser, refused and accepted                       | `apps/web/e2e/patient-claim.spec.js`                                                  |

## Test data requirements

`SEED_SAMPLE_DUPLICATES=true` stages two duplicate pairs, one obvious and one ambiguous.

`SEED_SAMPLE_IDENTITY=true` stages what using the product cannot produce:

| Fixture                                                                         | Why it cannot be made by hand                                                              |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| "E2E Retired" already merged into "E2E Merged", with the alias and merge record | A merge is irreversible, so producing this state destroys whatever it was made from        |
| "E2E Keep Blocked" / "E2E Duplicate Blocked", colliding with "E2E Collision"    | An alias collision takes SQL to arrange                                                    |
| "E2E No Birthday", live invitation, no date of birth                            | The registry will not create a chart in this state                                         |
| "E2E By Phone", phone-only invitation                                           | Nothing else seeds one, and it is the ordinary case for a patient with no email            |
| "E2E Claimable", plus a roleless `e2e.claimant` account holding its invitation  | The only state that can reach `/claim-record`; a linked account is redirected away from it |

Both flags are set on the CI e2e job. Each chart is guarded on its globally unique national ID
hash, so re-seeding is a no-op.

## Residual risks

- **The claim flow's browser coverage is partial.** `e2e/patient-claim.spec.js` signs in as an
  invited, unclaimed identity and covers routing, both detail mismatches, the skip link, keyboard
  order, four widths, axe, and a real claim. The states one account cannot reach -- a phone-only
  match, a lapsed or cancelled invitation, a record already linked elsewhere -- stay in section 6b
  as manual checks and are covered at the service level.
- **Cross-clinic consolidation is still refused outright**, and the queue marks such pairs as not
  mergeable. That is the next ticket, not a gap here.
- **`listPendingInvitesForUser` has no route and no test.** It duplicates the onboarding query with
  a slightly different shape, so the two can drift. Wire it or delete it.
- **`getPortalAccessSummary`'s merged branch is unreachable** from its only production caller,
  which passes an already-resolved record. Harmless, but it is not the safety net it reads as.
- **A merge audits after its transaction commits.** Deliberate — the request is already wrapped in
  one, so an audit written inside is rolled back by any later failure — but it means a failure
  between commit and audit leaves a merged record with no audit event. Pinned by a test so the
  ordering cannot change silently.

## Operator steps before enablement

1. Seed with `SEED_SAMPLE_DUPLICATES=true` and `SEED_SAMPLE_IDENTITY=true`.
2. Run `npm run test --workspace=@nkwapa/api` and `npm run typecheck`.
3. Regenerate the matrix with `npm run docs:identity-matrix --workspace=@nkwapa/api` and confirm it
   produces no diff.
4. Run section 6b of `docs/USER_TESTING_GUIDE.md` against the seeded environment, as a system
   administrator and then as a patient.
5. Confirm `PATIENT.MERGE` and `PATIENT.DUPLICATE.REVIEW` are held only by the roles intended, and
   that a clinic manager is offered no merge action.
