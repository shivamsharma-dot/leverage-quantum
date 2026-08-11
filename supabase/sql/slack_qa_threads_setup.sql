-- One row per Slack thread the @pm_analyst Overall Q&A bot has replied in
-- (api/send-report.mjs, handleSlackAppMention / handleSlackFollowup). Exists so
-- a follow-up reply typed in the SAME thread -- without re-@-mentioning the bot
-- -- can be answered with the prior exchange as context, instead of either
-- being ignored (no thread memory) or the bot answering every message in the
-- channel (no way to tell "is this a thread we're already in").
--
-- turns is a small rolling JSON array [{q, a}, ...], capped client-side at the
-- last 6 exchanges -- enough context for a follow-up, not an unbounded log.
--
-- Run this once in the Supabase SQL editor before follow-up replies are turned
-- on (see the 3-step Slack config: message.groups scope + reinstall, then the
-- Event Subscription). Writes are service-role only (server-side); nothing here
-- is ever read from the client, so RLS is disabled to match every other table
-- this app's service-role key writes to.

CREATE TABLE IF NOT EXISTS public.slack_qa_threads (
  channel TEXT NOT NULL,
  thread_ts TEXT NOT NULL,
  turns JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (channel, thread_ts)
);

ALTER TABLE public.slack_qa_threads DISABLE ROW LEVEL SECURITY;
