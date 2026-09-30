-- Durable Agent OS runtime, optimistic concurrency, recovery leases and transactional outbox.
-- All writes are service-side only. Anonymous and authenticated database roles receive no direct table access.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS ai_task_runs (
  id uuid PRIMARY KEY,
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  owner_user_id varchar(36) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  owner_user_name varchar(128) NOT NULL,
  owner_role varchar(50) NOT NULL CHECK (owner_role IN (
    'super_admin', 'dept_admin', 'dept_hygiene_manager', 'dept_hygiene_admin',
    'counselor', 'teacher', 'logistics_manager', 'logistics_admin', 'repairman',
    'dorm_manager', 'dorm_keeper', 'student', 'class_committee'
  )),
  idempotency_key varchar(160) NOT NULL,
  title varchar(255) NOT NULL,
  command text NOT NULL,
  state varchar(32) NOT NULL CHECK (state IN (
    'RECEIVED', 'AUTHENTICATED', 'CLASSIFIED', 'CONTEXT_BUILT', 'PLANNED',
    'PLAN_VALIDATED', 'POLICY_CHECKED', 'PREVIEWED', 'AWAITING_APPROVAL',
    'QUEUED', 'RUNNING', 'OBSERVING', 'REPLANNING', 'VERIFYING', 'COMPLETED',
    'PARTIAL', 'FAILED', 'CANCELLED', 'COMPENSATED'
  )),
  mode varchar(20) NOT NULL CHECK (mode IN ('question', 'advice', 'execute')),
  skill_id varchar(100) NOT NULL,
  risk_level varchar(16) NOT NULL CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  approval_policy varchar(24) NOT NULL CHECK (approval_policy IN ('automatic', 'single_approval', 'dual_approval')),
  intent jsonb NOT NULL,
  plan jsonb NOT NULL,
  snapshot jsonb NOT NULL,
  summary text,
  blocker jsonb,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts integer NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 20),
  retry_eligible boolean NOT NULL DEFAULT false,
  next_attempt_at timestamptz,
  dead_lettered_at timestamptz,
  lease_owner varchar(160),
  lease_token uuid,
  lease_expires_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, owner_user_id, idempotency_key),
  CHECK (
    (lease_owner IS NULL AND lease_token IS NULL AND lease_expires_at IS NULL)
    OR (lease_owner IS NOT NULL AND lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS ai_task_runs_owner_created_idx ON ai_task_runs (school_id, owner_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_task_runs_recovery_idx ON ai_task_runs (state, next_attempt_at, lease_expires_at)
  WHERE dead_lettered_at IS NULL AND state IN ('QUEUED', 'RUNNING', 'OBSERVING', 'REPLANNING', 'VERIFYING', 'FAILED');

CREATE TABLE IF NOT EXISTS ai_task_nodes (
  task_id uuid NOT NULL REFERENCES ai_task_runs(id) ON DELETE CASCADE,
  id varchar(128) NOT NULL,
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  agent_id varchar(160) NOT NULL,
  agent_name varchar(160) NOT NULL,
  agent_avatar varchar(64) NOT NULL DEFAULT '',
  title varchar(255) NOT NULL,
  skill_id varchar(100) NOT NULL,
  state varchar(24) NOT NULL CHECK (state IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED', 'BLOCKED')),
  depends_on jsonb NOT NULL DEFAULT '[]'::jsonb,
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  output jsonb,
  error text,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts integer NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 20),
  retry_eligible boolean NOT NULL DEFAULT false,
  next_attempt_at timestamptz,
  lease_owner varchar(160),
  lease_token uuid,
  lease_expires_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  duration_ms integer CHECK (duration_ms IS NULL OR duration_ms >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, id),
  CHECK (
    (lease_owner IS NULL AND lease_token IS NULL AND lease_expires_at IS NULL)
    OR (lease_owner IS NOT NULL AND lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS ai_task_nodes_runnable_idx ON ai_task_nodes (state, next_attempt_at, lease_expires_at)
  WHERE state IN ('PENDING', 'RUNNING', 'FAILED');

CREATE TABLE IF NOT EXISTS ai_task_dependencies (
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  task_id uuid NOT NULL REFERENCES ai_task_runs(id) ON DELETE CASCADE,
  node_id varchar(128) NOT NULL,
  depends_on_node_id varchar(128) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, node_id, depends_on_node_id),
  FOREIGN KEY (task_id, node_id) REFERENCES ai_task_nodes(task_id, id) ON DELETE CASCADE,
  FOREIGN KEY (task_id, depends_on_node_id) REFERENCES ai_task_nodes(task_id, id) ON DELETE CASCADE,
  CHECK (node_id <> depends_on_node_id)
);

CREATE TABLE IF NOT EXISTS ai_task_observations (
  id varchar(160) PRIMARY KEY,
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  task_id uuid NOT NULL REFERENCES ai_task_runs(id) ON DELETE CASCADE,
  node_id varchar(128) NOT NULL,
  kind varchar(32) NOT NULL CHECK (kind IN ('tool_result', 'business_readback', 'error')),
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (task_id, node_id) REFERENCES ai_task_nodes(task_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ai_task_observations_task_idx ON ai_task_observations (task_id, created_at);

CREATE TABLE IF NOT EXISTS ai_agent_messages (
  id varchar(160) PRIMARY KEY,
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  task_id uuid NOT NULL REFERENCES ai_task_runs(id) ON DELETE CASCADE,
  agent_id varchar(160) NOT NULL,
  agent_name varchar(160) NOT NULL,
  agent_avatar varchar(64) NOT NULL DEFAULT '',
  type varchar(32) NOT NULL CHECK (type IN ('chat', 'handover', 'result', 'error', 'approval_request', 'approval_decision')),
  content text NOT NULL,
  data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_agent_messages_task_idx ON ai_agent_messages (task_id, created_at);

CREATE TABLE IF NOT EXISTS ai_approval_requests (
  id uuid PRIMARY KEY,
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  task_id uuid NOT NULL REFERENCES ai_task_runs(id) ON DELETE CASCADE,
  policy varchar(24) NOT NULL CHECK (policy IN ('single_approval', 'dual_approval')),
  status varchar(20) NOT NULL CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED')),
  requested_by varchar(36) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  requested_at timestamptz NOT NULL,
  expires_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (task_id)
);

CREATE TABLE IF NOT EXISTS ai_approval_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  task_id uuid NOT NULL REFERENCES ai_task_runs(id) ON DELETE CASCADE,
  approval_request_id uuid NOT NULL REFERENCES ai_approval_requests(id) ON DELETE CASCADE,
  user_id varchar(36) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  user_name varchar(128) NOT NULL,
  decision varchar(16) NOT NULL CHECK (decision IN ('APPROVED', 'REJECTED')),
  reason text,
  decided_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (approval_request_id, user_id)
);

CREATE TABLE IF NOT EXISTS ai_tool_invocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  task_id uuid NOT NULL REFERENCES ai_task_runs(id) ON DELETE CASCADE,
  node_id varchar(128) NOT NULL,
  skill_id varchar(100) NOT NULL,
  idempotency_key varchar(200) NOT NULL,
  status varchar(24) NOT NULL CHECK (status IN ('PREPARED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED')),
  request jsonb NOT NULL,
  response jsonb,
  error text,
  attempt integer NOT NULL DEFAULT 1 CHECK (attempt > 0),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, idempotency_key),
  FOREIGN KEY (task_id, node_id) REFERENCES ai_task_nodes(task_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ai_business_effects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  task_id uuid NOT NULL REFERENCES ai_task_runs(id) ON DELETE CASCADE,
  node_id varchar(128) NOT NULL,
  effect_type varchar(100) NOT NULL,
  target_type varchar(100) NOT NULL,
  target_id varchar(160),
  idempotency_key varchar(200) NOT NULL,
  status varchar(24) NOT NULL CHECK (status IN ('PREPARED', 'APPLIED', 'VERIFIED', 'FAILED', 'COMPENSATED')),
  before_value jsonb,
  after_value jsonb,
  verification jsonb,
  applied_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, idempotency_key),
  FOREIGN KEY (task_id, node_id) REFERENCES ai_task_nodes(task_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ai_trace_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  task_id uuid NOT NULL REFERENCES ai_task_runs(id) ON DELETE CASCADE,
  node_id varchar(128),
  trace_id varchar(64) NOT NULL,
  span_id varchar(32),
  parent_span_id varchar(32),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_trace_links_trace_idx ON ai_trace_links (trace_id, task_id);

CREATE TABLE IF NOT EXISTS ai_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  task_id uuid REFERENCES ai_task_runs(id) ON DELETE SET NULL,
  node_id varchar(128),
  actor_type varchar(24) NOT NULL CHECK (actor_type IN ('user', 'agent', 'worker', 'system')),
  actor_id varchar(160) NOT NULL,
  event_type varchar(120) NOT NULL,
  before_state varchar(32),
  after_state varchar(32),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  trace_id varchar(64),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_audit_events_task_idx ON ai_audit_events (task_id, created_at);

CREATE TABLE IF NOT EXISTS ai_outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  aggregate_type varchar(80) NOT NULL,
  aggregate_id varchar(160) NOT NULL,
  event_type varchar(120) NOT NULL,
  deduplication_key varchar(220) NOT NULL,
  payload jsonb NOT NULL,
  status varchar(24) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PUBLISHING', 'PUBLISHED', 'FAILED', 'DEAD_LETTER')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts integer NOT NULL DEFAULT 10 CHECK (max_attempts BETWEEN 1 AND 100),
  available_at timestamptz NOT NULL DEFAULT now(),
  lease_owner varchar(160),
  lease_token uuid,
  lease_expires_at timestamptz,
  published_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, aggregate_type, aggregate_id, event_type, deduplication_key),
  CHECK (
    (lease_owner IS NULL AND lease_token IS NULL AND lease_expires_at IS NULL)
    OR (lease_owner IS NOT NULL AND lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS ai_outbox_events_publish_idx ON ai_outbox_events (status, available_at, lease_expires_at)
  WHERE status IN ('PENDING', 'FAILED', 'PUBLISHING');

CREATE OR REPLACE FUNCTION ai_sync_task_projections(
  p_school_id uuid,
  p_task_id uuid,
  p_snapshot jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  approval_record jsonb := p_snapshot -> 'approval';
BEGIN
  DELETE FROM ai_task_dependencies WHERE task_id = p_task_id;
  DELETE FROM ai_task_observations WHERE task_id = p_task_id;
  DELETE FROM ai_agent_messages WHERE task_id = p_task_id;
  DELETE FROM ai_approval_decisions WHERE task_id = p_task_id;
  DELETE FROM ai_approval_requests WHERE task_id = p_task_id;

  INSERT INTO ai_task_nodes (
    task_id, id, school_id, agent_id, agent_name, agent_avatar, title, skill_id,
    state, depends_on, input, output, error, attempt_count, max_attempts,
    next_attempt_at, lease_owner, lease_token, lease_expires_at,
    started_at, completed_at, duration_ms, created_at, updated_at
  )
  SELECT
    p_task_id,
    node ->> 'id',
    p_school_id,
    node ->> 'agentId',
    node ->> 'agentName',
    COALESCE(node ->> 'agentAvatar', ''),
    node ->> 'title',
    node ->> 'skillId',
    node ->> 'state',
    COALESCE(node -> 'dependsOn', '[]'::jsonb),
    COALESCE(node -> 'input', '{}'::jsonb),
    node -> 'output',
    node ->> 'error',
    COALESCE((node ->> 'attemptCount')::integer, 0),
    COALESCE((node ->> 'maxAttempts')::integer, 3),
    NULLIF(node ->> 'nextAttemptAt', '')::timestamptz,
    NULLIF(node ->> 'leaseOwner', ''),
    NULLIF(node ->> 'leaseToken', '')::uuid,
    NULLIF(node ->> 'leaseExpiresAt', '')::timestamptz,
    NULLIF(node ->> 'startedAt', '')::timestamptz,
    NULLIF(node ->> 'completedAt', '')::timestamptz,
    NULLIF(node ->> 'durationMs', '')::integer,
    COALESCE(NULLIF(node ->> 'createdAt', '')::timestamptz, now()),
    now()
  FROM jsonb_array_elements(COALESCE(p_snapshot -> 'nodes', '[]'::jsonb)) AS node
  ON CONFLICT (task_id, id) DO UPDATE SET
    school_id = EXCLUDED.school_id,
    agent_id = EXCLUDED.agent_id,
    agent_name = EXCLUDED.agent_name,
    agent_avatar = EXCLUDED.agent_avatar,
    title = EXCLUDED.title,
    skill_id = EXCLUDED.skill_id,
    state = EXCLUDED.state,
    depends_on = EXCLUDED.depends_on,
    input = EXCLUDED.input,
    output = EXCLUDED.output,
    error = EXCLUDED.error,
    attempt_count = EXCLUDED.attempt_count,
    max_attempts = EXCLUDED.max_attempts,
    next_attempt_at = EXCLUDED.next_attempt_at,
    lease_owner = EXCLUDED.lease_owner,
    lease_token = EXCLUDED.lease_token,
    lease_expires_at = EXCLUDED.lease_expires_at,
    started_at = EXCLUDED.started_at,
    completed_at = EXCLUDED.completed_at,
    duration_ms = EXCLUDED.duration_ms,
    updated_at = now();

  INSERT INTO ai_task_dependencies (school_id, task_id, node_id, depends_on_node_id)
  SELECT p_school_id, p_task_id, node ->> 'id', dependency #>> '{}'
  FROM jsonb_array_elements(COALESCE(p_snapshot -> 'nodes', '[]'::jsonb)) AS node
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(node -> 'dependsOn', '[]'::jsonb)) AS dependency;

  INSERT INTO ai_task_observations (id, school_id, task_id, node_id, kind, payload, created_at)
  SELECT observation ->> 'id', p_school_id, p_task_id, observation ->> 'nodeId',
    observation ->> 'kind', COALESCE(observation -> 'payload', '{}'::jsonb),
    COALESCE(NULLIF(observation ->> 'createdAt', '')::timestamptz, now())
  FROM jsonb_array_elements(COALESCE(p_snapshot -> 'observations', '[]'::jsonb)) AS observation;

  INSERT INTO ai_agent_messages (id, school_id, task_id, agent_id, agent_name, agent_avatar, type, content, data, created_at)
  SELECT message ->> 'id', p_school_id, p_task_id, message ->> 'agentId', message ->> 'agentName',
    COALESCE(message ->> 'agentAvatar', ''), message ->> 'type', message ->> 'content', message -> 'data',
    COALESCE(NULLIF(message ->> 'createdAt', '')::timestamptz, now())
  FROM jsonb_array_elements(COALESCE(p_snapshot -> 'messages', '[]'::jsonb)) AS message;

  IF approval_record IS NOT NULL AND approval_record <> 'null'::jsonb THEN
    INSERT INTO ai_approval_requests (
      id, school_id, task_id, policy, status, requested_by, requested_at, completed_at, created_at, updated_at
    ) VALUES (
      p_task_id, p_school_id, p_task_id, approval_record ->> 'policy', approval_record ->> 'status',
      p_snapshot ->> 'ownerUserId',
      COALESCE(NULLIF(approval_record ->> 'requestedAt', '')::timestamptz, now()),
      CASE WHEN approval_record ->> 'status' IN ('APPROVED', 'REJECTED') THEN now() ELSE NULL END,
      now(), now()
    );

    INSERT INTO ai_approval_decisions (
      school_id, task_id, approval_request_id, user_id, user_name, decision, reason, decided_at
    )
    SELECT p_school_id, p_task_id, p_task_id, decision ->> 'userId', decision ->> 'userName',
      decision ->> 'decision', decision ->> 'reason',
      COALESCE(NULLIF(decision ->> 'decidedAt', '')::timestamptz, now())
    FROM jsonb_array_elements(COALESCE(approval_record -> 'decisions', '[]'::jsonb)) AS decision;
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION ai_create_task_run(
  p_school_id uuid,
  p_owner_user_id varchar,
  p_idempotency_key varchar,
  p_snapshot jsonb,
  p_event_type varchar DEFAULT 'task.created'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  task_id uuid := (p_snapshot ->> 'id')::uuid;
  normalized_snapshot jsonb;
  stored_snapshot jsonb;
  stored_version integer;
  inserted_count integer;
BEGIN
  IF p_snapshot ->> 'ownerUserId' <> p_owner_user_id OR p_snapshot ->> 'schoolId' <> p_school_id::text THEN
    RAISE EXCEPTION 'ai_task_identity_mismatch' USING ERRCODE = '42501';
  END IF;
  normalized_snapshot := p_snapshot || jsonb_build_object(
    'version', 1,
    'idempotencyKey', p_idempotency_key,
    'attemptCount', COALESCE((p_snapshot ->> 'attemptCount')::integer, 0),
    'maxAttempts', COALESCE((p_snapshot ->> 'maxAttempts')::integer, 3)
  );

  INSERT INTO ai_task_runs (
    id, school_id, owner_user_id, owner_user_name, owner_role, idempotency_key,
    title, command, state, mode, skill_id, risk_level, approval_policy,
    intent, plan, snapshot, summary, blocker, version, attempt_count, max_attempts, retry_eligible,
    next_attempt_at, dead_lettered_at, lease_owner, lease_token, lease_expires_at,
    started_at, completed_at, created_at, updated_at
  ) VALUES (
    task_id, p_school_id, p_owner_user_id, p_snapshot ->> 'ownerUserName', p_snapshot ->> 'ownerRole', p_idempotency_key,
    p_snapshot ->> 'title', p_snapshot ->> 'command', p_snapshot ->> 'state', p_snapshot #>> '{intent,mode}',
    p_snapshot #>> '{intent,skillId}', p_snapshot ->> 'riskLevel', p_snapshot ->> 'approvalPolicy',
    p_snapshot -> 'intent', p_snapshot -> 'plan', normalized_snapshot, p_snapshot ->> 'summary', p_snapshot -> 'blocker',
    1, COALESCE((p_snapshot ->> 'attemptCount')::integer, 0), COALESCE((p_snapshot ->> 'maxAttempts')::integer, 3), COALESCE((p_snapshot ->> 'retryEligible')::boolean, false),
    NULLIF(p_snapshot ->> 'nextAttemptAt', '')::timestamptz,
    NULLIF(p_snapshot ->> 'deadLetteredAt', '')::timestamptz,
    NULLIF(p_snapshot ->> 'leaseOwner', ''), NULLIF(p_snapshot ->> 'leaseToken', '')::uuid,
    NULLIF(p_snapshot ->> 'leaseExpiresAt', '')::timestamptz,
    NULLIF(p_snapshot ->> 'startedAt', '')::timestamptz,
    NULLIF(p_snapshot ->> 'completedAt', '')::timestamptz,
    COALESCE(NULLIF(p_snapshot ->> 'createdAt', '')::timestamptz, now()), now()
  ) ON CONFLICT (school_id, owner_user_id, idempotency_key) DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;

  SELECT snapshot, version INTO stored_snapshot, stored_version
  FROM ai_task_runs
  WHERE school_id = p_school_id AND owner_user_id = p_owner_user_id AND idempotency_key = p_idempotency_key;

  IF inserted_count = 1 THEN
    PERFORM ai_sync_task_projections(p_school_id, task_id, stored_snapshot);
    INSERT INTO ai_outbox_events (school_id, aggregate_type, aggregate_id, event_type, deduplication_key, payload)
    VALUES (p_school_id, 'ai_task_run', task_id::text, p_event_type, task_id::text || ':1:' || p_event_type, stored_snapshot)
    ON CONFLICT DO NOTHING;
    INSERT INTO ai_audit_events (school_id, task_id, actor_type, actor_id, event_type, after_state, metadata)
    VALUES (p_school_id, task_id, 'user', p_owner_user_id, p_event_type, stored_snapshot ->> 'state', jsonb_build_object('version', 1));
  END IF;

  RETURN jsonb_build_object('created', inserted_count = 1, 'version', stored_version, 'snapshot', stored_snapshot);
END
$$;

CREATE OR REPLACE FUNCTION ai_update_task_run(
  p_school_id uuid,
  p_task_id uuid,
  p_expected_version integer,
  p_snapshot jsonb,
  p_event_type varchar,
  p_event_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  previous_state varchar(32);
  next_version integer := p_expected_version + 1;
  normalized_snapshot jsonb;
  updated_snapshot jsonb;
BEGIN
  IF p_snapshot ->> 'id' <> p_task_id::text OR p_snapshot ->> 'schoolId' <> p_school_id::text THEN
    RAISE EXCEPTION 'ai_task_identity_mismatch' USING ERRCODE = '42501';
  END IF;
  SELECT state INTO previous_state FROM ai_task_runs WHERE id = p_task_id AND school_id = p_school_id;
  IF previous_state IS NULL THEN
    RAISE EXCEPTION 'ai_task_not_found' USING ERRCODE = 'P0002';
  END IF;

  normalized_snapshot := p_snapshot || jsonb_build_object('version', next_version, 'updatedAt', now());
  UPDATE ai_task_runs
  SET
    title = normalized_snapshot ->> 'title',
    command = normalized_snapshot ->> 'command',
    state = normalized_snapshot ->> 'state',
    mode = normalized_snapshot #>> '{intent,mode}',
    skill_id = normalized_snapshot #>> '{intent,skillId}',
    risk_level = normalized_snapshot ->> 'riskLevel',
    approval_policy = normalized_snapshot ->> 'approvalPolicy',
    intent = normalized_snapshot -> 'intent',
    plan = normalized_snapshot -> 'plan',
    snapshot = normalized_snapshot,
    summary = normalized_snapshot ->> 'summary',
    blocker = normalized_snapshot -> 'blocker',
    version = next_version,
    attempt_count = COALESCE((normalized_snapshot ->> 'attemptCount')::integer, attempt_count),
    max_attempts = COALESCE((normalized_snapshot ->> 'maxAttempts')::integer, max_attempts),
    retry_eligible = COALESCE((normalized_snapshot ->> 'retryEligible')::boolean, retry_eligible),
    next_attempt_at = NULLIF(normalized_snapshot ->> 'nextAttemptAt', '')::timestamptz,
    dead_lettered_at = NULLIF(normalized_snapshot ->> 'deadLetteredAt', '')::timestamptz,
    lease_owner = NULLIF(normalized_snapshot ->> 'leaseOwner', ''),
    lease_token = NULLIF(normalized_snapshot ->> 'leaseToken', '')::uuid,
    lease_expires_at = NULLIF(normalized_snapshot ->> 'leaseExpiresAt', '')::timestamptz,
    started_at = NULLIF(normalized_snapshot ->> 'startedAt', '')::timestamptz,
    completed_at = NULLIF(normalized_snapshot ->> 'completedAt', '')::timestamptz,
    updated_at = now()
  WHERE id = p_task_id AND school_id = p_school_id AND version = p_expected_version
  RETURNING snapshot INTO updated_snapshot;

  IF updated_snapshot IS NULL THEN
    RAISE EXCEPTION 'ai_task_version_conflict' USING ERRCODE = '40001';
  END IF;

  PERFORM ai_sync_task_projections(p_school_id, p_task_id, updated_snapshot);
  INSERT INTO ai_outbox_events (school_id, aggregate_type, aggregate_id, event_type, deduplication_key, payload)
  VALUES (
    p_school_id, 'ai_task_run', p_task_id::text, p_event_type,
    p_task_id::text || ':' || next_version::text || ':' || p_event_type,
    jsonb_build_object('task', updated_snapshot, 'event', p_event_payload)
  ) ON CONFLICT DO NOTHING;
  INSERT INTO ai_audit_events (school_id, task_id, actor_type, actor_id, event_type, before_state, after_state, metadata)
  VALUES (
    p_school_id, p_task_id, 'system', COALESCE(updated_snapshot ->> 'leaseOwner', updated_snapshot ->> 'ownerUserId'),
    p_event_type, previous_state, updated_snapshot ->> 'state', jsonb_build_object('version', next_version, 'event', p_event_payload)
  );
  RETURN jsonb_build_object('version', next_version, 'snapshot', updated_snapshot);
END
$$;

CREATE OR REPLACE FUNCTION ai_claim_recoverable_task(
  p_worker_id varchar,
  p_lease_seconds integer DEFAULT 60,
  p_now timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  task_record ai_task_runs%ROWTYPE;
  new_lease_token uuid := gen_random_uuid();
  updated_snapshot jsonb;
BEGIN
  IF p_lease_seconds < 10 OR p_lease_seconds > 600 THEN
    RAISE EXCEPTION 'invalid_lease_seconds' USING ERRCODE = '22023';
  END IF;

  WITH exhausted AS (
    UPDATE ai_task_runs
    SET dead_lettered_at = p_now,
        retry_eligible = false,
        version = version + 1,
        blocker = jsonb_build_object('code', 'MAX_ATTEMPTS_EXCEEDED', 'message', 'Task moved to dead letter after exhausting attempts'),
        snapshot = snapshot || jsonb_build_object(
          'version', version + 1,
          'deadLetteredAt', p_now,
          'retryEligible', false,
          'blocker', jsonb_build_object('code', 'MAX_ATTEMPTS_EXCEEDED', 'message', 'Task moved to dead letter after exhausting attempts')
        ),
        updated_at = p_now
    WHERE dead_lettered_at IS NULL
      AND attempt_count >= max_attempts
      AND state IN ('QUEUED', 'RUNNING', 'OBSERVING', 'REPLANNING', 'VERIFYING', 'FAILED')
      AND (state <> 'FAILED' OR retry_eligible)
    RETURNING school_id, id, snapshot
  )
  INSERT INTO ai_outbox_events (school_id, aggregate_type, aggregate_id, event_type, deduplication_key, payload)
  SELECT school_id, 'ai_task_run', id::text, 'task.dead_lettered', id::text || ':dead-letter', snapshot
  FROM exhausted
  ON CONFLICT DO NOTHING;

  SELECT * INTO task_record
  FROM ai_task_runs
  WHERE dead_lettered_at IS NULL
    AND state IN ('QUEUED', 'RUNNING', 'OBSERVING', 'REPLANNING', 'VERIFYING', 'FAILED')
    AND (state <> 'FAILED' OR retry_eligible)
    AND attempt_count < max_attempts
    AND (next_attempt_at IS NULL OR next_attempt_at <= p_now)
    AND (lease_expires_at IS NULL OR lease_expires_at <= p_now)
  ORDER BY COALESCE(next_attempt_at, created_at), created_at
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF task_record.id IS NULL THEN
    RETURN NULL;
  END IF;

  updated_snapshot := task_record.snapshot || jsonb_build_object(
    'version', task_record.version + 1,
    'attemptCount', task_record.attempt_count + 1,
    'retryEligible', false,
    'leaseOwner', p_worker_id,
    'leaseToken', new_lease_token::text,
    'leaseExpiresAt', p_now + make_interval(secs => p_lease_seconds),
    'updatedAt', p_now
  );
  UPDATE ai_task_runs
  SET version = version + 1,
      attempt_count = attempt_count + 1,
      retry_eligible = false,
      lease_owner = p_worker_id,
      lease_token = new_lease_token,
      lease_expires_at = p_now + make_interval(secs => p_lease_seconds),
      snapshot = updated_snapshot,
      updated_at = p_now
  WHERE id = task_record.id;

  INSERT INTO ai_outbox_events (school_id, aggregate_type, aggregate_id, event_type, deduplication_key, payload)
  VALUES (
    task_record.school_id, 'ai_task_run', task_record.id::text, 'task.claimed',
    task_record.id::text || ':claim:' || (task_record.attempt_count + 1)::text,
    jsonb_build_object('taskId', task_record.id, 'workerId', p_worker_id, 'leaseToken', new_lease_token)
  ) ON CONFLICT DO NOTHING;
  RETURN jsonb_build_object('version', task_record.version + 1, 'leaseToken', new_lease_token, 'snapshot', updated_snapshot);
END
$$;

CREATE OR REPLACE FUNCTION ai_renew_task_lease(
  p_school_id uuid,
  p_task_id uuid,
  p_lease_token uuid,
  p_lease_seconds integer DEFAULT 60
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_snapshot jsonb;
BEGIN
  IF p_lease_seconds < 10 OR p_lease_seconds > 600 THEN
    RAISE EXCEPTION 'invalid_lease_seconds' USING ERRCODE = '22023';
  END IF;
  UPDATE ai_task_runs
  SET version = version + 1,
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      snapshot = snapshot || jsonb_build_object(
        'version', version + 1,
        'leaseExpiresAt', now() + make_interval(secs => p_lease_seconds),
        'updatedAt', now()
      ),
      updated_at = now()
  WHERE id = p_task_id AND school_id = p_school_id AND lease_token = p_lease_token AND lease_expires_at > now()
  RETURNING snapshot INTO updated_snapshot;
  IF updated_snapshot IS NULL THEN
    RAISE EXCEPTION 'ai_task_lease_lost' USING ERRCODE = '40001';
  END IF;
  RETURN updated_snapshot;
END
$$;

CREATE OR REPLACE FUNCTION ai_claim_outbox_events(
  p_worker_id varchar,
  p_limit integer DEFAULT 50,
  p_lease_seconds integer DEFAULT 60
)
RETURNS SETOF ai_outbox_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT id, gen_random_uuid() AS token
    FROM ai_outbox_events
    WHERE status IN ('PENDING', 'FAILED', 'PUBLISHING')
      AND available_at <= now()
      AND attempt_count < max_attempts
      AND (lease_expires_at IS NULL OR lease_expires_at <= now())
    ORDER BY available_at, created_at
    LIMIT GREATEST(1, LEAST(p_limit, 200))
    FOR UPDATE SKIP LOCKED
  )
  UPDATE ai_outbox_events event
  SET status = 'PUBLISHING',
      attempt_count = event.attempt_count + 1,
      lease_owner = p_worker_id,
      lease_token = candidates.token,
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      updated_at = now()
  FROM candidates
  WHERE event.id = candidates.id
  RETURNING event.*;
END
$$;

CREATE OR REPLACE FUNCTION ai_complete_outbox_event(
  p_event_id uuid,
  p_lease_token uuid,
  p_succeeded boolean,
  p_error text DEFAULT NULL
)
RETURNS varchar
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_status varchar(24);
BEGIN
  SELECT CASE
    WHEN p_succeeded THEN 'PUBLISHED'
    WHEN attempt_count >= max_attempts THEN 'DEAD_LETTER'
    ELSE 'FAILED'
  END INTO next_status
  FROM ai_outbox_events
  WHERE id = p_event_id AND lease_token = p_lease_token
  FOR UPDATE;
  IF next_status IS NULL THEN
    RAISE EXCEPTION 'ai_outbox_lease_lost' USING ERRCODE = '40001';
  END IF;
  UPDATE ai_outbox_events
  SET status = next_status,
      published_at = CASE WHEN p_succeeded THEN now() ELSE published_at END,
      available_at = CASE WHEN p_succeeded THEN available_at ELSE now() + make_interval(secs => LEAST(300, power(2, attempt_count)::integer)) END,
      last_error = CASE WHEN p_succeeded THEN NULL ELSE p_error END,
      lease_owner = NULL,
      lease_token = NULL,
      lease_expires_at = NULL,
      updated_at = now()
  WHERE id = p_event_id;
  RETURN next_status;
END
$$;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'ai_task_runs', 'ai_task_nodes', 'ai_task_dependencies', 'ai_task_observations',
    'ai_agent_messages', 'ai_approval_requests', 'ai_approval_decisions',
    'ai_tool_invocations', 'ai_business_effects', 'ai_trace_links',
    'ai_audit_events', 'ai_outbox_events'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', table_name);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', table_name);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM authenticated', table_name);
  END LOOP;
END
$$;

REVOKE ALL ON FUNCTION ai_sync_task_projections(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION ai_create_task_run(uuid, varchar, varchar, jsonb, varchar) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION ai_update_task_run(uuid, uuid, integer, jsonb, varchar, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION ai_claim_recoverable_task(varchar, integer, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION ai_renew_task_lease(uuid, uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION ai_claim_outbox_events(varchar, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION ai_complete_outbox_event(uuid, uuid, boolean, text) FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION ai_create_task_run(uuid, varchar, varchar, jsonb, varchar) TO service_role;
    GRANT EXECUTE ON FUNCTION ai_update_task_run(uuid, uuid, integer, jsonb, varchar, jsonb) TO service_role;
    GRANT EXECUTE ON FUNCTION ai_claim_recoverable_task(varchar, integer, timestamptz) TO service_role;
    GRANT EXECUTE ON FUNCTION ai_renew_task_lease(uuid, uuid, uuid, integer) TO service_role;
    GRANT EXECUTE ON FUNCTION ai_claim_outbox_events(varchar, integer, integer) TO service_role;
    GRANT EXECUTE ON FUNCTION ai_complete_outbox_event(uuid, uuid, boolean, text) TO service_role;
  END IF;
END
$$;
