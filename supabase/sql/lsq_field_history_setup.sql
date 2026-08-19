-- Tracks when the Field Schema page (Lead Qualification > Field Schema,
-- api/crm-leads.js's fetchLeadSquaredActivitySchema) first observed each
-- LeadSquared custom-activity field, and when its shape (data type / mandatory
-- flag / display name) last changed -- since LeadSquared's own
-- CustomActivity/GetActivitySetting API has NO per-field created/modified
-- date or author (confirmed against the real live response: the field object
-- carries no CreatedOn/ModifiedOn/CreatedBy/ModifiedBy at all, and the one
-- "change history" API LeadSquared does expose -- RetrieveActivityChange --
-- tracks value changes on individual activity RECORDS, not the schema
-- definition itself). This table is Quantum's own observation history,
-- starting from whenever this feature first shipped -- not LeadSquared's.
CREATE TABLE IF NOT EXISTS public.lsq_field_history (
  activity_code TEXT NOT NULL,
  schema_name TEXT NOT NULL,
  display_name TEXT,
  fingerprint TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (activity_code, schema_name)
);
ALTER TABLE public.lsq_field_history DISABLE ROW LEVEL SECURITY;
