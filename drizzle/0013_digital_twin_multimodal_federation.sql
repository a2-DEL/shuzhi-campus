-- Digital twin and multimodal federation control plane.
-- Twin projections are reproducible decision support; federation exchanges signed aggregates only.

CREATE TABLE IF NOT EXISTS ai_twin_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  slug varchar(140) NOT NULL,
  name varchar(220) NOT NULL,
  description text NOT NULL DEFAULT '',
  scope_type varchar(32) NOT NULL DEFAULT 'CAMPUS' CHECK (scope_type IN ('CAMPUS','BUILDING','DOMAIN')),
  scope_id varchar(180),
  status varchar(24) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('DRAFT','ACTIVE','ARCHIVED')),
  model_version varchar(80) NOT NULL,
  topology jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by varchar(36) REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id,slug)
);

CREATE TABLE IF NOT EXISTS ai_twin_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  model_id uuid NOT NULL REFERENCES ai_twin_models(id) ON DELETE CASCADE,
  observed_at timestamptz NOT NULL,
  source_watermark timestamptz NOT NULL,
  metrics jsonb NOT NULL,
  topology jsonb NOT NULL,
  data_quality_score numeric(8,5) NOT NULL CHECK (data_quality_score BETWEEN 0 AND 1),
  evidence_hash varchar(64) NOT NULL,
  source_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by varchar(36) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_twin_snapshots_model_idx ON ai_twin_snapshots(school_id,model_id,observed_at DESC);

CREATE TABLE IF NOT EXISTS ai_twin_scenarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  model_id uuid NOT NULL REFERENCES ai_twin_models(id) ON DELETE CASCADE,
  base_snapshot_id uuid NOT NULL REFERENCES ai_twin_snapshots(id) ON DELETE RESTRICT,
  name varchar(220) NOT NULL,
  hypothesis text NOT NULL,
  interventions jsonb NOT NULL,
  status varchar(24) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','RUNNING','COMPLETED','FAILED','ARCHIVED')),
  created_by varchar(36) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_twin_scenarios_model_idx ON ai_twin_scenarios(school_id,model_id,updated_at DESC);

CREATE TABLE IF NOT EXISTS ai_twin_simulation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  scenario_id uuid NOT NULL REFERENCES ai_twin_scenarios(id) ON DELETE CASCADE,
  status varchar(24) NOT NULL CHECK (status IN ('RUNNING','COMPLETED','FAILED')),
  engine_version varchar(80) NOT NULL,
  baseline_metrics jsonb NOT NULL,
  projected_metrics jsonb NOT NULL,
  deltas jsonb NOT NULL,
  assumptions jsonb NOT NULL,
  confidence numeric(8,5) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  evidence_hash varchar(64),
  executed_by varchar(36) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS ai_twin_runs_scenario_idx ON ai_twin_simulation_runs(school_id,scenario_id,started_at DESC);

CREATE TABLE IF NOT EXISTS ai_twin_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  run_id uuid NOT NULL REFERENCES ai_twin_simulation_runs(id) ON DELETE CASCADE,
  recommendation_type varchar(48) NOT NULL,
  title varchar(220) NOT NULL,
  summary text NOT NULL,
  expected_impact jsonb NOT NULL,
  status varchar(24) NOT NULL DEFAULT 'PROPOSED' CHECK (status IN ('PROPOSED','DISPATCHED','ACCEPTED','DISMISSED')),
  task_id uuid REFERENCES ai_task_runs(id) ON DELETE SET NULL,
  decided_by varchar(36) REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_twin_recommendations_run_idx ON ai_twin_recommendations(school_id,run_id,status);

CREATE TABLE IF NOT EXISTS ai_multimodal_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  object_key text NOT NULL,
  original_name varchar(260) NOT NULL,
  modality varchar(24) NOT NULL CHECK (modality IN ('IMAGE','AUDIO','DOCUMENT','VIDEO')),
  content_type varchar(160) NOT NULL,
  byte_size bigint NOT NULL CHECK (byte_size > 0),
  sha256 varchar(64) NOT NULL,
  sensitivity varchar(24) NOT NULL DEFAULT 'INTERNAL' CHECK (sensitivity IN ('PUBLIC','INTERNAL','RESTRICTED','CONFIDENTIAL')),
  consent_basis varchar(80) NOT NULL,
  status varchar(24) NOT NULL DEFAULT 'UPLOADED' CHECK (status IN ('UPLOADED','INSPECTED','VERIFIED','REJECTED')),
  technical_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by varchar(36) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id,object_key),
  UNIQUE (school_id,sha256)
);
CREATE INDEX IF NOT EXISTS ai_multimodal_assets_school_idx ON ai_multimodal_assets(school_id,status,created_at DESC);

CREATE TABLE IF NOT EXISTS ai_multimodal_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  asset_id uuid NOT NULL REFERENCES ai_multimodal_assets(id) ON DELETE CASCADE,
  observation_type varchar(48) NOT NULL,
  label varchar(220) NOT NULL,
  summary text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence numeric(8,5) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  extraction_mode varchar(48) NOT NULL,
  evidence_hash varchar(64) NOT NULL,
  status varchar(24) NOT NULL DEFAULT 'CANDIDATE' CHECK (status IN ('CANDIDATE','VERIFIED','REJECTED')),
  reviewed_by varchar(36) REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_multimodal_observations_asset_idx ON ai_multimodal_observations(school_id,asset_id,status);

