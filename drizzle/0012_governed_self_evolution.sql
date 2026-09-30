-- Governed self-evolution: observed signals, benchmark datasets, candidate experiments, eval evidence and human-approved releases.
-- No model or Agent may self-publish; activation and rollback require an authenticated operations administrator.

CREATE TABLE IF NOT EXISTS ai_evolution_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  source_type varchar(40) NOT NULL CHECK (source_type IN ('FEEDBACK','MODEL_INVOCATION','RETRIEVAL','TASK','MANUAL')),
  source_id varchar(180) NOT NULL,
  signal_type varchar(48) NOT NULL CHECK (signal_type IN ('NEGATIVE_FEEDBACK','MODEL_FAILURE','RETRIEVAL_REFUSAL','TASK_FAILURE','LATENCY_REGRESSION','MANUAL')),
  severity varchar(16) NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  status varchar(24) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','LINKED','RESOLVED','DISMISSED')),
  summary text NOT NULL,
  evidence_hash varchar(64) NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id,source_type,source_id,signal_type)
);
CREATE INDEX IF NOT EXISTS ai_evolution_signals_school_status_idx ON ai_evolution_signals (school_id,status,severity,created_at DESC);

CREATE TABLE IF NOT EXISTS ai_evolution_datasets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  slug varchar(140) NOT NULL,
  name varchar(220) NOT NULL,
  description text NOT NULL DEFAULT '',
  target_type varchar(32) NOT NULL CHECK (target_type IN ('RETRIEVAL','SKILL','WORKFLOW','PROMPT')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  status varchar(24) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('DRAFT','ACTIVE','ARCHIVED')),
  created_by varchar(36) REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id,slug,version)
);

CREATE TABLE IF NOT EXISTS ai_evolution_eval_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  dataset_id uuid NOT NULL REFERENCES ai_evolution_datasets(id) ON DELETE CASCADE,
  case_key varchar(140) NOT NULL,
  title varchar(220) NOT NULL,
  input jsonb NOT NULL,
  expected jsonb NOT NULL,
  risk_level varchar(16) NOT NULL DEFAULT 'low' CHECK (risk_level IN ('low','medium','high','critical')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dataset_id,case_key)
);
CREATE INDEX IF NOT EXISTS ai_evolution_eval_cases_dataset_idx ON ai_evolution_eval_cases (school_id,dataset_id,active);

CREATE TABLE IF NOT EXISTS ai_evolution_experiments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  signal_id uuid REFERENCES ai_evolution_signals(id) ON DELETE SET NULL,
  dataset_id uuid NOT NULL REFERENCES ai_evolution_datasets(id) ON DELETE RESTRICT,
  target_type varchar(32) NOT NULL CHECK (target_type IN ('RETRIEVAL','SKILL','WORKFLOW','PROMPT')),
  target_id varchar(180) NOT NULL,
  baseline_version varchar(80) NOT NULL,
  candidate_version varchar(80) NOT NULL,
  hypothesis text NOT NULL,
  change_summary text NOT NULL,
  baseline_config jsonb NOT NULL,
  candidate_config jsonb NOT NULL,
  status varchar(32) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','EVALUATING','READY_FOR_REVIEW','APPROVED','REJECTED','ROLLED_BACK')),
  created_by varchar(36) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reviewed_by varchar(36) REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id,target_id,candidate_version)
);
CREATE INDEX IF NOT EXISTS ai_evolution_experiments_school_status_idx ON ai_evolution_experiments (school_id,status,created_at DESC);

CREATE TABLE IF NOT EXISTS ai_evolution_eval_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  experiment_id uuid NOT NULL REFERENCES ai_evolution_experiments(id) ON DELETE CASCADE,
  dataset_id uuid NOT NULL REFERENCES ai_evolution_datasets(id) ON DELETE RESTRICT,
  status varchar(24) NOT NULL CHECK (status IN ('RUNNING','PASSED','FAILED','BLOCKED')),
  case_count integer NOT NULL DEFAULT 0 CHECK (case_count >= 0),
  passed_cases integer NOT NULL DEFAULT 0 CHECK (passed_cases >= 0),
  baseline_score numeric(8,5),
  candidate_score numeric(8,5),
  safety_score numeric(8,5),
  latency_delta_ms integer,
  cost_delta_ratio numeric(8,5),
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence_hash varchar(64),
  executed_by varchar(36) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS ai_evolution_eval_runs_experiment_idx ON ai_evolution_eval_runs (school_id,experiment_id,started_at DESC);

CREATE TABLE IF NOT EXISTS ai_evolution_releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  experiment_id uuid NOT NULL REFERENCES ai_evolution_experiments(id) ON DELETE RESTRICT,
  target_type varchar(32) NOT NULL,
  target_id varchar(180) NOT NULL,
  version varchar(80) NOT NULL,
  status varchar(24) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ROLLED_BACK')),
  release_notes text NOT NULL,
  config jsonb NOT NULL,
  activated_by varchar(36) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  activated_at timestamptz NOT NULL DEFAULT now(),
  rolled_back_by varchar(36) REFERENCES users(id) ON DELETE SET NULL,
  rolled_back_at timestamptz,
  UNIQUE (school_id,target_id,version)
);
CREATE UNIQUE INDEX IF NOT EXISTS ai_evolution_releases_active_target_idx ON ai_evolution_releases (school_id,target_id) WHERE status='ACTIVE';

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['ai_evolution_signals','ai_evolution_datasets','ai_evolution_eval_cases','ai_evolution_experiments','ai_evolution_eval_runs','ai_evolution_releases'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('REVOKE ALL ON TABLE %I FROM PUBLIC, anon, authenticated',table_name);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE %I TO service_role',table_name);
    END IF;
  END LOOP;
END $$;
