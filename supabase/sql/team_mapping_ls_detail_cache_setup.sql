-- Cache of the per-user LeadSquared detail fields (Phone/Airtel/Reporting
-- Manager/Team) that src/pages/TeamMappingDashboard.jsx's live table already
-- shows -- but only for whichever ~60-row page is currently on screen
-- (fetchLeadSquaredUserDetails in api/crm-leads.js, one LeadSquared API call
-- PER user, no bulk variant exists on this account -- confirmed live, every
-- plausible Team.svc/Teams.Get/User/Retrieve/ByTeamId path 404s the same way
-- Sales Groups' own dedicated endpoints already did, per the comment on
-- fetchLeadSquaredTeamUsers).
--
-- This table exists for exactly one reason: the Frapp "coaches" push
-- (api/crm-leads.js's team_frapp_preview/team_frapp_push modes) needs to know
-- EVERY person's Team and Airtel number to filter to "University Admission
-- Opportunity" + Active -- and there is no cheap way to ask LeadSquared "who
-- is on team X" without already knowing each person's team, which means
-- calling the per-user endpoint for the whole ~3,380-person roster at least
-- once. That sweep cannot happen inside a single Vercel function call
-- (60s maxDuration, ~3,380 sequential-ish calls), so it happens client-driven
-- instead -- same pattern the bulk-import feature already uses for exactly
-- this "no real background worker on Vercel serverless" problem: the browser
-- loops through the roster in batches of 60 (team_user_detail, already built,
-- unchanged), and after each batch POSTs the results here (team_detail_cache_save)
-- so progress survives even if the admin closes the tab partway through.
--
-- Written by  api/crm-leads.js's team_detail_cache_save mode, driven by the
--             "Sync coach directory" button in the Connectors tab.
-- Read by     api/crm-leads.js's team_frapp_preview / team_frapp_push modes.
--
-- This is NOT read by the main roster table -- that still fetches live,
-- per-page, on demand (unchanged). Deliberately kept separate so this cache
-- being stale/incomplete can never make the live table show wrong data; it
-- can only make a Frapp push miss someone who hasn't been swept in yet.

CREATE TABLE IF NOT EXISTS public.team_mapping_ls_detail_cache (
  ls_user_id     TEXT PRIMARY KEY,
  email          TEXT,
  phone_main     TEXT,
  airtel_number  TEXT,
  manager_name   TEXT,
  manager_email  TEXT,
  team_id        TEXT,
  team_name      TEXT,
  synced_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_team_mapping_ls_detail_cache_email ON public.team_mapping_ls_detail_cache(email);
CREATE INDEX IF NOT EXISTS idx_team_mapping_ls_detail_cache_team  ON public.team_mapping_ls_detail_cache(team_name);

-- RLS disabled to match team_mapping_manual/team_mapping_activity/
-- team_mapping_connectors -- this table is only ever touched via
-- supabaseAdmin (service-role key) from admin-gated modes in api/crm-leads.js,
-- never read directly with the anon key.
ALTER TABLE public.team_mapping_ls_detail_cache DISABLE ROW LEVEL SECURITY;
