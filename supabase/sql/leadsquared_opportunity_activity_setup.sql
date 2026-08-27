-- Audit log for the "Create Opportunity" feature on the LeadSquared page
-- (src/pages/LeadSquaredDashboard.jsx, api/crm-leads.js's captureLeadSquaredOpportunity).
--
-- Deliberately its OWN table, not a reuse of team_mapping_activity -- that table is
-- gated on the 'team_mapping' access grant, while Create Opportunity is gated on
-- 'leadsquared'. A user with one grant but not the other would either be blocked from
-- their own history, or (worse) see CRM-write activity they were never granted
-- visibility into. Same reasoning as every other per-feature table in this app.
--
-- One row per actual LeadSquared Capture-Opportunities call -- both a single-form
-- submit AND every individual row of a bulk import get their own row here, never
-- collapsed into an aggregate-only summary the way Team Mapping's bulk USER import
-- is. That's intentional: the whole point of this table (per explicit user ask) is
-- to answer "what did LeadSquared actually say back" for a SPECIFIC lead/opportunity,
-- which an aggregate done/failed/skipped count can't answer on its own. batch_label
-- ties a bulk run's rows together for grouped display without forcing one.
--
-- status is derived server-side from LeadSquared's own response shape, not guessed:
--   'success'  - Status 0/2 and no ConflictedOpportunityId
--   'duplicate'- Status 0/2 and ConflictedOpportunityId set (a dupe was detected;
--                the opportunity was left untouched unless overwrite_fields was true)
--   'failed'   - Status 1, or the HTTP/network call itself failed
--
-- response_json is LeadSquared's RAW response body, verbatim (Status/ExceptionMessage/
-- CreatedOpportunityId/ConflictedOpportunityId/ActivityId/RequestId/... -- whatever
-- LeadSquared actually returned, not a reshaped subset), since "the real LSQ response"
-- is the explicit ask. request_json is what we sent, for the same reason -- so a
-- failure can be diagnosed without guessing what payload produced it.
--
-- Reads AND writes both go through api/crm-leads.js (service-role key) -- not
-- anon-key readable, matching team_mapping_activity's own pattern. Run once in the
-- Supabase SQL editor before the first Create Opportunity write (safe to re-run).

CREATE TABLE IF NOT EXISTS public.leadsquared_opportunity_activity (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  batch_label TEXT,                 -- null for a single-form submit; file/paste name + row count for a bulk run
  search_by_attr TEXT NOT NULL,     -- e.g. 'EmailAddress'
  target_value TEXT NOT NULL,       -- the match value (email/phone/prospectid) this call was about
  prospect_id TEXT,                 -- optional secondary Lead ID, carried alongside the primary match field
  event_code TEXT,
  overwrite_fields BOOLEAN DEFAULT false,
  status TEXT NOT NULL,             -- 'success' | 'duplicate' | 'failed'
  created_opportunity_id TEXT,
  conflicted_opportunity_id TEXT,
  exception_message TEXT,
  request_json TEXT,                -- what we sent LeadSquared (LeadDetails + Opportunity)
  response_json TEXT,               -- LeadSquared's raw response, verbatim
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lsq_opp_activity_created ON public.leadsquared_opportunity_activity(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lsq_opp_activity_target ON public.leadsquared_opportunity_activity(target_value);
CREATE INDEX IF NOT EXISTS idx_lsq_opp_activity_batch ON public.leadsquared_opportunity_activity(batch_label);

ALTER TABLE public.leadsquared_opportunity_activity DISABLE ROW LEVEL SECURITY;
