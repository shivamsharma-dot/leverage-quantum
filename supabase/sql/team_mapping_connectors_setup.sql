-- Outbound connectors for the Team Mapping page (src/pages/TeamMappingDashboard.jsx,
-- "Connectors" tab; api/crm-leads.js's notifyTeamMappingConnectors/syncTeamMappingSheet/
-- handleTeamExportPull). This is what makes Team Mapping usable as a real "source of
-- team mapping" for other tools instead of a dead end -- every save/delete/restore/
-- finished import fires out to whichever of these are turned on:
--
--   webhook       POST a JSON payload (event/at/by/target_email/label/changes or
--                 snapshot or summary) to an arbitrary URL -- for a bespoke internal
--                 tool to react to.
--   slack         Post a short plain-text notification to a Slack channel via
--                 chat.postMessage (needs the existing SLACK_BOT_TOKEN env var --
--                 same bot already used by the Reports Slack integration).
--   google sheet  Overwrite the first tab of an existing spreadsheet with the full
--                 current roster+manual snapshot (Name/Email/LS Role/Status/Groups/
--                 ASM-SM/SSM/Role/Level/Country/Centre) on every change -- a live
--                 mirror for anyone who prefers reading this in Sheets. Deliberately
--                 excludes Phone/Airtel/Reporting Manager (those need a per-user
--                 LeadSquared call each -- fine for ~50 rows on a table page,
--                 too expensive to redo for all ~3,380 users on every single edit).
--   read-only api api_key-gated GET (no Quantum login) returning the same snapshot
--                 as JSON, for an external script/tool to pull on its own schedule.
--
-- Single fixed row (id='default') -- this is page-level config, not per-user. Admin-
-- only to read/write (the row holds a webhook URL and an API key, both worth keeping
-- out of anon-key reach) -- reads AND writes go through api/crm-leads.js's service-role
-- client, same as team_mapping_manual/team_mapping_activity.

CREATE TABLE IF NOT EXISTS public.team_mapping_connectors (
  id TEXT PRIMARY KEY DEFAULT 'default',
  webhook_enabled BOOLEAN NOT NULL DEFAULT false,
  webhook_url TEXT,
  webhook_last_status TEXT,
  webhook_last_at TIMESTAMPTZ,
  slack_enabled BOOLEAN NOT NULL DEFAULT false,
  slack_channel TEXT,                 -- '#channel-name' or a channel ID the bot is already in
  slack_last_status TEXT,
  slack_last_at TIMESTAMPTZ,
  sheet_enabled BOOLEAN NOT NULL DEFAULT false,
  sheet_id TEXT,                      -- the spreadsheet id from its URL, not the full URL
  sheet_last_status TEXT,
  sheet_last_at TIMESTAMPTZ,
  api_enabled BOOLEAN NOT NULL DEFAULT false,
  api_key TEXT,                       -- plaintext by design: an internal automation key an
                                       -- admin copies into another tool, not a login credential
  updated_by TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.team_mapping_connectors DISABLE ROW LEVEL SECURITY;