CREATE TABLE IF NOT EXISTS ai_federation_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  slug varchar(140) NOT NULL,
  name varchar(220) NOT NULL,
  node_kind varchar(24) NOT NULL CHECK (node_kind IN ('LOCAL','SANDBOX','REMOTE')),
  transport varchar(32) NOT NULL CHECK (transport IN ('LOCAL_ADAPTER','SANDBOX_ADAPTER','REMOTE_HTTPS')),
  endpoint text,
  public_key text NOT NULL,
  public_key_fingerprint varchar(64) NOT NULL,
  capabilities jsonb NOT NULL DEFAULT '[]'::jsonb,
  privacy_policy jsonb NOT NULL,
  status varchar(24) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('DRAFT','ACTIVE','DEGRADED','SUSPENDED')),
  last_heartbeat_at timestamptz,
  created_by varchar(36) REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id,slug)
);

CREATE TABLE IF NOT EXISTS ai_federation_sandbox_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  node_id uuid NOT NULL REFERENCES ai_federation_nodes(id) ON DELETE CASCADE,
  modality varchar(24) NOT NULL CHECK (modality IN ('IMAGE','AUDIO','DOCUMENT','VIDEO','BUSINESS_METRIC')),
  metric varchar(100) NOT NULL,
  value numeric(14,4) NOT NULL,
  quality varchar(16) NOT NULL DEFAULT 'valid' CHECK (quality IN ('valid','suspect','invalid')),
  observed_at timestamptz NOT NULL,
  synthetic boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS ai_federation_sandbox_records_node_idx ON ai_federation_sandbox_records(school_id,node_id,metric,observed_at DESC);

CREATE TABLE IF NOT EXISTS ai_federation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  name varchar(220) NOT NULL,
  job_type varchar(48) NOT NULL CHECK (job_type IN ('MULTIMODAL_METRICS','CAMPUS_RISK_AGGREGATION','RETRIEVAL_TELEMETRY')),
  query_hash varchar(64) NOT NULL,
  requested_modalities text[] NOT NULL DEFAULT ARRAY[]::text[],
  minimum_group_size integer NOT NULL DEFAULT 5 CHECK (minimum_group_size BETWEEN 3 AND 1000),
  epsilon_budget numeric(8,4) NOT NULL CHECK (epsilon_budget > 0 AND epsilon_budget <= 10),
  status varchar(24) NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED','RUNNING','COMPLETED','PARTIAL','FAILED','BLOCKED')),
  aggregate_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  result_hash varchar(64),
  initiated_by varchar(36) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_federation_jobs_school_idx ON ai_federation_jobs(school_id,created_at DESC);

CREATE TABLE IF NOT EXISTS ai_federation_contributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  job_id uuid NOT NULL REFERENCES ai_federation_jobs(id) ON DELETE CASCADE,
  node_id uuid NOT NULL REFERENCES ai_federation_nodes(id) ON DELETE RESTRICT,
  status varchar(24) NOT NULL CHECK (status IN ('ACCEPTED','REJECTED','BELOW_THRESHOLD','FAILED')),
  record_count integer NOT NULL DEFAULT 0 CHECK (record_count >= 0),
  aggregate_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  payload_hash varchar(64) NOT NULL,
  signature text,
  signature_verified boolean NOT NULL DEFAULT false,
  epsilon_spent numeric(8,4) NOT NULL DEFAULT 0 CHECK (epsilon_spent >= 0),
  latency_ms integer NOT NULL DEFAULT 0 CHECK (latency_ms >= 0),
  error_code varchar(80),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(job_id,node_id)
);

CREATE TABLE IF NOT EXISTS ai_federation_privacy_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  node_id uuid NOT NULL REFERENCES ai_federation_nodes(id) ON DELETE RESTRICT,
  job_id uuid NOT NULL REFERENCES ai_federation_jobs(id) ON DELETE CASCADE,
  purpose varchar(220) NOT NULL,
  epsilon_spent numeric(8,4) NOT NULL CHECK (epsilon_spent > 0),
  approved_by varchar(36) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(node_id,job_id)
);
CREATE INDEX IF NOT EXISTS ai_federation_privacy_node_idx ON ai_federation_privacy_ledger(school_id,node_id,created_at DESC);

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'ai_twin_models','ai_twin_snapshots','ai_twin_scenarios','ai_twin_simulation_runs','ai_twin_recommendations',
    'ai_multimodal_assets','ai_multimodal_observations','ai_federation_nodes','ai_federation_sandbox_records',
    'ai_federation_jobs','ai_federation_contributions','ai_federation_privacy_ledger'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('REVOKE ALL ON TABLE %I FROM PUBLIC, anon, authenticated',table_name);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE %I TO service_role',table_name);
    END IF;
  END LOOP;
END $$;
