-- Team Mapping page (src/pages/TeamMappingDashboard.jsx) -- the manual, human-entered
-- fields laid over LeadSquared's own live Users.Get roster (Name/Email/Role/Status/
-- Groups come straight from the LeadSquared API in real time and are never stored
-- here). This table only holds the columns LeadSquared's API doesn't expose at all --
-- the org-hierarchy fields the "Akash - Squad Mapping" Google Sheet used to track by
-- hand (ASM/SM, SSM, tier, level, country, centre, phone).
--
-- Keyed by ls_email (lowercased) so a row survives an email-address's-own casing
-- drift but still joins 1:1 against LeadSquared's EmailAddress field.
--
-- Lifecycle rule (the whole point of this table): every time the Team Mapping page
-- loads the live user list, api/crm-leads.js (source=leadsquared&mode=team_users)
-- deletes any row here whose ls_email is no longer present in that live roster --
-- so a LeadSquared user who's gone takes their manual notes with them. A row for a
-- user who's still there is left alone indefinitely.
--
-- Reads AND writes both go through that same server endpoint (service-role key) --
-- deliberately NOT anon-key readable like most tables in this app, since this is a
-- full internal-roster/org-chart surface, not a metrics table. Run once in the
-- Supabase SQL editor before the first save.

CREATE TABLE IF NOT EXISTS public.team_mapping_manual (
  ls_email TEXT PRIMARY KEY,
  ls_manager_name TEXT,
  ls_manager_email TEXT,
  asm_sm TEXT,
  asm_sm_email TEXT,
  ssm TEXT,
  ssm_email TEXT,
  tier TEXT,               -- ASM / Consultant / Coach / Manager / Intern -- the sheet's
                           -- own "Status" column, renamed here to avoid colliding with
                           -- LeadSquared's own Active/Inactive user status.
  level TEXT,
  country TEXT,
  centre_name TEXT,
  phone_number TEXT,
  airtel_number TEXT,
  updated_by TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.team_mapping_manual DISABLE ROW LEVEL SECURITY;

-- Safe to re-run even if the table above already existed from an earlier version
-- of this file: adds the new manager-email column, drops the retired
-- employment_status column (it duplicated LeadSquared's own live Active/Inactive
-- status, so it never carried information the page didn't already show live).
ALTER TABLE public.team_mapping_manual ADD COLUMN IF NOT EXISTS ls_manager_email TEXT;
ALTER TABLE public.team_mapping_manual DROP COLUMN IF EXISTS employment_status;
