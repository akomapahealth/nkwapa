# #278: public landing page evidence

Captured 2026-11-03 from a production build (`next build` with the `ci.yml` web environment)
served by `next start` on port 3100, so the shared ports 3000 and 4000 were never used. Before:
unchanged `release/dev` at `179171e`. After: this branch. The landing page needs no sign-in or
database; the footer's status check finds no API on port 4000 in both captures and reports
"API unreachable" the same way.

Presentation and motion only. No change to API responses, permissions, route guards, feature
flags, analytics consent, the release banner's data source, the header, the footer or the
supporting pages (#279 owns those).

## What changed

| Section            | Before                                                                        | After                                                                                                                              |
| ------------------ | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Hero               | Cream band, headline beside the desktop and phone screenshots                 | Akomapa-17 (a volunteer recording a blood pressure check) fills the first screen; copy on a dark scrim, phone screenshot beside it |
| Hero on phones     | Headline, then both screenshots                                               | The photograph first, framed on the volunteer's face, then the copy on the same dark ground                                        |
| Section heads      | Mixed: tracked eyebrows on three, nothing on the rest                         | One 2px ink rule naming each section (Before Nkwapa, How it works, Product, Who it's for, Built for clinic conditions, About, …)   |
| Problem heading    | Words scrubbed from 18% to full opacity as it scrolled                        | Rises line by line once, like the other headings; ends at full contrast                                                            |
| Photographs        | 12px rounded corners                                                          | Square, under the rules                                                                                                            |
| Offline capability | A bordered card with Akomapa-17                                               | Ruled block with Akomapa-19, no card                                                                                               |
| About              | Two overlapping photographs beside the copy                                   | Akomapa-31 at full window width, opening from the content width as it scrolls in (wide screens), the copy split around it          |
| Reveals            | GSAP `autoAlpha` (`visibility: hidden`) until each section scrolled into view | Opacity only, so headings and text stay in the accessibility tree before they scroll in                                            |
| Scrolling          | Native, CSS smooth anchors                                                    | Lenis on wide screens with a fine pointer and no reduced-motion preference; native everywhere else                                 |

Every one of the eight Akomapa photographs appears exactly once: 17 hero, 14 problem, 3, 11 and 18
the clinic day, 34 who it's for, 19 offline, 31 about. `nkwapa_animate.mp4` is not used: it is a
generated logo sting with a "Veo" watermark, black letterbox bars, an audio track and visible
morphing artefacts between frames, none of which a public page should ship.

## Screenshots and accessibility

`landing--1440--{light,dark}.jpg` (full page), `landing--390--{light,dark}.jpg` (first screen)
and `landing-reduced-motion--1440--{light,dark}.jpg` (full page) in `before/` and `after/`.
Full-page captures cannot show a pinned scene, so the clinic day and role deck appear as blank
pin spacers in the motion captures (before and after alike); the reduced-motion captures show
every step as the plain list a reader without motion gets.

`axe.json`: six scans each (all axe rules, after scrolling the page through once).

| View                  | Width | Before                           | After |
| --------------------- | ----: | -------------------------------- | ----- |
| landing, light        |  1440 | color-contrast, serious, 8 nodes | clean |
| landing, light        |   390 | color-contrast, serious, 8 nodes | clean |
| landing, dark         |  1440 | color-contrast, serious, 8 nodes | clean |
| landing, dark         |   390 | color-contrast, serious, 8 nodes | clean |
| reduced motion, light |  1440 | clean                            | clean |
| reduced motion, dark  |  1440 | clean                            | clean |

The eight nodes are the words of the problem heading, left at 18% opacity whenever the heading
was outside its scrub range.

Document heights (px): 1440 13,754 → 14,901; 390 15,980 → 16,585; reduced motion 13,135 → 14,281.
The about photograph at full width adds most of it.

## Lighthouse

Lighthouse 12.8.2, performance and accessibility, three runs per form factor, median run kept
(`lighthouse.sh`; `before/lighthouse.json`, `after/lighthouse.json`). Local machine, simulated
throttling, so treat the timings as relative.

| Form factor | Metric               | Before                        | After                      |
| ----------- | -------------------- | ----------------------------- | -------------------------- |
| Mobile      | Performance (3 runs) | 78 (77, 78, 79)               | 84 (83, 84, 85)            |
| Mobile      | Accessibility        | 98 (heading-order)            | 100                        |
| Mobile      | LCP                  | 4.7 s, the hero paragraph     | 4.3 s, the hero photograph |
| Mobile      | TBT / CLS            | 260 ms / 0                    | 130 ms / 0                 |
| Desktop     | Performance (3 runs) | 99 (99, 99, 99)               | 99 (98, 99, 99)            |
| Desktop     | Accessibility        | 98 (heading-order)            | 100                        |
| Desktop     | LCP                  | 0.9 s, the desktop screenshot | 1.0 s, the hero photograph |
| Desktop     | TBT / CLS            | 10 ms / 0                     | 20 ms / 0                  |

- Before, mobile LCP was the hero paragraph, held back by its CSS entrance starting at opacity 0.
  After, the LCP is the photograph: rendered eagerly at high fetch priority (43 KB WebP at 390),
  visible from the first frame and moved only by transform after the reader scrolls.
- The heading-order failure was real: `autoAlpha` hid every section heading from the
  accessibility tree until it scrolled in, so an unscrolled page went h1 → h3.

## Verification

- `e2e/landing.spec.js` 18 passed, `legal.spec.js` and the landing test in `public-routes.spec.js`
  passed (CI=1, one worker, against the build on 3100). New: the hero photograph is eager,
  high priority and in the first screen; the about photograph ends at full width; Lenis leaves
  keyboard scrolling, native `scrollIntoView` and an open dialog alone; reduced motion never
  starts Lenis.
- `public-routes.spec.js` "protected routes redirect unauthenticated users" needs the API and
  Keycloak, which were not running for this capture; it does not touch the landing page.
- Web lint, typecheck and Jest (`--maxWorkers=2`): 944 passed.

## Known limitations

- Lighthouse ran locally with simulated throttling; production numbers will differ.
- Once during capture, `next start`'s image optimizer hung on one first-time WebP encode
  (Akomapa-11 at 828 px) and every later request for that size queued behind it. A server restart
  cleared it and every image then encoded in under half a second; the after captures were taken
  after the restart, with every image confirmed loaded. Not reproduced since; worth watching in
  production logs.
- Lenis is wheel and trackpad only on purpose. Touch, keyboard, the scrollbar, anchor links and
  find-in-page all scroll natively, so they behave exactly as before.

Run: `BASE_URL=http://localhost:3100 node docs/design-system/evidence/278/capture.cjs after` and
`docs/design-system/evidence/278/lighthouse.sh after` from the repository root.
