# Fonts

The latin and latin-ext subsets of IBM Plex Sans (wght 100 to 700) and Source Serif 4
(wght 200 to 900), as served by Google Fonts. `app/layout.tsx` loads them with
`next/font/local`, so building needs no network (#316). See `docs/design-system/MASTER.md`.

Both families are licensed under the SIL Open Font License 1.1
(https://openfontlicense.org): IBM Plex Sans © IBM Corp., Source Serif 4 © Adobe.

To refresh them, request the Google Fonts CSS for the same axes with a current browser user
agent and replace each file with the `latin` or `latin-ext` URL it lists.
