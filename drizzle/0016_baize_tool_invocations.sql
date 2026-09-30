-- Assistant tool audit only: no business payloads or model prompt text is stored here.
CREATE TABLE IF NOT EXISTS baize_tool_invocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  user_id varchar(36) NOT NULL,
  conversation_id uuid NOT NULL,
  tool_name varchar(80) NOT NULL,
  domain varchar(40) NOT NULL,
  step_index smallint NOT NULL CHECK (step_index BETWEEN 1 AND 5),
  args_hash varchar(64) NOT NULL,
  status varchar(20) NOT NULL CHECK (status IN ('SUCCEEDED','FAILED','DENIED')),
  error_code varchar(40),
  record_count integer CHECK (record_count IS NULL OR record_count >= 0),
  latency_ms integer NOT NULL CHECK (latency_ms >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (school_id,user_id,conversation_id) REFERENCES baize_conversations(school_id,user_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS baize_tool_invocations_owner_recent_idx
  ON baize_tool_invocations(school_id,user_id,conversation_id,created_at DESC);
ALTER TABLE baize_tool_invocations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON baize_tool_invocations FROM PUBLIC;
