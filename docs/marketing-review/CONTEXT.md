# Marketing Monthly Review — page context

> Living notes for the `/dashboard/marketing-review` page. Read this before touching
> `MarketingReviewDashboard.jsx` again — it explains what's built, why, and what's
> still outstanding from the user.

## Status as of 2026-09-09 (later same day)

**Shipped:** the full presentation ENGINE (commit `9b4970d`), and the FIRST real
data-driven slide — the Executive Summary / headline-numbers table (uncommitted as of
this doc update; see "Headline slide — what's actually built" below). Still **not yet
live-verified in a real authenticated browser session** (no Google-login session
available in this environment) — verified instead by (a) `npm run build` passing
clean, and (b) running the exact shipped aggregation/delta functions, copy-pasted
verbatim into a standalone Node script, against real production Supabase data (see
"Verification performed" below). That is real evidence the MATH is right; it is not
proof the SLIDE RENDERS correctly on screen — click through it in a real session
before trusting the visual layout.

**Still not provided by the user:** the outline/data for the other 8 slides (Channel
Performance, Funnel & Conversion, Wins, Risks, Next Steps — Cover/Agenda/Closing need
no real data). The headline slide was scoped and built first because the user gave
its exact spec directly; the rest are still placeholder.

## Headline slide — what's actually built (2026-09-09)

Per the user's own spec, given directly in chat (not inferred): the "Executive
Summary" slide (slide 3, `id:'summary'`) now shows a 9-row × 5-column table —

**Rows:** Spend, Leads, QL, Apps, AC Sales, CPL, CPQL, CPA, CPS
**Columns:** the 3 trailing months (e.g. for an August review: June, July, August),
then "vs [prior month]" and "vs [same month last year]" as delta columns.

Confirmed with the user before building (`AskUserQuestion`, 4 rounds):
- QL/CPQL/CPA match Overall dashboard's own definitions exactly (Total QL =
  Human+AI+Superbot; CPQL/CPA/CPL divide by PAID-source-only volume, per
  OverallDashboard.jsx's own documented ~26% CPL-understatement finding).
- CPS = Spend ÷ AC Sales, auto-computed the moment AC Sales is entered for a month.
- AC Sales itself is NOT in Quantum — entered via a real in-page editable field
  (pencil icon next to the AC Sales row label, active-stage-only), persisted to
  Supabase `app_preferences.ac_sales_manual` (`{'YYYY-MM': amount}`), same
  optimistic-write/revert-on-failure pattern as Overall's existing "Affiliate spend
  manual entry".
- Data source: Overall's own BigQuery-backed cache (`overall_bq_daily_agg` via
  `src/lib/overallBqCache.js`'s `fetchOverallBqAggRows` — the same small, fast,
  pre-aggregated day+Source table the live `/dashboard/overall-bigquery` page reads).
  Two parallel fetches: the 3 trailing months in one call, the same-month-last-year
  window in a second call (confirmed live: BigQuery cache data goes back to
  2025-04-01, so a genuine year-over-year comparison is possible).
- Delta format: `▲ 12.3% (was ₹54.0L)` — percentage + the absolute prior value
  (short Cr/L form for money, plain comma-grouped for counts), colored green/navy
  per the `invert` convention already established by `PremKPI` in `dashboardKit.jsx`
  (cost/spend metrics: DOWN is good; volume/outcome metrics: UP is good — never red).
  `null` renders as `—` (nothing to compare); a genuinely-zero prior renders `New`.

**A real technical fork, resolved by checking production data rather than guessing:**
Overall's own CPL/CPQL/CPA formula divides by a PAID-SOURCE-ONLY subset, and ALSO
zeroes out any campaign matching `app_preferences.cost_excluded_campaign_patterns`
(a per-campaign exclusion). The fast agg table has no `campaign_name`, so it cannot
replicate a per-campaign exclusion — but a live query confirmed that list is
currently EMPTY in production, meaning Overall's `costSpend === spend` today, so this
slide's numbers match Overall's live dashboard exactly AS THINGS CURRENTLY STAND. The
paid-source restriction itself (which the agg table CAN replicate, since it has a
`Source` column) is applied faithfully. **If `cost_excluded_campaign_patterns` is ever
populated in Settings, re-check this slide's CPL/CPQL/CPA against the live Overall
dashboard for the same month** — this is now the single documented drift risk.

