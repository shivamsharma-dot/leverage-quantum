-- Run once against the already-live apps_feed table to pick up the new
-- appv2 columns (2026-09-07). Safe to re-run -- every ADD COLUMN is
-- IF NOT EXISTS. apps_feed_setup.sql's own CREATE TABLE was updated to
-- include these too, for a fresh install; this file is only for a table
-- that already existed before appv2 replaced the earlier "Apps" query.
ALTER TABLE public.apps_feed ADD COLUMN IF NOT EXISTS first_app_submitted_at TEXT;
ALTER TABLE public.apps_feed ADD COLUMN IF NOT EXISTS vertical TEXT;
ALTER TABLE public.apps_feed ADD COLUMN IF NOT EXISTS country2 TEXT;
ALTER TABLE public.apps_feed ADD COLUMN IF NOT EXISTS sub_source TEXT;

CREATE INDEX IF NOT EXISTS idx_apps_feed_submitted_at ON public.apps_feed(first_app_submitted_at);
