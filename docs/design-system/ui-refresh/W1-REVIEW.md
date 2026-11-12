# W1 review: Stations to the pilot layout (2026-11-11)

Phase W, unit 1 (`PHASE-W.md`). Pilot authority: `r0-pilot/index.html#s-station`,
`evidence/r0/station-*`.

## Before → after

| Before (R3.2) | After (W1) | Why |
| --- | --- | --- |
| Page title "Stations" + description + Refresh, then an "On Duty" row, then a "My station" row with "Change station: …" | One **duty strip**: dot + On Duty, role · since 7:40 AM, `Station  Blood pressure ⌄`, Refresh, End shift. `h1` "Stations" is screen-reader only | Pilot strip; on a 390 phone the next patient was below the first screen, now it is the first thing under the strip |
| Ticket: white "01", name, code, "Waiting 10 min", "Checked in …", "From Registration … (Esi Nyarko): no hand-off note", full-width Take | Gold "01" on deep stub; "<previous station> done" tag; name; code · age (from `dob`); **wait meter** on the station line's 40-min scale, amber past 20; "Handed on by …"; hand-off note only when there is one; **Take patient + Open chart** | Pilot ticket. "no hand-off note" was noise on every patient; check-in time duplicated the wait |
| "<Station> queue": every row a primary Take button and a provenance sentence | "Also waiting here": position, name, code, minutes; outline Take patient; note only when present | One primary action on the page |
| Whole line: hollow dots, "2 waiting · 0 being seen" in small text | Count first ("**2** waiting"), filled stop when busy, hollow when empty, gold for yours; "being seen" only when someone is | Pilot line; the shape reads at a glance |
| Phone sticky "Take patient" | "Take <full name> →" | The pilot's sticky action names who you take |
| "Who is working on this account?" between the queue and the line | Last, with one line of why; the strip says "recording as <name>" when it is not the holder | It is set once a shift; attribution stays visible in the strip |
| On duty, no station: a "My station" row | "No station yet" dashed block with **Choose your station** (the strip still has the picker) | An empty main area now says what to do |

Kept unchanged: claim refusal and single-submit guard, capacity line and copy, closed-station notice,
pending shift overlays, offline banner and saved copy, Sheet picker (bottom below 600, right from
600, focus return), screener control, With you now / Continue, flag-off branch, permissions.

## Files

`app/(workspace)/stations/page.tsx`, `components/stations/StationShiftStrip.tsx` (now takes
`station`, `refresh` and `screener` slots), `lib/stations.ts` (`ageInYears` + tests),
`app/globals.css` (`.station-route-stop-busy`), e2e picker regex
(`/^(Choose station|Station )/`) and line text in `stations-workspace-refresh` and
`station-workflow`.

## Validation

See `PROGRESS.md` W1 entry.
