# Landing page redesign: design decision record

**Status:** implemented on `feat/landing-page-editorial-redesign` (base `release/dev` at `09e72de`)
**Scope:** the public page at `/` only: `app/(marketing)/page.tsx`, `components/landing/`, its assets and its tests. The authenticated workspace is untouched.

## 1. What was wrong with the previous page

- **Claims nobody could stand behind.** Five named testimonials, "2,000+ screenings", "Zero data lost to connectivity failures" and "3 clinic sites" had no source. A floating "live workspace preview" showed invented queue counts.
- **A form that went nowhere.** The subscribe form set local state and discarded the email address.
- **Template language.** Eleven sections, most of them bento grids, icon cards, a marquee, count-up stats, glass panels, noise textures, gradient meshes and looping floating dots.
- **Jargon in place of explanation.** "RBAC", "offline-first PWA", "audit-ready" and "enterprise-grade" appeared before the page said what a clinic actually does with the product.
- **The product was barely shown.** Apart from a mocked-up card, no real screen appeared above the fold.
- **Weight.** Every section was a client component animated by framer-motion, and the page loaded two extra font families (Poppins and Circular Std, from two third-party hosts) that the product itself does not use.

## 2. Direction

Contemporary editorial healthcare: plain sentences about real clinic work, real screenshots of the product, real photographs of Akomapa clinic days, and the application's own typography. Flat colour bands carry the rhythm between sections; nothing floats, glows or loops.

## 3. Brand: source of truth

From `docs/design-system/MASTER.md` and `app/globals.css`, unchanged:

| Use                     | Token                        | Value                          |
| ----------------------- | ---------------------------- | ------------------------------ |
| Canvas (warm off-white) | `--background`               | `54 63% 97%`                   |
| Teal band, buttons      | `--primary`                  | `188 100% 27%` (logo teal, AA) |
| Gold highlight          | `--secondary`                | `47 100% 55%` (logo gold)      |
| Pale gold band          | `--accent`                   | `47 60% 92%`                   |
| Dark product band       | `.dark` scope on the section | `--background 200 25% 8%`      |

