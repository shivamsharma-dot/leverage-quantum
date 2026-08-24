-- Adds bookkeeping columns for the 5th Team Mapping connector -- Frapp
-- "coaches" push (see team_mapping_ls_detail_cache_setup.sql for why this
-- needed a cache table first, and api/crm-leads.js's team_frapp_push for the
-- actual push logic).
--
-- Deliberately NOT storing the Frapp API key here, unlike the read-only pull
-- connector's api_key column on this same table. That key is Quantum's OWN,
-- minted for others to read FROM Quantum -- low blast radius if it ever
-- leaked (read-only access to an internal roster). The Frapp key is the
-- OPPOSITE direction: a third party's own production credential that lets
-- whoever holds it WRITE into Frapp's coach directory. It goes in Vercel env
-- (FRAPP_COACHES_API_KEY), same convention as every other third-party
-- secret in this app (BigQuery, Meta, Google Ads, Slack bot token, ...).
-- This migration only adds the enabled flag + last-run status/count, exactly
-- the kind of non-secret bookkeeping webhook_last_status/sheet_last_status
-- already are on this same table.

ALTER TABLE public.team_mapping_connectors
  ADD COLUMN IF NOT EXISTS frapp_enabled    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS frapp_last_status TEXT,
  ADD COLUMN IF NOT EXISTS frapp_last_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS frapp_last_count  INTEGER;