**New code, all in `src/pages/MarketingReviewDashboard.jsx` (+ one CSS spinner rule in
the `.module.css`):**
- Month math: `mostRecentCompletedMonth()` (refactored out of `defaultReviewPeriod`,
  now shared so the plain period string and the headline table's month boundaries can
  never disagree), `computeReviewMonths()`, `monthKeyStr()` (matches BigQuery's own
  `"August'2026"`-style `month` field), `isoDate`/`monthStartOf`/`monthEndOf`/`ymOf`.
- `aggregateReviewMonth(rows, key)` — buckets agg rows by Source, sums per-source,
  then splits into unrestricted totals (Spend/Leads/QL/Apps) and paid-source-only
  totals (feeding CPL/CPQL/CPA).
- `reviewPctDelta(cur, prev)` — `null` if either side missing, `'new'` sentinel if
  prior was genuinely zero, else a real percentage.
- `buildHeadlineRows(months, aggByMonth, acSales)` — the 9-row descriptor array.
- `MarketingReviewDataContext` / `useMarketingReviewData()` / `MarketingReviewDataProvider`
  — fetches ONCE per page load (not per-render), shared by every mount of
  `HeadlineSlide` (deck main stage, its own thumbnail, the landing gallery card, and
  read view all mount the same Body component independently — sometimes 2 at once).
  Deliberately does NOT use `useCountUp`-style animated counting for the table values
  (the existing engine's count-up hook returns 0 while `active===false`, which would
  have made every thumbnail/gallery/print rendering of this slide show fake zeros
  instead of real numbers — avoided entirely; entrance motion instead comes from the
  existing `styles.staggerItem` fade-up, which doesn't have this bug).
- `HeadlineSlide` replaces `ExecutiveSummarySlide`; `KPI_TILES`/`KpiTile`/`useCountUp`
  were deleted outright (dead code once nothing else used them — confirmed via grep
  before deleting).
- `PeriodBadge` gained an optional `live` prop — swaps the amber "Sample data" pill
  for a green "Live data · Overall (BigQuery)" one on this slide only; every other
  placeholder slide is untouched.

**Verification performed:**
1. `npm run build` — clean, both before and after every edit. New chunk
   `MarketingReviewDashboard-*.js` correctly code-splits `overallBqCache-*.js` as a
   dependency, confirming the import wired correctly.
2. Live production data checks (via direct Supabase REST calls with the public anon
   key, same key already shipped client-side throughout this app):
   - Confirmed `overall_bq_daily_agg` data goes back to 2025-04-01 (year-over-year
     comparison is genuinely possible).
   - Confirmed `cost_excluded_campaign_patterns` is currently empty (the "exact
     match" fork above).
   - Pulled real Jun/Jul/Aug 2026 + Aug 2025 rows (1,005 total, matching the expected
     234+249+249+273 exactly) and ran the SHIPPED `aggregateReviewMonth`/
     `reviewPctDelta` functions (copy-pasted verbatim, not reimplemented) against them
     in a standalone Node script. Real output: Aug'26 leads 1,11,941 / spend
     ₹2,67,73,516 / CPQL ₹3,857 — a genuine, real month-over-month dip (leads -47.6%,
     QL -42.9% vs July) that the deck will now surface honestly rather than paper
     over. All figures matched an independent earlier raw-sum sanity check to the unit.
3. **Not done:** clicking through the actual rendered slide in a browser (no
   authenticated session available). The loading spinner, the AC Sales edit modal's
   open/save/cancel flow, and the delta cells' visual color/layout are all
   logically reviewed and grid-column-consistent (re-read after every edit) but not
   yet seen rendered on screen. Do this before presenting from this deck for real.

## What this page is for

A dedicated, admin-only page for presenting the monthly Marketing review — built as a
genuine presentation surface (thumbnail navigator, full keyboard control, fullscreen,
image/PDF export, a presenter view), not a dashboard with a "Present" button bolted on.
This was an explicit, repeated requirement from the user: "should have all the controls
of slides (every advanced feature)" and separately "full of animation, transition,
video effects, this should be full to attractive."

## Where it lives

- Route: `/dashboard/marketing-review`
- Component: `src/pages/MarketingReviewDashboard.jsx` + `src/pages/MarketingReviewDashboard.module.css`
- Admin-only. Wired through the standard 5-file access-control pattern:
  - `src/lib/pageList.js` — `{ id:'marketing_review', label:'Marketing Review', path:'/dashboard/marketing-review', adminOnly:true }`
  - `shared/access.mjs` — `'marketing_review'` added to `VIEWER_MUST_BE_GRANTED` (this is
    what actually enforces the restriction — the `adminOnly` flag in `pageList.js` alone
    is only a UI-level floor)
  - `src/lib/routePrefetch.js` — lazy-import registry + route→component map
  - `src/App.jsx` — lazy import, `PAGE_TITLES` entry, the `<Route>` itself
  - `src/components/Sidebar.jsx` — nav entry under "Overview" (next to B2C), a plain
    `currentColor` icon (not gradient — gradients in this sidebar are reserved for the
    two "Intelligence" section entries: Ask AI and Agents)

## Why it's a bespoke component, not the shared Present tool

This app already has a generic Present-mode system (`src/lib/presentationContext.jsx` +
`src/components/PresentationTool.jsx`) that turns an arbitrary dashboard's existing
`Card`s into a slideshow via auto-registration, with a DOM-scan fallback for pages
without registered Cards. It's designed for "make whatever's already on this dashboard
presentable," not for a purpose-built cinematic deck with custom per-slide backgrounds,
real thumbnails, Home/End/digit-jump, a dedicated presenter panel, or a non-presenting
read/print view. This page reuses that system's VISUAL LANGUAGE (progress-rail
gradient/glow, glass toolbar aesthetic, the `isEditableTarget` keyboard-guard pattern)
but is a separate, more feature-complete deck engine.

## The engine (what's actually built)

- **Slide canvas**: every slide designed at a fixed 1280×720 (16:9), rendered through
  one shared `SlideCanvas` wrapper everywhere it appears (main stage, thumbnails,
  gallery cards, read view, print) via CSS `transform: scale()` — resolution-independent,
  same technique real presentation software uses.
- **Three view modes**:
  - **Landing** (default): hero + "Start presentation" + a "sample data" disclosure
    banner + a scrollable gallery of every slide as a real live-rendered thumbnail
    (click any to jump straight into the deck at that slide).
  - **Deck** (immersive `position:fixed` overlay, above the sidebar): gradient
    progress rail, section label + slide title, control cluster (Presenter view /
    Save slide as image / Print-export / Fullscreen / Exit), bottom bar with
    prev/next + a real thumbnail navigator (each thumbnail is the slide's own live
    component at a tiny scale, not a static dot/image), a keyboard-shortcuts toast.
    Full keyboard set: arrows/Space/PageUp/PageDown, Home/End, digits 1–9 jump to
    that slide, F = real browser Fullscreen (targets the whole deck overlay, not
    just the stage — otherwise the chrome disappears per the Fullscreen API spec),
    P = presenter panel (timer, next-slide preview, notes placeholder), Escape exits
    fullscreen first if active, else exits the deck. All shortcuts ignored while
    focus is on an editable element.
  - **Read view**: same slides stacked in normal scrollable flow — both a
    "read later without presenting" mode AND the literal source `window.print()`
    prints from (one slide per printed page via `@media print` CSS). "Print /
    Export PDF" switches to read view then calls `window.print()` — no PDF library,
    uses the browser's own Save-as-PDF.
- **Export**: per-slide PNG via `html-to-image`'s `toPng()` (already a dependency,
  used elsewhere in this app) on the current slide's real DOM node.
