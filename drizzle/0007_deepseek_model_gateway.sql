-- Governed external-model invocation ledger. Raw prompts, responses and credentials are never persisted.

CREATE TABLE IF NOT EXISTS ai_model_invocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  task_id uuid REFERENCES ai_task_runs(id) ON DELETE SET NULL,
  node_id varchar(128),
  user_id varchar(36) REFERENCES users(id) ON DELETE SET NULL,
  trace_id varchar(64) NOT NULL,
  provider varchar(64) NOT NULL,
  model varchar(160) NOT NULL,
  purpose varchar(80) NOT NULL,
  route_mode varchar(32) NOT NULL CHECK (route_mode IN ('external_preferred', 'hybrid_fail_closed')),
  status varchar(20) NOT NULL CHECK (status IN ('RUNNING', 'SUCCEEDED', 'FAILED', 'BLOCKED')),
  prompt_hash varchar(64) NOT NULL,
  prompt_message_count integer NOT NULL CHECK (prompt_message_count > 0),
  prompt_characters integer NOT NULL CHECK (prompt_characters >= 0),
  response_hash varchar(64),
  response_characters integer CHECK (response_characters IS NULL OR response_characters >= 0),
  prompt_tokens integer CHECK (prompt_tokens IS NULL OR prompt_tokens >= 0),
  completion_tokens integer CHECK (completion_tokens IS NULL OR completion_tokens >= 0),
  total_tokens integer CHECK (total_tokens IS NULL OR total_tokens >= 0),
  cache_hit_tokens integer CHECK (cache_hit_tokens IS NULL OR cache_hit_tokens >= 0),
  estimated_cost_cents numeric(14,6) CHECK (estimated_cost_cents IS NULL OR estimated_cost_cents >= 0),
  latency_ms integer CHECK (latency_ms IS NULL OR latency_ms >= 0),
  provider_request_id varchar(200),
  finish_reason varchar(80),
  error_code varchar(100),
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_model_invocations_school_started_idx
  ON ai_model_invocations (school_id, started_at DESC);
CREATE INDEX IF NOT EXISTS ai_model_invocations_task_started_idx
  ON ai_model_invocations (task_id, started_at) WHERE task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ai_model_invocations_usage_idx
  ON ai_model_invocations (school_id, status, started_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS ai_model_invocations_trace_idx
  ON ai_model_invocations (school_id, trace_id);

ALTER TABLE public.ai_model_invocations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ai_model_invocations FROM PUBLIC;
REVOKE ALL ON TABLE public.ai_model_invocations FROM anon;
REVOKE ALL ON TABLE public.ai_model_invocations FROM authenticated;
