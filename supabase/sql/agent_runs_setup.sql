-- Phase 1 of the agent-upgrade roadmap: durable "artifacts" produced by autonomous
-- scheduled agents (api/ask-ai.js's handleAgentRun, mode:'agent_run'), read by the
-- new Agents page (src/pages/AgentsDashboard.jsx).
--
-- Run this once in the Supabase SQL editor before the first agent run (scheduled
-- or manual "Run now") -- writes are service-role only (server-side), reads are
-- anon-key from the frontend, same pattern as report_logs/source_health/ask_ai_*.

CREATE TABLE IF NOT EXISTS public.agent_runs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  agent_id TEXT NOT NULL,
  title TEXT,
  summary TEXT,
  content TEXT,
  status TEXT NOT NULL DEFAULT 'ok',
  error TEXT,
  tool_calls_count INT DEFAULT 0,
  triggered_by TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_runs_created ON public.agent_runs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_runs_agent ON public.agent_runs(agent_id);

ALTER TABLE public.agent_runs DISABLE ROW LEVEL SECURITY;
