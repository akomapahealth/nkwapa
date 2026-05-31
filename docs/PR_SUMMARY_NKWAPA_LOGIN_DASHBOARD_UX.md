# PR Summary: Nkwapa Login, Help Hints, and Dashboard UX Polish

## Summary

This PR finishes the Nkwapa auth and dashboard UX polish work. It replaces the generic app login screen with a branded secure sign-in handoff, aligns the Keycloak login theme with the same brand direction, modernizes dashboard help hints, and hardens dashboard chart/error states so users get clear guidance instead of blank or confusing UI.

## What Changed

- Redesigned the Next.js `/login` page with the Nkwapa logo, compact responsive layout, secure sign-in copy, and clear recovery messaging when Keycloak cannot be reached.
- Updated landing navigation logo usage to prefer `nkwapa_logo-2.png`.
- Added the same logo asset to the Keycloak theme and refreshed the Keycloak login template/copy/styles while preserving the actual Keycloak-managed login form, password reset link, password visibility toggle, and error display.
- Replaced hover-only dashboard hints with click-triggered question-mark help bubbles that fade in, support Escape/outside-click dismissal, and are portaled above dashboard card overflow.
- Improved dashboard error handling with structured API errors and plain-English messaging that explains whether the initial dashboard load or only refresh is affected.
- Added chart empty states for trend/distribution charts so doctor dashboard graphs show useful guidance when datasets are empty or all zero.
- Added chart utility tests for empty/all-zero chart detection.

## Verification

- `npm run typecheck --workspace=@nkwapa/web` passed.
- `npm run lint --workspace=@nkwapa/web` passed.
- `npm run test --workspace=@nkwapa/web` passed.
- `npm run security:scan` passed.
- `npm run build --workspace=@nkwapa/web` passed.
- `npm run e2e --workspace=@nkwapa/web` passed: 10 tests.

Note: Next/Turbopack build and Playwright e2e required execution outside the sandbox because the sandbox blocked local port binding for helper/web-server processes.

## Manual QA Notes

- Opened `/login?next=%2Fdashboard` locally through the browser tooling.
- Playwright covered the login redirect, authenticated workspace handoff, forgot-password flow, dashboard rendering, and responsive dashboard/chat breakpoints.
