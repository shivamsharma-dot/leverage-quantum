-- Adds channel/source granularity to overall_funnel_daily, which previously
-- only tracked (campaign, date) -- dropping the "Source" dimension the raw
-- Overall PM sheet actually carries (Facebook/Google/Remarketing/Affiliate/
-- Content+Brand/etc). Needed for per-channel contributor breakdowns and
-- per-channel median benchmarks (mixing zero-spend Affiliate rows into a
-- single global CPQL median was dragging it to ~0 -- see api/ask-ai.js).
--
-- overall-funnel-sync.yml re-fetches and fully re-aggregates the whole sheet
-- on every run (no incremental logic), so truncating here is safe -- the very
-- next run (scheduled or manually triggered) fully repopulates the table.

TRUNCATE public.overall_funnel_daily;
ALTER TABLE public.overall_funnel_daily DROP CONSTRAINT IF EXISTS overall_funnel_daily_pkey;
ALTER TABLE public.overall_funnel_daily ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'Unknown';
ALTER TABLE public.overall_funnel_daily ADD PRIMARY KEY (campaign, date, source);
