-- Team Mapping page (src/pages/TeamMappingDashboard.jsx) -- the manual, human-entered
-- fields laid over LeadSquared's own live roster (Name/Email/LS Role/Status/Groups
-- come straight from the LeadSquared API in real time, as do Phone Number, Airtel
-- Number and Reporting Manager -- see api/crm-leads.js's fetchLeadSquaredUserDetails,
-- which reaches LeadSquared's real per-user detail endpoint, discovered from their
-- own API docs -- none of those five are stored here). This table only holds what
-- genuinely has no live-API source at all: ASM/SM, SSM, a business-side Role
-- (distinct from LeadSquared's own coarse "LS Role"), level, country, centre.
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
  asm_sm TEXT,
  asm_sm_email TEXT,
  ssm TEXT,
  ssm_email TEXT,
  role TEXT,                -- ASM / Consultant / Manager / Intern / AD / CBO /
                            -- Performance Marketing User / Tech User / Leadsquared
                            -- Super Admin / Leadsquared Admin -- a business-side
                            -- designation, distinct from LeadSquared's own coarse
                            -- Role (Sales_User/Administrator/...), which the
                            -- frontend labels "LS Role" so the two are never confused.
  level TEXT,
  country TEXT,
  centre_name TEXT,
  updated_by TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.team_mapping_manual DISABLE ROW LEVEL SECURITY;

-- Safe to re-run even if the table above already existed from an earlier version of
-- this file. Each ALTER is idempotent, so running this whole file again after the
-- table already exists (e.g. because a fresh column was added here later) is fine.
--
-- v1 -> v2 (this pass): tier renamed to role; employment_status, ls_manager_name,
-- ls_manager_email, phone_number and airtel_number all dropped -- Employment status
-- duplicated the live Active/Inactive status every row already showed, and the other
-- four turned out to have a real live-API source after all (see the header comment),
-- so they moved out of this manual table entirely rather than staying as an override.
ALTER TABLE public.team_mapping_manual ADD COLUMN IF NOT EXISTS role TEXT;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='team_mapping_manual' AND column_name='tier')
     AND NOT EXISTS (SELECT 1 FROM team_mapping_manual WHERE role IS NOT NULL) THEN
    UPDATE public.team_mapping_manual SET role = tier WHERE role IS NULL;
  END IF;
END $$;
ALTER TABLE public.team_mapping_manual DROP COLUMN IF EXISTS tier;
ALTER TABLE public.team_mapping_manual DROP COLUMN IF EXISTS employment_status;
ALTER TABLE public.team_mapping_manual DROP COLUMN IF EXISTS ls_manager_name;
ALTER TABLE public.team_mapping_manual DROP COLUMN IF EXISTS ls_manager_email;
ALTER TABLE public.team_mapping_manual DROP COLUMN IF EXISTS phone_number;
ALTER TABLE public.team_mapping_manual DROP COLUMN IF EXISTS airtel_number;
