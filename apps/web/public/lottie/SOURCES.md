# Dashboard animation sources

Verified 2026-11-10. These are owner-selected assets, not clinical illustrations.

| Local asset      | Creator and download page                                                               | Original source served by that page                                                        | Verification                                                                                               |
| ---------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `Hello.json`     | [Olena Tieriekhova, Hello](https://lottiefiles.com/free-animation/hello-zzjQ1VzxDn)     | https://assets-v2.lottiefiles.com/a/56a5a8ce-116d-11ee-adeb-930c5ac55870/HAmehDzupj.lottie | Extracted `animations/12345.json` equals the supplied JSON structurally; 600 × 1000, 24 fps, frames 0–144. |
| `checklist.json` | [Leticia Kezen, checklist](https://lottiefiles.com/free-animation/checklist-5VMilQwFeC) | https://assets-v2.lottiefiles.com/a/c97fbf04-7da8-11ee-8359-afa0f72ae027/M6jOBTsE6T.lottie | Extracted animation JSON equals the supplied JSON structurally; 499 × 499, 60 fps, frames 0–196.           |

Both download pages specify the [Lottie Simple License (FL 9.13.21)](https://lottiefiles.com/page/license).
It permits commercial reproduction, modification and distribution, including
use without creator attribution. The same terms must accompany distributed
files and modifications. The complete terms are retained in `LICENSE.txt`.
These files and their SVG derivatives remain under those terms.

`hello-rest.svg` and `checklist-rest.svg` were exported with lottie-web 5.13.0
at frames **60** and **98**, respectively. Coordinates are rounded to three
decimal places; colours reference the app's theme variables. The same exported
SVGs are compiled into `components/dashboard/hello-rest.ts` and
`checklist-rest.ts` for immediate inline, theme-aware fallback without a request.
These modules contain checked-in SVG only, never API or user-authored markup.
Hello plays 0–60 once (2.5 seconds); checklist plays 0–98 once (about 1.63 seconds).
No CDN player, loops or final empty checklist frame. Reduced motion uses only
these SVGs; animation failures keep the SVG and all content/actions available.
