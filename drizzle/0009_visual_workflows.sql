-- Governed visual workflow orchestration: immutable definitions, runs and durable handoff events.
-- Workflow definitions contain only allow-listed business Skill references; arbitrary code is never executed.

CREATE TABLE IF NOT EXISTS ai_workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  slug varchar(140) NOT NULL,
  name varchar(220) NOT NULL,
  description text NOT NULL DEFAULT '',
  status varchar(24) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PUBLISHED','ARCHIVED')),
  trigger_kind varchar(24) NOT NULL DEFAULT 'MANUAL' CHECK (trigger_kind IN ('MANUAL','SCHEDULED','EVENT')),
  current_version integer NOT NULL DEFAULT 0 CHECK (current_version >= 0),
  visibility_roles text[] NOT NULL DEFAULT ARRAY[]::text[],
  tags text[] NOT NULL DEFAULT ARRAY[]::text[],
  owner_user_id varchar(36) REFERENCES users(id) ON DELETE SET NULL,
  last_run_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, slug)
);

CREATE TABLE IF NOT EXISTS ai_workflow_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  workflow_id uuid NOT NULL REFERENCES ai_workflows(id) ON DELETE CASCADE,
  version_no integer NOT NULL CHECK (version_no > 0),
  definition jsonb NOT NULL,
  checksum varchar(64) NOT NULL,
  status varchar(24) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PUBLISHED','SUPERSEDED')),
  created_by varchar(36) REFERENCES users(id) ON DELETE SET NULL,
  published_by varchar(36) REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  UNIQUE (workflow_id, version_no),
  UNIQUE (workflow_id, checksum)
);
CREATE INDEX IF NOT EXISTS ai_workflow_versions_lookup_idx ON ai_workflow_versions (school_id, workflow_id, version_no DESC);

CREATE TABLE IF NOT EXISTS ai_workflow_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  workflow_id uuid NOT NULL REFERENCES ai_workflows(id) ON DELETE CASCADE,
  workflow_version_id uuid NOT NULL REFERENCES ai_workflow_versions(id) ON DELETE RESTRICT,
  task_id uuid REFERENCES ai_task_runs(id) ON DELETE SET NULL,
  triggered_by varchar(36) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status varchar(32) NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED','RUNNING','AWAITING_APPROVAL','COMPLETED','FAILED','CANCELLED')),
  input_hash varchar(64) NOT NULL,
  output_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_workflow_runs_school_created_idx ON ai_workflow_runs (school_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_workflow_runs_workflow_idx ON ai_workflow_runs (school_id, workflow_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ai_workflow_run_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  run_id uuid NOT NULL REFERENCES ai_workflow_runs(id) ON DELETE CASCADE,
  seq integer NOT NULL CHECK (seq > 0),
  event_type varchar(64) NOT NULL,
  node_id varchar(140),
  agent_id varchar(160),
  title varchar(220) NOT NULL,
  message text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  payload_hash varchar(64) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, seq)
);
CREATE INDEX IF NOT EXISTS ai_workflow_run_events_stream_idx ON ai_workflow_run_events (school_id, run_id, seq);

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['ai_workflows','ai_workflow_versions','ai_workflow_runs','ai_workflow_run_events'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL ON TABLE %I FROM PUBLIC, anon, authenticated', table_name);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE %I TO service_role', table_name);
    END IF;
  END LOOP;
END $$;
