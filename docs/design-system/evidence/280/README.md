# #280: motion and feedback evidence

Captured 2026-11-04 from production builds (`next build` with the `ci.yml` web environment)
served by `next start` on port 3100, so the shared ports 3000 and 4000 were never used. Before:
unchanged `release/dev` at `1f7f5f0`. After: this branch. The API was not running, so signed-in
screens could not be captured; the shared components are shown on a temporary harness route
(`/evidence-280`) that was added to both capture builds and is not committed. It renders
`DashboardLoadingState`, `Checkbox`, `Tabs` and two toasts (an error, then a success) exactly as
the app does.

Presentation, announcements and motion only. No change to API responses, permissions, route
guards, feature flags, analytics consent, clinical fields, validation or save semantics. Nothing
from PR #305 (header, footer, supporting pages) was touched.

## What changed

| Area                       | Before                                                                                  | After                                                                                                                      |
| -------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Error toasts               | Announced politely, like every other toast                                              | Visible words hidden from assistive technology; a visually hidden `role="alert"` copy speaks them while the toast is shown |
| `toastPromise` failures    | Settled by `sonner.promise`, polite                                                     | Settled through `showToast`, so a failure gets the assertive announcement                                                  |
| Toast dismiss target       | 24 × 24 px                                                                              | 24 × 24 px glyph, 44 × 44 px centred target (measured)                                                                     |
| Dashboard first load       | Rounded cards and a pill, unnamed; the "Loading …" pill failed colour contrast in light | The ruled "Needs you now" rows and five-figure metric group it gives way to, in one status region named "Loading <clinic>" |
| `PageSkeleton`             | No status role                                                                          | `role="status"`, named by its heading, `aria-busy`                                                                         |
| `ResourceState` loading    | Status region with text only                                                            | Also named "Loading"                                                                                                       |
| Rail toggle                | Icon button, shortcut only mentioned at the rail's foot                                 | Tooltip shows the label and `[`; `aria-keyshortcuts="["`                                                                   |
| Save draft (clinical note) | Ctrl/⌘+S worked but was not shown                                                       | `aria-keyshortcuts` and a title naming Ctrl+S / ⌘S                                                                         |
| Landing photographs        | Empty dark or cream box until each image arrived                                        | 16 px blurred WebP placeholder (`placeholder="blur"`), about 120 bytes each                                                |
| Headings and text          | Balanced only on landing headings                                                       | All headings `text-wrap: balance`; `p`, `li`, `figcaption` `pretty`                                                        |
| Numbers                    | Two live character counters, the unread badge and a count proportional                  | Tabular                                                                                                                    |
| Tab triggers               | `transition: all`                                                                       | `color, background-color, box-shadow` at `--duration-fast` (measured)                                                      |

## The owner's 17 items

| #   | Item                       | Decision                        | Where, and why                                                                                                                                                                                                                                                                                           |
| --- | -------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Better skeleton loaders    | Adopted                         | `DashboardLoadingState` now matches the ruled dashboard; status regions named in `PageSkeleton`, `ResourceState`. 24 of 25 `ResourceState` call sites already pass a page-shaped skeleton.                                                                                                               |
| 2   | Optimistic updates         | Not applicable                  | Re-checked: chat send is still the only surface with a status a mutation toggles. The rest are on MASTER.md section 11's forbidden list or render a notice, not a row.                                                                                                                                   |
| 3   | Keyboard shortcut hints    | Adopted                         | The two real shortcuts: `[` (rail toggle tooltip, `aria-keyshortcuts`) and Ctrl/⌘+S on "Save draft". Sonner already labels its toast region with Alt+T. No new shortcuts.                                                                                                                                |
| 4   | Undo toasts                | Already done                    | `removeWithUndo()` covers staff-invite and queued-reminder cancels. The four remaining confirms (remove a prescription, approve a research schedule, leave a group, revoke consent) and role revoke are clinical, felt by others, or permission changes: they keep the confirm dialog.                   |
| 5   | Stale-while-revalidate     | Already done                    | `useAsyncResource` / `ResourceState` keep content across refetch and failed refetch, with an out-of-flow 2px bar (section 11).                                                                                                                                                                           |
| 6   | Prefetch likely next route | Already done                    | `next/link` prefetches in production and nothing disables it; check-in already calls `router.prefetch` on its destination.                                                                                                                                                                               |
| 7   | Blur placeholders          | Adopted                         | All eight landing photographs. Generated by `apps/web/scripts/generate-landing-blur.mjs` into `lib/landing-blur.ts`; no new dependency.                                                                                                                                                                  |
| 8   | View Transitions           | Not adopted                     | The App Router's bundled React has `<ViewTransition>`, but the workspace types are React 18 and there is no shared-element case (no thumbnail opening a detail). A route crossfade would hold every clinical page behind an animation for nothing.                                                       |
| 9   | Interruptible animations   | Adopted                         | The one `transition-all` (tabs) is now explicit properties. Re-triggerable feedback is already CSS transitions (buttons, rows, toasts via Sonner); keyframes are left on loops (spinners, refresh sweep) and Radix enter/exit.                                                                           |
| 10  | Predictive back            | Not applicable                  | Web only, no `popstate` or `beforeunload` interception, only `replaceState` (no extra entries). The installed app's manifest is `standalone`, so Android handles back natively.                                                                                                                          |
| 11  | Hit slop                   | Adopted where safe              | Toast dismiss: 44px target, 24px glyph. Already in place: Button `icon` size (44px), InfoHint, active-filter remove. `Checkbox` was tried and reverted: its 44px slop overlapped the next row's label in stacked clinical lists, and every checkbox already has a `<label>` that is the full-row target. |
| 12  | Safe-area insets           | Already done                    | #206: toasts, chat launcher, cookie bar, sheets and the shell use `env(safe-area-inset-*)`; dialogs are centred within `100dvh - 2rem`.                                                                                                                                                                  |
| 13  | One-time code autofill     | Not applicable                  | No OTP anywhere: the realm configures no OTP policy or TOTP required action, the theme has no `login-otp.ftl`, and the app takes no codes. If OTP is enabled later, its template needs `autocomplete="one-time-code"`.                                                                                   |
| 14  | Tabular numbers            | Adopted                         | Two live character counters, the chat unread badge and the portal's previous-invites count. 111 sites already had tabular figures, including `DataTable`, metrics and wait bars.                                                                                                                         |
| 15  | Balanced headlines         | Adopted                         | Global: headings `balance`; `p`, `li`, `figcaption` `pretty`.                                                                                                                                                                                                                                            |
| 16  | Idempotency keys           | Already done offline; follow-up | The outbox replay sends a key the API dedupes (`SyncMutation`, unique per clinic). Online writes through `apiFetch` send none, so a retry after a client timeout can apply twice. An API change #280 does not cover: [#307](https://github.com/akomapahealth/nkwapa/issues/307).                         |
| 17  | Safe triangle for flyouts  | Not applicable                  | No submenus or hover flyouts are used (`DropdownMenuSub` has no call sites); Radix would handle submenu pointer grace if one is added. The combobox's hover only moves its highlight.                                                                                                                    |

