-- Import/export/edit activity log for the Team Mapping page
-- (src/pages/TeamMappingDashboard.jsx).
--
-- There's no real background-job runner on Vercel serverless -- a bulk import is
-- actually driven row-by-row from the browser (src/pages/TeamMappingDashboard.jsx's
-- importStore), not a server-side worker. What makes it survive the import modal
-- being closed is this table: importStore is a module-level store (same pattern
-- SnapshotTool.jsx already uses for its own batch-capture progress), so it keeps
-- running as long as the browser tab is open regardless of which component is
-- mounted, and it PATCHes its own row here every few saves -- so "did my import
-- finish" is answerable by reading this table, not by keeping the modal open and
-- watching a progress bar.
--
-- type is one of: 'import' | 'export' | 'edit' | 'delete' | 'restore'. import/export
-- are as before. edit/delete/restore are per-person changes to team_mapping_manual --
-- every save/remove/restore now logs who did it and exactly which fields changed
-- (detail, a JSON string: {"changes": {"field": {"from": "...", "to": "..."}}} for
-- an edit, or {"snapshot": {...all fields...}} for a delete, so a delete can be
-- restored in full). target_email ties the row back to the LeadSquared user it was
-- about, separate from label (a human-readable filename/name/description), so the
-- History page can show "what changed for whom" without parsing label text.
--
-- Reads AND writes both go through api/crm-leads.js (service-role key), matching
-- team_mapping_manual's own pattern -- not anon-key readable. Run once in the
-- Supabase SQL editor before the first import (safe to re-run any time after too).

CREATE TABLE IF NOT EXISTS public.team_mapping_activity (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  type TEXT NOT NULL,               -- 'import' | 'export' | 'edit' | 'delete' | 'restore'
  label TEXT,                       -- filename (import) / description (export) / person name (edit-delete-restore)
  target_email TEXT,                -- the LeadSquared user an edit/delete/restore was about
  detail TEXT,                      -- JSON: field-level before/after, or a full snapshot for delete
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
CREATE INDEX IF NOT EXISTS idx_team_mapping_activity_target ON public.team_mapping_activity(target_email);

ALTER TABLE public.team_mapping_activity DISABLE ROW LEVEL SECURITY;

-- Safe to re-run: adds target_email/detail if this table already existed from the
-- import/export-only v1 of this file.
ALTER TABLE public.team_mapping_activity ADD COLUMN IF NOT EXISTS target_email TEXT;
ALTER TABLE public.team_mapping_activity ADD COLUMN IF NOT EXISTS detail TEXT;
