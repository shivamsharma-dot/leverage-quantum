-- Backs the "sign in with email" magic-link flow (api/auth.mjs, actions
-- magic-request / magic-verify), added alongside the existing Google OAuth
-- login. Only ever read/written server-side with the service-role key
-- (supabaseAdmin()) -- never exposed to the anon client, unlike most other
-- app_preferences-style tables in this app, since even a hashed token is
-- worth keeping off the public REST surface.
--
-- token_hash is a SHA-256 hex digest of the real one-time token; the raw
-- token itself is never stored anywhere, only emailed to the user.
-- allowed_users remains the single access gate -- a magic link is only ever
-- emailed to an address that already has a row there (see api/auth.mjs).
--
-- Run this once in the Supabase SQL editor before the feature goes live.

CREATE TABLE IF NOT EXISTS public.magic_login_tokens (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_magic_login_tokens_hash ON public.magic_login_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_magic_login_tokens_email_created ON public.magic_login_tokens(email, created_at DESC);

ALTER TABLE public.magic_login_tokens DISABLE ROW LEVEL SECURITY;
