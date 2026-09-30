-- Declarative plugin and MCP control plane. No uploaded executable code or raw credentials are persisted.

CREATE TABLE IF NOT EXISTS ai_plugins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  slug varchar(140) NOT NULL,
  name varchar(220) NOT NULL,
  description text NOT NULL DEFAULT '',
  publisher varchar(180) NOT NULL,
  status varchar(24) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PUBLISHED','DISABLED','ARCHIVED')),
  trust_level varchar(24) NOT NULL DEFAULT 'INTERNAL' CHECK (trust_level IN ('INTERNAL','VERIFIED','RESTRICTED')),
  current_version integer NOT NULL DEFAULT 0 CHECK (current_version >= 0),
  created_by varchar(36) REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, slug)
);

CREATE TABLE IF NOT EXISTS ai_plugin_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  plugin_id uuid NOT NULL REFERENCES ai_plugins(id) ON DELETE CASCADE,
  version_no integer NOT NULL CHECK (version_no > 0),
  manifest jsonb NOT NULL,
  checksum varchar(64) NOT NULL,
  status varchar(24) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PUBLISHED','SUPERSEDED')),
  created_by varchar(36) REFERENCES users(id) ON DELETE SET NULL,
  published_by varchar(36) REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  UNIQUE (plugin_id, version_no),
  UNIQUE (plugin_id, checksum)
);
CREATE INDEX IF NOT EXISTS ai_plugin_versions_lookup_idx ON ai_plugin_versions (school_id,plugin_id,version_no DESC);

CREATE TABLE IF NOT EXISTS ai_mcp_servers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  slug varchar(140) NOT NULL,
  name varchar(220) NOT NULL,
  description text NOT NULL DEFAULT '',
  endpoint text NOT NULL,
  transport varchar(32) NOT NULL DEFAULT 'STREAMABLE_HTTP' CHECK (transport IN ('STREAMABLE_HTTP','SSE')),
  auth_mode varchar(24) NOT NULL DEFAULT 'NONE' CHECK (auth_mode IN ('NONE','BEARER_ENV')),
  credential_ref varchar(120),
  status varchar(24) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ACTIVE','DEGRADED','DISABLED')),
  trust_level varchar(24) NOT NULL DEFAULT 'INTERNAL' CHECK (trust_level IN ('INTERNAL','VERIFIED','RESTRICTED')),
  protocol_version varchar(32),
  server_info jsonb NOT NULL DEFAULT '{}'::jsonb,
  config_hash varchar(64) NOT NULL,
  last_probe_at timestamptz,
  last_latency_ms integer CHECK (last_latency_ms IS NULL OR last_latency_ms >= 0),
  last_error_code varchar(80),
  created_by varchar(36) REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, slug)
);

CREATE TABLE IF NOT EXISTS ai_mcp_tools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  server_id uuid NOT NULL REFERENCES ai_mcp_servers(id) ON DELETE CASCADE,
  tool_name varchar(180) NOT NULL,
  title varchar(220) NOT NULL,
  description text NOT NULL DEFAULT '',
  input_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  risk_level varchar(16) NOT NULL DEFAULT 'medium' CHECK (risk_level IN ('low','medium','high','critical')),
  status varchar(24) NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE','REVIEW_REQUIRED','DISABLED')),
  discovered_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (server_id, tool_name)
);
CREATE INDEX IF NOT EXISTS ai_mcp_tools_server_idx ON ai_mcp_tools (school_id,server_id,status,tool_name);

CREATE TABLE IF NOT EXISTS ai_mcp_probe_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  server_id uuid NOT NULL REFERENCES ai_mcp_servers(id) ON DELETE CASCADE,
  status varchar(24) NOT NULL CHECK (status IN ('SUCCEEDED','FAILED')),
  latency_ms integer NOT NULL CHECK (latency_ms >= 0),
  tool_count integer NOT NULL DEFAULT 0 CHECK (tool_count >= 0),
  response_hash varchar(64),
  error_code varchar(80),
  probed_by varchar(36) REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_mcp_probe_runs_server_idx ON ai_mcp_probe_runs (school_id,server_id,created_at DESC);

CREATE TABLE IF NOT EXISTS ai_mcp_invocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  server_id uuid NOT NULL REFERENCES ai_mcp_servers(id) ON DELETE RESTRICT,
  tool_id uuid NOT NULL REFERENCES ai_mcp_tools(id) ON DELETE RESTRICT,
  invoked_by varchar(36) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status varchar(24) NOT NULL CHECK (status IN ('SUCCEEDED','FAILED','BLOCKED')),
  arguments_hash varchar(64) NOT NULL,
  result_hash varchar(64),
  latency_ms integer NOT NULL CHECK (latency_ms >= 0),
  error_code varchar(80),
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_mcp_invocations_school_created_idx ON ai_mcp_invocations (school_id,created_at DESC);

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['ai_plugins','ai_plugin_versions','ai_mcp_servers','ai_mcp_tools','ai_mcp_probe_runs','ai_mcp_invocations'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL ON TABLE %I FROM PUBLIC, anon, authenticated', table_name);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE %I TO service_role', table_name);
    END IF;
  END LOOP;
END $$;
