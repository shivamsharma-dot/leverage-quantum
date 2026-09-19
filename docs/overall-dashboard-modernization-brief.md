# Brief: is a table + a KPI grid even the right way to show this anymore?

> Working design brief, not a finished spec. Written 2026-09-19 for the Overall (BigQuery)
> dashboard, but the underlying question applies to every dense dashboard page in Quantum.
> Read this before proposing changes to either the Funnel Summary table or the KPI grid --
> it's the "why" behind whatever gets built next, not just a task list.

## The actual question being asked

Not "how do we make the table nicer" or "how do we fit more KPI cards on screen." The
real question is more fundamental: **in 2026, with AI-native tools that can just answer a
question in plain English, is a giant sortable/filterable spreadsheet-style table and a
grid of 20 static number-tiles still the right default way to show marketing performance
data at all** -- or is that a pre-AI mental model (Excel-in-a-browser) that a genuinely
modern product would replace, or at least demote to a secondary view?

Two surfaces, one question each:

1. **The Funnel Summary table** (34 columns, customizable, sortable, paginated, groupable
   by Source/Campaign/Corridor/Month/Day, shared Saved Views). Is a table the right
   *primary* surface for this data, or should the primary surface be something else --
   narrative, conversational, auto-summarized -- with the table demoted to "the detail
   view you drill into," not the thing you land on?
2. **The KPI grid** (20 static `PremKPI` tiles, 2 rows of 10, every metric shown at equal
   visual weight regardless of whether it moved, whether it's healthy, or whether anyone
   actually looks at it that day). Is a flat, unprioritized grid of numbers the right
   default, or should the page instead lead with *what changed and why* -- and only show
   the full grid to someone who explicitly asks for it?

## What "modernize" does NOT mean here

Not: rounder corners, a fresh color, more animation, a slicker font. This app already has
that polish (brand-consistent KPI cards, a real design system, sticky headers, saved
views, drag-reorder). "Modernize" here means: **does the interaction model itself belong
to the AI era, or to the pre-2023 BI-dashboard era** -- regardless of how well-executed
the pre-2023 model is.

## What's already true about this exact app -- don't re-derive, build on it

Quantum already has real, shipped precedent for "AI-native" patterns elsewhere in the
same codebase. Any recommendation should explicitly reckon with these, not propose them
as if they were new ideas:

- **Ask AI** (`api/ask-ai.js`, `src/pages/AskAI.jsx`) already does natural-language,
  tool-using, live-data querying across Meta/Google/CRM data -- the "just ask a question
  instead of building a filter" pattern already exists as a whole page, just not
  integrated into Overall itself.
- **Marketing Review's Wins & Highlights / Risks & Watch-outs slides**
  (`buildInsights()` in `MarketingReviewDashboard.jsx`) already auto-generate a
  narrative -- "Meta Ads is the top QL driver," "Organic at zero QLs" -- computed from
  the same kind of delta/threshold logic a KPI grid buries in 20 separate tiles a human
  has to scan themselves. This is the single closest existing precedent for "tell me
  what matters" instead of "show me everything."
- **Overall's own "Compare" tool** already generates a plain-English driver breakdown
  ("Total QL is up 26%... What's driving it") -- narrative-over-numbers, already built,
  already trusted.
- **The Insights modal** already demonstrates the instinct to NOT put everything on the
  main page -- secondary charts got moved behind one button specifically because the
  page was too dense. The KPI grid arguably deserves the same demotion logic.
- **The Funnel Summary table's own history** (this file's changelog) already went
  through exactly this modernization arc once: too many columns -> curated default +
  picker. That fixed *density*, but never asked whether a table was the right shape to
  begin with. This brief is explicitly the next, deeper round of that same question.

## Constraints that any answer has to respect

- **Real users are internal marketers/ops, not data engineers.** They trust exact
  numbers (CPL, spend, QL counts) for real spend decisions. Nothing here should trade
  precision for a "cooler" presentation -- a narrative summary is additive, never a
  replacement for being able to see the exact number when someone needs it.
- **Never fabricate or approximate a number a narrative describes.** Any AI-generated
  summary text must be computed the same way the underlying KPI/table cell already is
  -- reusing existing aggregation code, never a second, independent recalculation that
  could drift (the exact discipline `buildInsights()` on Marketing Review already
  follows).
- **Nothing here should regress what already works.** The table's filters, sorting,
  drill-downs (Human/AI QL, Apps, Total Revenue), Slack export, and CSV export are all
  real, used, verified features -- any redesign has to keep or improve on all of them,
  not quietly drop capability for the sake of a new look.
- **This is one dashboard among ~15 in the app.** A pattern worth adopting here should
  be evaluated for whether it's worth generalizing into `dashboardKit.jsx` (shared
  infra) or whether it's genuinely specific to Overall's own density problem.

## What to actually investigate (this is the research task)

For BOTH surfaces (table and KPI grid), answer with real, current (2025-2026) examples,
not generic "AI dashboards" hand-waving:

1. **What do genuinely AI-native analytics/BI products do differently from a
   traditional grid+table dashboard right now?** Look at how conversational-analytics
   and agentic BI tools (e.g. ThoughtSpot Spotter, Hex's AI notebook/magic tools, Mode's
   AI, Databricks Genie, Julius AI, Delphi, Coefficient's AI formulas, Amplitude's AI
   insights, Perplexity Finance's data cards, Notion AI databases/views, Linear's
   Insights) actually change about the *default landing view* -- do they still show a
   grid of numbers first, or lead with a generated summary/narrative/anomaly list and
   let the grid be one click away?
2. **For KPI grids specifically**: is there a real, adopted alternative to "20 equal-
   weight tiles" -- e.g. an auto-prioritized "what needs your attention today" strip
   (only showing metrics that moved meaningfully, or crossed a threshold), a single
   narrative paragraph replacing several tiles, sparkline-dense compact tiles instead of
   one big number each, or a chat-first "ask what changed" box above a collapsed grid?
3. **For dense tables specifically**: is there a real, adopted alternative to "one huge
   customizable grid" -- e.g. table-as-drill-down-only (reached by clicking into a
   narrative claim, never the landing view), an embedded "ask a follow-up" input row
   inside the table itself, AI-suggested groupings/filters instead of a manual picker,
   or auto-generated per-row annotations (e.g. "Facebook: cheapest CPQL this month")
   instead of relying on a human to notice it by scanning columns?
4. For each pattern found: is it a genuine UX improvement for THIS app's real users
   (non-technical, trust-sensitive, need exact numbers on demand), or is it a demo-ware
   gimmick that looks impressive but would be slower/less trustworthy in daily use for a
   marketer checking spend at 9am?

## What the answer should come back as

Not a mood board. A short, opinionated set of concrete options, each with:
- What it would actually look like on Overall specifically (not abstract).
- What existing Quantum code/pattern it builds on (Ask AI tool-use, buildInsights-style
  narrative generation, the Insights-modal demotion pattern, etc.) vs. what's genuinely
  new infrastructure.
- The real tradeoff -- development effort, risk of regressing trust/precision, and
  whether it's additive (keeps the table/grid, adds a smarter front door) or replacive
  (actually changes what people land on).
- A stated recommendation, not just a menu -- which one is actually worth building
  first, and why.

Explicitly answer, in plain terms, both of the user's original questions:
- **"Is the table necessary, or is there another way to show this same data?"**
- **"Is there a more advanced, modern, AI-native way to show 20 KPIs, in an interesting
  and interactive way?"**
