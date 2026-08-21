-- Import/export activity log for the Team Mapping page (src/pages/TeamMappingDashboard.jsx).
--
-- There's no real background-job runner on Vercel serverless -- a bulk import is
-- actually driven row-by-row from the browser (src/pages/TeamMappingDashboard.jsx's
-- importStore), not a server-side worker. What makes it survive the import modal
-- being closed is this table: importStore is a module-level store (same pattern
-- SnapshotTool.jsx already uses for its own batch-capture progress), so it keeps
-- running as long as the browser tab is open regardless of which component is
-- mounted, and it PATCHes its own row here every few saves -- so "did my import
-- finish" is answerable by reading this table, not by keeping the modal open and
-- watching a progress bar. Export events log a single already-finished row (CSV
-- generation is synchronous client-side, nothing to track progress on) so both
-- import and export show up together in one history list.
--
-- Reads AND writes both go through api/crm-leads.js (service-role key), matching
-- team_mapping_manual's own pattern -- not anon-key readable. Run once in the
-- Supabase SQL editor before the first import.

CREATE TABLE IF NOT EXISTS public.team_mapping_activity (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  type TEXT NOT NULL,               -- 'import' | 'export'
  label TEXT,                       -- filename (import) or export description
  status TEXT NOT NULL DEFAULT 'running', -- 'running' | 'done' | 'failed'
  total INT DEFAULT 0,
  done INT DEFAULT 0,
  failed INT DEFAULT 0,
  skipped INT DEFAULT 0,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_team_mapping_activity_created ON public.team_mapping_activity(created_at DESC);

ALTER TABLE public.team_mapping_activity DISABLE ROW LEVEL SECURITY;