- **Animation/motion** (the explicit "attractive" requirement): drifting blurred
  gradient blobs + floating particles behind cover/closing slides, a slide-transition
  sheen sweep, cover-title blur-in, the brand logo (`shared/brandLogo.mjs`) drawing
  itself bar-by-bar, count-up KPI numbers, animated width-grow bars/funnels,
  staggered fade-up reveals on bulleted/card slides. No actual video asset used —
  no video file was available and embedding an external one wasn't appropriate
  without asking, so "video effects" was interpreted as cinematic CSS motion,
  matching this app's own established convention (Ask AI's motion toolkit, the
  "Aurora glass" login variant).
- **Reporting-period labeling**: every data-bearing slide carries a `PeriodBadge`
  (auto-computed "most recently completed calendar month") plus an explicit
  "Sample data — pending real figures" ribbon — the "zero data-entry surprises"
  requirement, live even before real data exists.

## Current placeholder content (9 slides, in order)

1. Cover
2. Agenda
3. Executive Summary — REAL DATA now (see "Headline slide" section above); the other 8 below are still placeholder
4. Channel Performance (5-channel bar comparison)
5. Funnel & Conversion (5-stage funnel)
6. Wins & Highlights (3 cards)
7. Risks & Watch-outs (3 cards — deliberately navy-accented, never red, per this
   app's brand-color rule)
8. Next Month's Priorities (4 ranked actions)
9. Closing

Slides 1, 2, 4-9 are still fabricated/sample content. Swapping in real content for
those requires **zero changes to the engine** — only their `Body` components need
replacing, exactly as slide 3 (Executive Summary) already was, above.

## Two bugs self-caught before shipping (documented in case they resurface)

1. First draft of image export queried a `data-mr-current-canvas` attribute that was
   never actually set anywhere — would have silently done nothing. Fixed by moving
   the export handler into `DeckView`, which already holds a real ref to the current
   slide's DOM node.
2. Fullscreen toggle initially targeted the inner stage-measurement `<div>` instead
   of the whole deck overlay. Per the Fullscreen API spec, only the fullscreened
   element's own subtree renders while active — everything else (progress rail,
   toolbar, thumbnail rail) would have vanished. Fixed by adding a ref on the outer
   `role="dialog"` overlay and pointing `requestFullscreen()` at that.

