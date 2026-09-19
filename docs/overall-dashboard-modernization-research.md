# Research: table & KPI grid in the AI era — findings + recommendation

> Companion to `overall-dashboard-modernization-brief.md` (the brief that was researched).
> Written 2026-09-19. Sources at the bottom.

## The one-sentence finding

Every credible 2025-2026 AI-native analytics product still keeps an exact, governed
table/dashboard as the source of truth — the AI layer **re-ranks and narrates on top of
the same numbers**, it never replaces them with prose. The one category of tool that
*does* lead with chat-generated prose instead of a grid (Julius-style spreadsheet chat)
is explicitly called out by reviewers for numeric hallucination risk — disqualifying for
a page people use to make real spend decisions.

Concretely: ThoughtSpot Spotter, Databricks Genie, Metabase Metabot, and Sigma all keep
governed tables/charts as the substrate and add natural language as a query bar into
them. Metabase's Metabot explicitly checks for an existing dashboard/question before
running a new query "to avoid duplicated logic" — i.e. a named design principle at a
real BI vendor for exactly the "never a second, independently-computed number" rule this
codebase already follows. Amplitude's Automated Insights and Tableau Pulse are the
closest real precedents for the KPI-grid question: Pulse explicitly splits into an
"Awareness Layer" (a personalized feed of followed metrics, sparklines, on-track/off-
track tags, one generated sentence) and an "Action Layer" (the full dashboard, one click
away) — a near-exact blueprint for what was asked.

## What to actually build, in order

**Both recommendations below reuse deterministic logic Quantum already has, verified and
live elsewhere in this exact app — neither needs a new LLM call or a new source of
truth.**

1. **Port `buildInsights()` from Marketing Review onto the Overall KPI grid** — a one-line
   deterministic headline above the 20 tiles ("QL up 26% vs last week, driven by Meta
   Ads; CPQL flat"), computed the same threshold/delta way the Wins & Highlights slide
   already does. Cheapest win in the whole exercise — it's a port, not new logic.
2. **Re-rank the KPI grid so tiles with a real delta surface first**, with an
   on-track/off-track-style tag, and collapse the flat ones behind a "Show all 20"
   toggle (all 20 stay one click away, nothing removed) — reuses the same delta math
   already computed for the MTD Scorecard Slack report.
3. **Add a movers/drivers strip above the Funnel Summary table**, reusing the Compare
   tool's own driver-breakdown logic, ranked by |Δ| instead of shown flat.
4. **Extend the click-to-expand pattern already on 3 of the 20 KPI tiles (Human QL, AI
   QL, Applications) to all 20** — closes a real existing inconsistency, AI question or
   not.
5. **Later, bigger bet**: a scoped natural-language query bar over the table (à la
   Spotter/Genie) that filters/opens the real table rather than answering in a floating
   paragraph, and eventually a pushed Slack/email "Overall Daily Digest" à la Tableau
   Pulse (needs a new "follow this metric" concept — genuinely new surface, worth doing
   once the in-page narrative has been trusted for a few weeks).

Explicitly rejected: replacing the table or the KPI grid outright with a chat/narrative
surface. No serious product in this space does that for exact, decision-driving numbers,
and it would directly regress this app's own "always show the real number" constraint.

## Direct answers

**"Is the table necessary, or is there another way to show this?"**
Keep it. The modern move isn't table-vs-no-table, it's **table as the second click, not
the whole first screen** — lead with the movers strip, let natural language act as a
query bar into the same table, keep the full grid exactly as it is underneath.

**"Is there a more advanced AI way to show 20 KPIs, interactively?"**
Yes, and the two pieces it needs already exist in this codebase: reuse `buildInsights()`
for the sentence, reuse the MTD Scorecard delta math for the re-ranking, extend the
click-to-expand pattern already on 3 tiles to all 20. Assembling primitives Quantum
already trusts, not inventing a new one.

## Sources
- [Spotter for Industries: Deterministic AI, Trusted Analytics](https://www.thoughtspot.com/blog/spotter-for-industries)
- [Spotter — ThoughtSpot Documentation](https://docs.thoughtspot.com/cloud/26.8.0.cl/spotter)
- [AI/BI and Genie release notes 2026 — Databricks](https://docs.databricks.com/aws/en/ai-bi/release-notes/2026)
- [Amplitude Introduces Agentic AI Analytics](https://investors.amplitude.com/news-releases/news-release-details/amplitude-introduces-agentic-ai-analytics-next-era-product)
- [Amplitude launches Automated Insights — SiliconANGLE](https://siliconangle.com/2025/12/10/amplitude-launches-automated-insights-bring-ai-driven-analyst-workflows-product-teams/)
- [PostHog Max AI docs](https://posthog.com/docs/max-ai)
- [Hex — Introducing the Notebook Agent](https://hex.tech/blog/introducing-notebook-agent/)
- [Linear — Insights / Dashboards docs](https://linear.app/docs/dashboards)
- [Julius AI Guide 2026 — DataCamp](https://www.datacamp.com/tutorial/julius-ai-guide)
- [Tableau Pulse — Salesforce](https://www.salesforce.com/analytics/tableau/pulse/)
- [Tableau Pulse 2026 Review](https://www.aitools-directory.com/tools/tableau-pulse-ai-insights/)
- [Metabase — AI Releases](https://www.metabase.com/releases-ai)
- [Coefficient AI Tools for Google Sheets](https://coefficient.io/ai-tools-for-google-sheets)
- [Sigma Computing](https://www.sigmacomputing.com/)
- [Plume: Scaffolding Text Composition in Dashboards (arXiv)](https://arxiv.org/pdf/2503.07512)
- [NL2Dashboard (arXiv)](https://arxiv.org/pdf/2601.06126)
- [Power BI Copilot & AI Analytics Guide 2026](https://www.epcgroup.net/blog/power-bi-copilot-ai-analytics-guide)
