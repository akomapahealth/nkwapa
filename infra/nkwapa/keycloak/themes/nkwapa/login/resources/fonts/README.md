# Vendored typefaces

The application's two faces, self-hosted so the login screen never blocks first paint on a
third-party request. `styles.css` previously pulled Poppins from `fonts.googleapis.com` and
Circular Std from `fonts.cdnfonts.com`, serialized, on the one screen a user cannot skip.

| File                         | Family         | Axis           | Source                       |
| ---------------------------- | -------------- | -------------- | ---------------------------- |
| `ibm-plex-sans-latin.woff2`  | IBM Plex Sans  | `wght` 100-700 | Google Fonts, `latin` subset |
| `source-serif-4-latin.woff2` | Source Serif 4 | `wght` 200-900 | Google Fonts, `latin` subset |

Both are variable fonts, so one file covers every weight the theme uses. The `latin` subset only:
it is what this screen renders, and shipping all six subsets would roughly quintuple the payload
for glyphs no template asks for. Together they are ~91 KB.

Both are licensed under the SIL Open Font License 1.1. The licence text ships beside them, as the
OFL requires of any redistribution:

- `OFL-IBM-Plex-Sans.txt` — Copyright (c) 2017 IBM Corp., Reserved Font Name "Plex"
- `OFL-Source-Serif-4.txt` — Copyright 2014-2023 Adobe, Reserved Font Name "Source"

To refresh, request the `latin` subset from the Google Fonts CSS API with a modern browser
User-Agent (an older one is served `.ttf`), and take the file from the block commented `/* latin */`.
