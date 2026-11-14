# Fonts

The latin and latin-ext subsets of IBM Plex Sans (wght 100 to 700) and Source Serif 4
(wght 200 to 900), as served by Google Fonts. `app/layout.tsx` loads them with
`next/font/local`, so building needs no network (#316). See `docs/design-system/MASTER.md`.

Both families are licensed under the SIL Open Font License 1.1
(https://openfontlicense.org): IBM Plex Sans © IBM Corp., Source Serif 4 © Adobe.

To refresh them, request the Google Fonts CSS for the same axes with a current browser user
agent and replace each file with the `latin` or `latin-ext` URL it lists.

## og/

Static TTF instances for the link-preview card (`app/opengraph-image.tsx`): Satori, which draws it,
reads neither WOFF2 nor variable fonts. `source-serif-4-600.ttf` and `ibm-plex-sans-400.ttf` are the
woff2 files above, instanced at that weight with fontTools (`instancer`) and subset to Basic Latin,
Latin-1, dashes, curly quotes and the ellipsis. If the hero copy gains other characters, re-subset.