**Typography.** Source Serif 4 for display headlines (the product's heading face) and IBM Plex Sans for everything else. The landing page no longer uses Poppins or Circular Std, so both font requests are gone. The public brand and the clinical workspace now share one type system, and the serif becomes the recognisable part of it. Headline scale and alignment change from section to section on purpose.

## 4. Reference observations

- **Zocdoc:** one plain-language promise above the fold, generous horizontal rhythm, full-width colour blocks that change weight from section to section, and an organised footer. We borrow the rhythm and plainness, not the illustrations, copy or marketplace search.
- **Throne Science:** the real product sits at the centre, benefits are explained in everyday words, and product walkthroughs proceed one step at a time. We borrow the product-first composition and the step-by-step journey.
- **MotionSites:** used only to calibrate restraint. Motion is limited to entrances, one scrubbed progress line and small depth changes.

## 5. Page architecture

| #   | Section                        | Purpose                                                                                          | Layout                                              |
| --- | ------------------------------ | ------------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| 1   | Header                         | Logo, four anchors, "Contact the team"                                                           | Sticky solid bar; sheet menu below `lg`             |
| 0   | Release banner                 | The latest release in one sentence, dismissible                                                  | Full-width teal strip above the header              |
| 2   | Hero                           | What Nkwapa is, in one sentence, with the real product                                           | Split: copy left, desktop + phone right             |
| 3   | Problem                        | The disconnected-records problem in clinic terms                                                 | Large serif statement, photo, ruled list            |
| 4   | A clinic day (`#how-it-works`) | Register, check in, measure, review, follow up, each with a real photo or screen                 | Pinned step-by-step story on `lg`, plain list below |
| 5   | Product (`#product`)           | Desktop and phone screenshots with annotations                                                   | Dark band, framed screenshots                       |
| 6   | Who it's for (`#care-teams`)   | Volunteers, doctors and clinic managers, each with their dashboard; directors and patients below | Pinned card deck on `lg`, plain list below          |
| 7   | Capabilities                   | Offline work, chronic-care structure, several clinics                                            | One large story and two smaller ones                |
| 8   | About (`#about`)               | The Akomapa clinic context                                                                       | Photo mosaic with text                              |
| 9   | Safeguards                     | Access, isolation, audit, sign-off, consent                                                      | Ruled two-column list                               |
| 10  | Closing CTA                    | Contact the team, learn about Akomapa                                                            | Full-width teal band                                |
| 11  | Footer                         | Anchors, Akomapa, contact email, Privacy and Terms                                               | Columns on cream                                    |

`/privacy` and `/terms` (`components/landing/LegalPage.tsx`) reuse the header and footer with `base="/"`, so their section links lead back to `/`. They supplement Akomapa's own [privacy policy](https://akomapa.org/privacy-policy) and [terms](https://akomapa.org/terms), which both say Nkwapa needs its own notices for clinical information. Every statement about data handling on them is taken from the code and specs; they are drafts awaiting the project owner's approval.

Every capability on the page is marked fully implemented in `IMPLEMENTATION_STATUS.md` (updated 2026-10-08). Partially implemented areas are described with their limits. For example, assigning staff and moving patients between stations still needs a connection. No statistic, testimonial, partner, certification or regulatory claim appears anywhere.

The CTAs are `mailto:info@akomapa.org` and `https://akomapa.org`, both confirmed by the project owner. Following the existing decision recorded in `e2e/public-routes.spec.js`, the page carries no sign-in link and no GitHub link.

## 6. Motion

- **Hero entrance:** pure CSS keyframes, so it plays on first paint without waiting for hydration and never leaves the headline invisible if JavaScript is slow. The screenshots move with transform only, never opacity, so they stay the LCP candidate from the first frame.
- **GSAP (`components/landing/LandingMotion.tsx`):** `useGSAP` scoped to the page wrapper, inside `gsap.matchMedia()`, so everything reverts on unmount and under reduced motion. It drives:
  - Section reveals (`[data-reveal]`, `gsap.from`, play once). Content is visible in the server HTML and is hidden only by JavaScript that will also reveal it.
  - The clinic day: on `lg` and wider, the section pins and scrubs through its five steps. Each step's photo or screenshot wipes up over the last (`clip-path`), the text crossfades, and a progress line fills. `LandingMotion` sets `data-journey-pinned`, which stacks the steps in one grid cell (`globals.css`); without it, or under reduced motion, the same markup is a plain ordered list. Arriving from `/privacy` or `/terms` with a `#hash` re-scrolls once the pin spacer exists.
  - The role deck (`[data-deck]`): on `lg` and wider, Who it's for pins and stacks one dashboard card per role. Each scroll step flings the top card aside and tucks it under the rest while the role text crossfades; scrolling snaps to a settled role. The cards show `desktop.png` as a placeholder until each role's dashboard is captured (`DECK` in `CareTeamSection.tsx`; pass `src` and `alt` to `DesktopFrame`).
  - Scroll cue: a pulse travels down a heartbeat trace under the hero copy (CSS, `lg` only), and fades out over the first 160px of scroll.
  - Section headlines (`[data-split]`) rise line by line from behind a mask (GSAP `SplitText`, bundled with gsap). The hero `h1` keeps its CSS entrance so it never waits on JavaScript.
  - The problem statement (`[data-scrub-words]`) reads itself in word by word as it scrolls past.
  - Photographs (`[data-reveal-image]`) wipe up into place, and the large About photo (`[data-parallax]`) drifts slightly on `lg`.
  - The numbered markers on the product screenshot pop in one after another.
  - The product screenshot settling from 94% to 100% scale. It never crops.
  - A small upward drift of the hero phone on scroll, on `lg` only.
- **One pin, no scroll-jacking, no loops.** The clinic day and the role deck are the only pinned sections, and only on wide screens. `prefers-reduced-motion: reduce` skips every GSAP tween, and the existing global rule in `globals.css` cancels the CSS entrance.

## 7. Component library decisions

- **shadcn/ui (installed):** `Sheet` for the mobile menu, `Dialog` for the full-size desktop screenshot on small screens, and `Button` styling conventions.
- **GSAP + `@gsap/react` (added):** the one motion layer for the page. framer-motion remains installed for the workspace but is no longer used on the landing page.
- **Not used:** React Bits, Kokonut UI and Bklit. Every interaction here is covered by GSAP and the existing primitives, and there is no verified public data to chart. Adding them would add dependencies without adding meaning.

## 8. Responsive strategy

- One container (`.landing-container`, max 76rem, 20px gutters rising to 32px).
- Below `sm`, the hero shows the real phone screenshot rather than a shrunken desktop. The product section leads with the phone and offers the desktop screenshot full size in a dialog.
- The journey is a vertical ordered list below `lg` and a horizontal one from `lg` up.
- Verified at 320, 375, 390, 430, 768, 1024, 1280, 1440 and 1920 wide, plus a short desktop (1280x700) and landscape phone (844x390), by `e2e/landing.spec.js`.

## 9. Accessibility

- One `h1`, sections labelled by their `h2`, and `header` / `nav` / `main` / `footer` landmarks.
- Native anchor links with `scroll-margin-top`. Smooth scrolling is CSS-only and turned off under reduced motion by the existing global rule.
- Every interactive target is at least 44px. Focus rings are `ring-2 ring-ring`, as in the product.
- Screenshot alt text describes what the screen shows. The annotation numbers on the screenshot are decorative; the same information is in the adjacent list.
- Text on teal uses `--primary-foreground` (5.22:1). Text on pale gold uses `--foreground`.
- `e2e/landing.spec.js` runs axe with the WCAG 2.2 AA tags.

## 10. Boundaries

**Changed:**

- `app/(marketing)/page.tsx` and `components/landing/*`.
- Landing-only CSS in `globals.css`, the landing font tokens in `tailwind.config.js`, and the Circular Std `<link>` in the root layout. That font was used only by the landing page.
- Two allowed values (`contact`, `akomapa`) on the `landing.cta.click` telemetry event in `packages/db/src/telemetry-events.ts`, so the new CTAs can be counted through the existing allow-list.

**Not changed:** auth, middleware, the workspace routes, the API, the database schema, deployment.

## Release banner

`LATEST_RELEASE` in `components/landing/ReleaseBanner.tsx` holds the version, date and a one-sentence summary in plain words, taken from the GitHub release. Update it with every release; a new `version` shows the banner again to visitors who dismissed the previous one (the dismissal lives in `localStorage`). It does not link to GitHub, following the no-GitHub-link decision above.

## Patterns worth carrying into the workspace redesign later

The workspace will be redesigned later with shadcn/ui components throughout, Kokonut UI for selected interactive pieces, and Bklit for charts (metrics, trends, reports), where there is real clinic data to chart. That work is out of scope here; these are the landing patterns worth keeping for it.

- Source Serif 4 at display sizes carries the brand on its own; the workspace could use it for page titles at a larger step than today.
- Scoping a section with the `.dark` class flips every token locally. The same technique could give the workspace a dark sidebar in light mode without new tokens.
- Ruled lists with a short bold lead (the problem and safeguards sections) read better than icon cards for explanatory content, including settings and help pages.