## What's still needed from the user — for the OTHER 8 slides

Slide 3 (Executive Summary) is done — see above. Still needed, per slide, for the
remaining 8:

1. **The real outline** — what each of Channel Performance / Funnel & Conversion /
   Wins / Risks / Next Steps should actually cover.
2. **Where the numbers come from** — for each slide, a Google Sheet, a page already
   in this app (Overall, QL Ops, CEO B2C, LeverageCareers, etc.), or manual entry
   (matching the AC Sales pattern the headline slide already uses).
3. **What matters most for each slide** — e.g. Channel Performance could be Spend or
   QL-by-source; Funnel could be Overall's own funnel or a different one.

The user can provide this however's easiest — a bullet list, a screenshot of a past
real deck, or a plain-English description per slide. Once given, map it onto the
placeholder `Body` components one at a time and wire in the real data source(s) —
the engine (canvas, transitions, thumbnails, keyboard, export, print, fullscreen,
presenter view, and now the `MarketingReviewDataProvider` pattern the headline slide
established) needs no changes to support this.

## Deliberately deferred, not requested yet

- Full 4-theme (dark/navy/stone) adaptation of the outer landing/header chrome —
  slide CONTENT is intentionally NOT theme-adaptive (a slide should look the same
  regardless of viewer theme, same as real presentation software), but the landing
  page's own chrome is currently light-only, unlike every other dashboard page.
- A genuine dual-window/broadcast-channel presenter view (today's "presenter view"
  is a same-window side panel, not a real second-screen display). Would need a
  `BroadcastChannel`/second-tab architecture — not worth building until confirmed
  the user actually presents from a two-screen setup.

## Verification status

`npm run build` passed clean at every stage (the initial engine, and every edit for
the headline slide). Still **not yet clicked through in a real browser** — this
environment has no authenticated Google-login session for `quantum.leverageedu.com`.
For the headline slide specifically, the underlying MATH has been verified against
real production data (see "Verification performed" above) even without a browser
session; the engine itself (Deck/Read/Landing, keyboard, export, fullscreen,
presenter view) has only been code-reviewed, never seen on screen.

Next step whenever a session with real credentials is available: open the page and
click through Start presentation → thumbnail nav → every keyboard shortcut →
Fullscreen → Presenter view → Print/Export PDF → Read view → the headline slide's
AC Sales edit modal (open, type a number, Save, confirm it persists on reload).

## 2026-09-09 (later) — headline slide: dropped a redundant "(was X)" annotation

User caught it live: the "vs {prior month}" delta column showed "▲ 12.3% (was ₹54.0L)"
where ₹54.0L is exactly the prior month's own value — already sitting right there as
its own column in the trio (June/July/August). Showing it twice was noise.

`priorForDeltaVsPrior` in `buildHeadlineRows()` is literally `v1` (the middle month),
i.e. `row.values[1]` — so the redundancy was exact, not approximate. The "vs same
month last year" delta's prior value is NOT shown anywhere else in the table (last
year isn't a column), so that one keeps its "(was X)".

Fix: `DeltaCell` got a `showPrior` prop (default `true`); the vs-prior-month call site
passes `showPrior={false}`, the vs-last-year call site is untouched. Commit `b5b72ef`.
`npm run build` passed clean; not yet clicked through live (same no-browser-session
limitation as the rest of this page — see "Verification status" above).