## Toast library

Kept Sonner and copied Base UI's high-priority announcement onto it. The scored comparison of
Sonner, Base UI, Radix/shadcn, react-hot-toast, react-toastify and Ark UI is in MASTER.md section
13 ("#280 toast library review"). Bundle sizes come from a scratch install of each package at its
npm latest, esbuild 0.28.2, browser ESM, minified, gzip -9, React external.

## Screenshots and accessibility

`before/` and `after/`, each in light and dark at 1440 and 390:

- `harness--*.jpg`: the harness with the error and success toasts shown (full page).
- `landing-images-pending--*.jpg`: the landing page's first screen with every photograph request
  held open, which is what a slow connection shows before the images arrive.
- `measures.json`: target sizes, the loading region's name, the `role="alert"` content and live
  regions after the error toast, and the tab triggers' transition properties.
- `axe.json`: all axe rules on the harness.

| View           | Width | Before                                                     | After |
| -------------- | ----: | ---------------------------------------------------------- | ----- |
| harness, light |  1440 | color-contrast, serious, 1 node ("Loading Akomapa Clinic") | clean |
| harness, light |   390 | color-contrast, serious, 1 node                            | clean |
| harness, dark  |  1440 | clean                                                      | clean |
| harness, dark  |   390 | clean                                                      | clean |

Measured after the error toast (1440 and 390 alike):

| Measure                           | Before         | After                                                                  |
| --------------------------------- | -------------- | ---------------------------------------------------------------------- |
| `role="alert"` content            | none           | "The draft could not be saved" + "Check the connection and try again." |
| Toast dismiss, visible / target   | 24 / 24 px     | 24 / 44 px                                                             |
| Dashboard loading region          | no status role | `role="status"`, named "Loading Akomapa Clinic"                        |
| Tab trigger `transition-property` | `all`          | `color, background-color, box-shadow`                                  |

## Verification

- Web lint and typecheck clean. Web Jest (`--maxWorkers=2`): 946 passed, including the new
  `components/ui/toast.test.tsx` (an error is in the assertive region once, leaves on dismiss, and
  leaves when settled as success; other tones never enter it).
- `e2e/landing.spec.js` and `e2e/legal.spec.js`: 34 passed (CI=1, one worker, against the build on
  3100, without the auth setup project, which needs the API).
- Not run here: specs that sign in (`shell-navigation`, `clinical-notes`, `accessibility`), because
  the API on port 4000 was down. Their selectors were checked: no accessible name they use changed.
  CI runs them.

## Known limitations

- Screen-reader behaviour of the assertive copy was verified in the DOM and with axe, not with
  NVDA or VoiceOver.
- When a keyboard user moves into an error toast (Alt+T), its words are hidden from the screen
  reader; the close and action buttons are still named. Base UI shows the words again while the
  toast has focus; Sonner gives no hook for that.
- The blur placeholders must be regenerated if a landing photograph is replaced.

Run: `BASE_URL=http://localhost:3100 node docs/design-system/evidence/280/capture.cjs after` from
`apps/web`, against a build that includes the harness page.
