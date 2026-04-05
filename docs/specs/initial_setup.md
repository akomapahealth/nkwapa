# Initial Setup (Historical)

## Status

Planning / historical.

This file used to be a copy-paste bootstrap artifact for the earliest version of the repo. It is no longer a current source of truth.

The live codebase has moved beyond this document in several important ways:

- the tenant model now includes `Organization -> Clinic(Location)`
- Postgres RLS is implemented for clinic-scoped tables
- API security hardening, rate limiting, CORS allowlists, and structured error envelopes are in place
- patient portal invite/claim and duplicate-patient merge flows now exist
- Keycloak realm and theme configuration have been hardened and redesigned

Use these docs instead:

- `IMPLEMENTATION_STATUS.md`
- `docs/specs/01_ARCHITECTURE_OVERVIEW.md`
- `docs/specs/02_DOMAIN_MODEL_AND_DATA_DICTIONARY.md`
- `docs/specs/03_AUTH_AND_RBAC.md`
- `docs/DATABASE_SETUP.md`

If you need the original bootstrap artifact for historical reference, use git history.