## 2026-09-09 (later) — slides 4/5 go live, plus 3 new channel-spotlight slides

User: "the 4th slide should also be taken from overall big query only... same goes for
5th... We should have 3 separate slides one for google, second for meta ads, third for
organic (Most important)." Clarified via AskUserQuestion: add 3 new slides AFTER slide 5
(don't replace 4/5); "Organic" definition left to me — went with the app's own existing
`overallFunnelCache.js` `mapChannel`/`CHANNELS` classification (Facebook→Meta Ads,
Google→Google Ads, Content+Brand→Organic, else→Other) rather than a broader
"everything non-paid" definition, since Remarketing/Affiliate carry real spend and are
classified paid elsewhere in this app — lumping them into Organic would have diluted its
whole point (a channel that should show near-zero spend/CPQL).

**Data layer**: `aggregateReviewMonth` gained a `queued` field (Floor + Futwork Human/AI +
Superbot, additive only — doesn't touch anything slide 3 already reads). New
`aggregateReviewMonthByChannel(rows, key)` rolls the same rows up by channel via
`reviewMapChannel`. Provider now also exposes `aggByMonth`, `byChannelByMonth`,
`channelRowsByChannel` (per-channel headline-style rows, built by a new `buildChannelRows`
— same 3-months+2-deltas shape as `buildHeadlineRows` but scoped to one channel, AC
Sales/CPS dropped since neither has a real per-channel figure).

**Slide 4** ("Where the QLs came from") now shows real QL volume by channel for the
current month, ranked bars, zero-QL channels filtered out. **Slide 5** ("How leads moved
through the pipeline") shows a real 4-stage funnel (Leads → Total Queued → Total QL →
Applications) for the current month. **New slides 6/7/8** (Google Ads / Meta Ads /
Organic) — one shared `ChannelSpotlightBody` component + 3 named wrapper slides (never
threaded a `channel` prop through `SLIDES`' fixed `{active, period}` Body signature).
Deck grows 9 → 12 slides.

**Two real Rules-of-Hooks fixes before push**: `ChannelPerformanceSlide`/`FunnelSlide`
initially called `useMemo` *after* an early `if (!ctx) return null` — unlike
`HeadlineSlide`'s own safe pattern (all hooks first, then branch). Since the provider
always wraps the whole page, `ctx` can never actually toggle null↔non-null for one
mounted instance, so this wouldn't have crashed in practice — but fixed to match the
established safe pattern rather than leave a technically-fragile one. `ChannelSpotlightBody`
never used a hook after its own early return, so it needed no change.

**Two real bugs found live-testing the funnel slide, both fixed same session (see the
`fix(marketing-review)` commit right after the feature commit)**:
1. `max` was hardcoded to `stages[0].value` (Leads) — but Total Queued is summed by its
   own queuing-timestamp month, independent of the underlying lead's generation month, so
   it can genuinely exceed Leads (real Aug'26 data: 1,27,299 queued vs 1,11,941 leads).
   That produced a bar wider than its own row. Fixed to the true max across all stages.
2. Label+value text was rendered INSIDE each bar (`justify-content:space-between`) —
   collided illegibly once a stage's bar shrank to a few percent width (Leads-to-
   Applications spans 2+ orders of magnitude on real data: Total QL ≈6.8% width,
   Applications ≈0.3%, floored to 3%). Moved label/value above the bar as plain text; the
   bar underneath is now a purely proportional visual indicator.

**Live-verified end-to-end** (real browser, authenticated session): landing page shows
"12 SLIDES · AUGUST 2026" with all 12 real thumbnails in the right order. Slide 4: Meta
Ads 5,444 / Google Ads 1,444 / Affiliate 1,265 / Other 427 / Remarketing 53 — sums to
8,633, exactly matching slide 3's Aug'26 QL total. Slide 5, after the fix: Leads
1,11,941 (88% width) / Total Queued 1,27,299 (100% width, correctly the widest) / Total
QL 8,633 (visible ~7% sliver, fully legible) / Applications 393 (floored 3% sliver, fully
legible) — no collision, no overflow. Slide 6 (Google Ads) QL Aug'26 = 1,444, slide 7
(Meta Ads) QL Aug'26 = 5,444 — both exactly match their bars on slide 4. Zero real
console errors (only the pre-existing benign extension "message channel closed" noise).

**Real, non-bug finding worth surfacing, not glossed over**: slide 8 (Organic) shows
every cell as "—" across all 4 months (Jun/Jul/Aug'26 and Aug'25) — `Content+Brand`, the
literal Source label this classification maps to "Organic," has had **zero** measurable
QL activity in the whole trailing window. This is correct rendering of real data, not a
bug — but the user explicitly called Organic "most important," so this is worth a direct
conversation: either Organic traffic is tracked under a different Source label in this
business (candidate: the 427-QL "Other" bucket on slide 4, which is whatever didn't map
to Meta/Google/Remarketing/Affiliate/Content+Brand) and the classification needs
widening, or Organic genuinely has no measurable contribution right now and that itself
is the finding. Flagged to the user directly rather than left to be discovered later.

Commits: `10a15de` (feature), `9da84e4` (funnel-slide bug fixes).

## 2026-09-09 (later still) — live-review feedback pass: Total Queued bug, all channels shown, noisy UI copy removed, print/fullscreen/animation built out (commit `35b789d`)

User live-reviewed the deck (screenshots of the funnel slide and the fullscreen cover
view) and sent a single feedback message with 10 items. All are now shipped except
item 10 (an open-ended "what else should be shown" question, answered as a
recommendation in chat, not built).

**1. Total Queued was wrong — real bug, root-caused against `OverallDashboard.jsx`.**
`aggregateReviewMonth`'s `queued` field summed `floor_queued` + all 3 Futwork/Superbot
queues (4 fields) based on a comment I'd written earlier without actually checking
Overall's real definition. Overall's own `totalQueued = futworkHumanQ + futworkAiQ +
superbotQ` — Floor Queued is a separate, PARALLEL branch ("Directly Distributed to
Floor"), never folded into Total Queued there. Verified the bug's real magnitude via a
standalone Supabase query script before fixing: Aug'26 showed 1,27,327 (wrong,
floor-inclusive) vs. 86,532 (correct) — a ~47% overstatement. Fixed by excluding Floor
from `queued` and tracking it separately as a new `floorQueued` field (not yet surfaced
on the funnel slide as its own stat — future follow-up if wanted). Live-verified: the
funnel slide's Total Queued bar now reads 86,532, matching the corrected figure exactly,
and is correctly narrower than Leads (was wider before the fix).

**2. "Where is Organic?"** `ChannelPerformanceSlide` was filtering out any channel with
0 QLs this month — which is exactly why Organic (0 QLs for Aug'26, a real finding
documented above) never appeared, making it look like a bug rather than the honest
answer. Removed the filter; all 6 canonical channels always render now, zero-value ones
included. Live-verified: Organic now shows as its own row with a 0 value.

**3-5. Three pieces of UI copy removed, all per direct "not this" feedback:** the
"Synced ... Source: Overall (BigQuery cache)" footer note (4 call sites: Headline,
Channel Performance, Funnel, and the 3 channel-spotlight slides via `ChannelSpotlightBody`);
the green "Live data · Overall (BigQuery)" pill on `PeriodBadge` (simplified to just
`{!live && <amber pill>}` — the amber "Sample data" pill for placeholder slides is
untouched, only the green one was ever complained about); and the landing page's "Full
keyboard control, a slide navigator..." subtitle line (deleted outright, not replaced).

**6. Print/Export PDF wasn't including all 12 pages.** Root cause (found last session,
fixed this one): the outer app shell div (`className="lq-page-shell"`, inline
`height:100vh; overflow:hidden`) and its flex content-column child are BOTH ancestors of
`ReadView`'s own `.printRoot` element, but the existing `@media print` CSS only reset
`.printRoot` itself — those two outer ancestors kept clipping every page past the first
during print. CSS half (`.shellRoot`/`.contentCol` reset classes) was already in the
module from last session; this session wired the actual `className`s onto those two
divs in `MarketingReviewDashboard`'s return JSX. Not yet re-verified with a real
print/PDF-export click-through (no PDF preview possible via this environment's browser
tooling) — worth confirming next time a real session prints this deck.

**7. Fullscreen chrome auto-hide.** New `chromeVisible` state + a `mousemove`/`keydown`
listener effect: while genuinely fullscreen (and the presenter panel isn't open), the
progress rail, label+controls row, and bottom bar fade out after 3s of inactivity
(`.mrChromeHidden`/`.mrChromeVisible`, CSS already existed) and reappear instantly on
any mouse/key activity. Never hides outside real Fullscreen, and never while Presenter
view is open (a deliberately-open panel shouldn't vanish out from under the presenter).

**8. Bar animation.** Added a one-time shimmer sweep (`.mrBarShimmer`, timed via
`animationDelay` to fire right as each bar finishes growing in) and a value pop-in
(`.mrValuePop`) to both `ChannelBar` (slide 4 + the 3 channel spotlights) and
`FunnelSlide`'s stage bars — purely additive to the existing width-transition, only
rendered when `active` (so thumbnails/gallery/print, which render with `active=false`,
are unaffected).

**9. Scene effects / transitions / more presentation tools ("deep-dive on it").**
Shipped four things, all previously CSS-only scaffolding, now wired into `DeckView`'s
actual logic:
   - **Directional push transitions** — `goTo` now records `next`/`prev` in a
     `dirRef`, and the main-stage slide wrapper's `animation` (previously a fixed
     `mrSlideIn` for every navigation) switched to `className={styles.mrPushNext |
     mrPushPrev}` + a `--mr-scale` CSS custom property carrying the scale value the
     keyframe itself composes with.
   - **Laser pointer (L)** — `laserOn` state + `onMouseMove` on the deck root tracks
     cursor position into `laserPos`; a `.mrLaserDot` (cyan glow, on-brand — this app
     never uses red) renders at that position while toggled on; the real OS cursor is
     hidden via `.mrCursorNone` while the laser is active (or while chrome is
     auto-hidden in fullscreen).
   - **Blackout (B)** — `blackout` state renders a full `.mrBlackout` overlay with a
     "Press B or click to resume" hint; click-to-dismiss also wired.
   - **Multi-digit go-to-slide** — replaced the old `/^[1-9]$/`-only jump (couldn't
     reach slides 10-12 once the deck grew past 9) with a digit buffer
     (`digitBufferRef`, capped at 2 chars) that auto-commits after 900ms of no further
     digit, or immediately on Enter. The keyboard-hint toast text was updated to
     describe all the new shortcuts (B blackout, L laser, digits+Enter jump).

Live-verified all of item 9 in a real authenticated browser session: typed "3" then
Enter — jumped straight to slide 3 (proving multi-digit-then-Enter jump works, not just
the old single-digit path); pressed B — full-screen black overlay appeared with the
resume hint, B again correctly resumed; pressed L and hovered the slide — a cyan glowing
dot tracked the cursor exactly as designed, L again turned it off cleanly. Chrome
auto-hide and the push-transition animation were code-reviewed and the built JS chunk
was confirmed (via direct fetch of the live deployed chunk) to contain the
`mrPushNext`/`mrPushPrev`/`mrChromeHidden`/`mrLaserDot`/`mrBarShimmer`/`mrValuePop`
class names, but not separately screenshotted mid-transition/mid-fade in this pass —
worth a closer look next time if the push-transition direction or the fade timing ever
look off in a real presentation.

**Verification overall**: `npm run build` clean. Deployed via direct push to `main`
(commit `35b789d`). Confirmed the live deployment was actually serving the new code by
fetching the real deployed `MarketingReviewDashboard-*.js` chunk (found via the live
`index.html` → entry chunk → its own import of this page's chunk — NOT by comparing
local vs. live hashes, which this repo's CLAUDE.md already documents as invalid across
build environments) and grepping it for both the new class names (present) and the
removed strings ("Live data", "Full keyboard control", "Source: Overall (BigQuery
cache)" — all absent, confirmed zero matches). Then did a full live click-through:
landing page (no subtitle, confirmed), slide 4 (all 6 channels including Organic=0),
slide 3 (headline table, no footer/pill), slide 5 (Total Queued = 86,532, corrected),
digit-jump, blackout, laser pointer — all matched expectations. Zero console errors.

**Not yet done**: item 10 (an open recommendation on "what else should be shown," not a
build task) — answered directly in chat, not implemented as code. Print/PDF export's
actual multi-page output was not visually re-verified this session (no PDF preview
available via the browser tooling used) — the CSS+JSX fix is logically sound (both
ancestor divs now correctly reset under `@media print`) but hasn't been seen as a real
printed/exported PDF. `floorQueued`, tracked separately since the Total Queued fix, is
still not surfaced anywhere on the funnel slide as its own stat.
