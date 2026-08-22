-- "Watch my team" for the Team Mapping Org Chart tab
-- (src/pages/TeamMappingDashboard.jsx's OrgChartTab/WatcherModal).
--
-- Lets an admin subscribe someone (an ASM/SM or SSM -- not necessarily a
-- Quantum login; most of the LeadSquared roster has none) to be Slack-DM'd
-- whenever the team under a given node changes -- someone added, removed, or
-- moved elsewhere. node_key is the WATCHED node's normalized name (the same
-- normalizeName() the org chart itself already uses to group near-duplicate
-- spellings), not a Quantum user id. subscriber_email is who gets the DM --
-- looked up on Slack's side via users.lookupByEmail at send time, so it does
-- NOT need to be a Quantum login either, only a real @leverageedu.com Slack
-- account.
--
-- Reads/writes go through api/crm-leads.js (service-role key), same as every
-- other Team Mapping table -- admin-only, since this is a management action
-- taken on someone's behalf, not day-to-day self-serve.

CREATE TABLE IF NOT EXISTS public.team_mapping_watchers (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  node_key TEXT NOT NULL,
  node_label TEXT,
  subscriber_email TEXT NOT NULL,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(node_key, subscriber_email)
);

CREATE INDEX IF NOT EXISTS idx_team_mapping_watchers_node ON public.team_mapping_watchers(node_key);

ALTER TABLE public.team_mapping_watchers DISABLE ROW LEVEL SECURITY;
