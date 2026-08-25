-- Locks app_preferences to service-role only. Safe: confirmed 2026-08-25 that
-- no client-side code reads/writes this table directly (everything routes
-- through /api/preferences.mjs, which uses the service-role key). Same
-- pattern already applied to allowed_users/meta_tokens on 2026-07-21.
ALTER TABLE public.app_preferences ENABLE ROW LEVEL SECURITY;
