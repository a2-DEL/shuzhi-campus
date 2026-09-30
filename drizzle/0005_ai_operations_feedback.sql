-- AI operations administration, runtime settings and human feedback loop.
-- The operator role is tenant-scoped and never exposes provider secrets to clients.

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_code_check;
ALTER TABLE users ADD CONSTRAINT users_role_code_check CHECK (role IN (
  'super_admin', 'ai_ops_admin', 'dept_admin', 'dept_hygiene_manager', 'dept_hygiene_admin',
  'counselor', 'teacher', 'logistics_manager', 'logistics_admin', 'repairman',
  'dorm_manager', 'dorm_keeper', 'student', 'class_committee'
)) NOT VALID;

ALTER TABLE user_role_assignments DROP CONSTRAINT IF EXISTS user_role_assignments_role_check;
ALTER TABLE user_role_assignments ADD CONSTRAINT user_role_assignments_role_check CHECK (role IN (
  'super_admin', 'ai_ops_admin', 'dept_admin', 'dept_hygiene_manager', 'dept_hygiene_admin',
  'counselor', 'teacher', 'logistics_manager', 'logistics_admin', 'repairman',
  'dorm_manager', 'dorm_keeper', 'student', 'class_committee'
)) NOT VALID;

ALTER TABLE ai_task_runs DROP CONSTRAINT IF EXISTS ai_task_runs_owner_role_check;
ALTER TABLE ai_task_runs ADD CONSTRAINT ai_task_runs_owner_role_check CHECK (owner_role IN (
  'super_admin', 'ai_ops_admin', 'dept_admin', 'dept_hygiene_manager', 'dept_hygiene_admin',
  'counselor', 'teacher', 'logistics_manager', 'logistics_admin', 'repairman',
  'dorm_manager', 'dorm_keeper', 'student', 'class_committee'
)) NOT VALID;

DROP POLICY IF EXISTS users_tenant_self_or_admin_read ON users;
CREATE POLICY users_tenant_self_or_admin_read ON users FOR SELECT TO authenticated
USING (
  school_id::text = app_request_claim('school_id')
  AND (
    id = app_request_claim('sub')
    OR app_has_role('super_admin')
    OR app_has_role('ai_ops_admin')
    OR app_has_role('dept_admin')
  )
);

DROP POLICY IF EXISTS role_assignments_self_or_admin_read ON user_role_assignments;
CREATE POLICY role_assignments_self_or_admin_read ON user_role_assignments FOR SELECT TO authenticated
USING (
  school_id::text = app_request_claim('school_id')
  AND (
    user_id = app_request_claim('sub')
    OR app_has_role('super_admin')
    OR app_has_role('ai_ops_admin')
    OR app_has_role('dept_admin')
  )
);

CREATE TABLE IF NOT EXISTS ai_runtime_settings (
  school_id uuid PRIMARY KEY REFERENCES schools(id) ON DELETE RESTRICT,
  route_mode varchar(32) NOT NULL DEFAULT 'local_governed' CHECK (route_mode IN ('local_governed', 'external_preferred', 'hybrid_fail_closed')),
  primary_provider varchar(64),
  fallback_provider varchar(64),
  max_model_calls integer NOT NULL DEFAULT 24 CHECK (max_model_calls BETWEEN 1 AND 1000),
  daily_budget_cents integer NOT NULL DEFAULT 0 CHECK (daily_budget_cents >= 0),
  updated_by varchar(36) REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_runtime_settings_updated_idx ON ai_runtime_settings (updated_at DESC);

INSERT INTO ai_runtime_settings (school_id)
SELECT id FROM schools
ON CONFLICT (school_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS ai_feedback_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  task_id uuid NOT NULL REFERENCES ai_task_runs(id) ON DELETE CASCADE,
  user_id varchar(36) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  outcome varchar(24) NOT NULL DEFAULT 'needs_follow_up' CHECK (outcome IN ('helpful', 'needs_follow_up', 'unsafe', 'incorrect')),
  comment text,
  status varchar(20) NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewed', 'applied', 'dismissed')),
  reviewed_by varchar(36) REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, task_id, user_id)
);
CREATE INDEX IF NOT EXISTS ai_feedback_events_school_created_idx ON ai_feedback_events (school_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_feedback_events_status_idx ON ai_feedback_events (school_id, status, created_at DESC);

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['ai_runtime_settings', 'ai_feedback_events']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', table_name);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', table_name);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM authenticated', table_name);
  END LOOP;
END
$$;
