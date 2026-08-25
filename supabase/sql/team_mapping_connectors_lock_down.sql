-- team_mapping_connectors holds a bearer api_key (external roster-export pull)
-- plus a webhook URL -- confirmed 2026-08-25 both are readable by anyone via
-- the public anon key with RLS off. Confirmed no client-side code reads this
-- table directly (Team Mapping's Connectors tab goes through
-- /api/crm-leads.js, which uses the service-role key), so this is safe.
ALTER TABLE public.team_mapping_connectors ENABLE ROW LEVEL SECURITY;
