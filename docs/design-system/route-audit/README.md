# Full route audit

Use the throwaway, seeded `nkwapa_audit` environment from
[`HANDOFF-R2.1.md`](../ui-refresh/HANDOFF-R2.1.md). Both database URLs must point there. Never print
the environment or use production data. Build once with the audit flags, then run one worker.

From `apps/web`, with that environment sourced:

```sh
node ../../docs/design-system/route-audit/create-fixture-manifest.cjs "$S/route-fixtures.json"
WEB_DIR="$PWD" EVIDENCE_DIR="$S/audit" SHOTS_DIR="$S/shots" \
  AUDIT_FIXTURES="$S/route-fixtures.json" R8_STATES_DIR="$S/states" \
  npx playwright test -c ../../docs/design-system/route-audit/route-audit.config.cjs \
  --project=audit --project=states --workers=1 --reporter=line
```

`S` is a private scratch directory. The fixture command reads ids only, rejects either URL outside
`nkwapa_audit`, and requires seeded encounters, station visits and screening events. Its output
contains synthetic ids and the minimal encounter response used to stub the new-visit wizard's
entry POST. The audit never creates a clinical draft. Seed/restore the normal role auth files
before using `--no-deps` to skip auth setup.

The permanent plan includes sidebar and account-menu discovery plus explicit aliases and detail routes, public and
auth entry/error pages, Keycloak, and non-UI resources. It records actual destinations, headings,
selected patient tabs, axe, overflow and both-theme screenshots at 1440/390. The state project
holds bootstrap to render the real skeleton, simulates a disabled account and injects a synthetic
render failure to check the boundary and recovery. No real account is disabled.

`route-audit.json` holds observations; `route-inventory.json` compares the plan's visited routes
with the actual build manifest. A full run fails on missing route coverage, missing fixture ids,
axe findings, overflow, heading-count errors or failed resources. `AUDIT_ROLES=staff,manager`
limits a diagnostic rerun and deliberately does not assert complete build coverage.
`AUDIT_ROUTES=/account,/settings` limits requested routes in the same way. The internal
`/_global-error` build entry is identified as an unverified root state, not a navigable URL;
all navigable entries must be covered. The Keycloak theme stays light under both theme preferences.
Retain a full-run baseline when combining focused rerun evidence, and report that combination explicitly.
`AUDIT_SETTLE_MS` overrides the default 600ms rest before scanning; use reduced-motion captures and
confirm reads have settled when shortening it (250ms was used locally).

Automated route coverage is not a claim of screen-reader, device, clinical-save or every-state
coverage. The review must name redirects, fixture restrictions and unverified states explicitly.
