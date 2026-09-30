-- Governed repair-policy guard for the three-spirit SLA scenario.
-- Xiezhi evaluates real pending repair records before any dispatch/notification write,
-- seals the decision in an auditable ledger, and proves business_write_occurred=false.

CREATE TABLE IF NOT EXISTS ai_repair_policy_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  task_id uuid NOT NULL REFERENCES ai_task_runs(id) ON DELETE CASCADE,
  node_id varchar(128) NOT NULL,
  actor_id varchar(36) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  policy_version varchar(80) NOT NULL,
  snapshot_hash varchar(64) NOT NULL,
  target_count integer NOT NULL CHECK (target_count BETWEEN 1 AND 50),
  repair_ids jsonb NOT NULL CHECK (jsonb_typeof(repair_ids) = 'array'),
  checks jsonb NOT NULL CHECK (jsonb_typeof(checks) = 'object'),
  decision varchar(24) NOT NULL CHECK (decision IN ('PASS', 'BLOCK')),
  business_write_occurred boolean NOT NULL DEFAULT false CHECK (business_write_occurred = false),
  created_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz,
  UNIQUE (school_id, task_id, node_id),
  FOREIGN KEY (task_id, node_id) REFERENCES ai_task_nodes(task_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ai_repair_policy_decisions_task_idx
  ON ai_repair_policy_decisions(school_id, task_id, decision, created_at DESC);

INSERT INTO skill_definitions(id, domain, display_name, description, owner, active_version)
VALUES (
  'repair.policy.guard',
  'repair_policy',
  'Repair policy guard',
  'Validate real pending repair targets, tenant scope, worker availability and approval boundaries without mutating repair business data',
  'ai-governance',
  1
)
ON CONFLICT(id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  owner = EXCLUDED.owner,
  active_version = 1,
  updated_at = now();

INSERT INTO skill_versions(
  skill_id, version, skill_key, input_schema, output_schema, required_permission,
  data_scope_policy, risk_level, approval_policy, timeout_ms, retry_policy,
  rate_limit, preview_policy, audit_policy, compensation_policy, eval_set,
  checksum, status, published_at
)
VALUES (
  'repair.policy.guard',
  1,
  'repair.policy.guard.v1',
  '{"type":"object","required":["count","operation","reason"],"properties":{"count":{"type":"integer","minimum":1,"maximum":50},"operation":{"enum":["sla_dispatch","dispatch","batch_dispatch"]},"reason":{"type":"string","minLength":3,"maxLength":500}}}'::jsonb,
  '{"type":"object","required":["effectId","status","result"]}'::jsonb,
  'repair:dispatch',
  '{"source":"server_business_snapshot","tenant":"school_id","businessMutation":false}'::jsonb,
  'medium',
  'single_approval',
  30000,
  '{"maxAttempts":1,"backoffMs":1000}'::jsonb,
  '{"requests":20,"windowSeconds":60}'::jsonb,
  '{"ttlSeconds":600,"showFields":["targetCount","affectedResources","policyDecision","checks","businessWriteOccurred"]}'::jsonb,
  '{"retainDays":365,"redactFields":[],"recordInput":true,"recordOutput":true}'::jsonb,
  '{"supported":false,"strategy":"append_only_policy_evidence"}'::jsonb,
  'repair.policy.guard.v1.golden',
  encode(digest('repair.policy.guard.v1', 'sha256'), 'hex'),
  'published',
  now()
)
ON CONFLICT(skill_key) DO NOTHING;

INSERT INTO skill_bindings(school_id, skill_key, role)
SELECT school.id, 'repair.policy.guard.v1', role.code
FROM schools school
CROSS JOIN (VALUES ('super_admin'), ('logistics_manager'), ('logistics_admin')) role(code)
ON CONFLICT(school_id, skill_key, role) DO NOTHING;

CREATE OR REPLACE FUNCTION ai_prepare_repair_policy_guard(
  p_school_id uuid,
  p_task_id uuid,
  p_node_id varchar,
  p_skill_key varchar,
  p_actor_id varchar,
  p_input jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  preview_id uuid := gen_random_uuid();
  policy_version constant varchar(80) := 'repair-governance-2026.08';
  target jsonb;
  scope jsonb;
  view_data jsonb;
  versions jsonb := '{}'::jsonb;
  checks jsonb;
  input_hash varchar(64) := encode(digest(p_input::text, 'sha256'), 'hex');
  computed_snapshot_hash varchar(64);
  expiry timestamptz := now() + interval '10 minutes';
  wanted integer;
  found_count integer;
  worker_count integer;
BEGIN
  IF p_skill_key <> 'repair.policy.guard.v1' THEN
    RAISE EXCEPTION 'repair_policy_guard_skill_key_mismatch' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM ai_task_runs WHERE id = p_task_id AND school_id = p_school_id) THEN
    RAISE EXCEPTION 'skill_task_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM ai_task_nodes WHERE task_id = p_task_id AND id = p_node_id AND school_id = p_school_id) THEN
    RAISE EXCEPTION 'skill_task_node_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM skill_versions WHERE skill_key = p_skill_key AND status = 'published') THEN
    RAISE EXCEPTION 'skill_version_not_published' USING ERRCODE = 'P0002';
  END IF;

  wanted := LEAST(GREATEST(COALESCE((p_input->>'count')::integer, 0), 1), 50);
  IF COALESCE(p_input->>'operation', '') NOT IN ('sla_dispatch', 'dispatch', 'batch_dispatch') THEN
    RAISE EXCEPTION 'repair_policy_operation_not_allowed' USING ERRCODE = '22023';
  END IF;

  WITH repairs AS (
    SELECT
      r.id,
      r.version,
      r.title,
      r.location,
      upper(r.status) AS status,
      lower(COALESCE(r.priority, 'normal')) AS priority,
      r.organization_id,
      r.building_id,
      r.created_at,
      CASE lower(COALESCE(r.priority, 'normal'))
        WHEN 'urgent' THEN 1
        WHEN 'high' THEN 2
        ELSE 3
      END AS priority_rank
    FROM repair_orders r
    WHERE r.school_id = p_school_id
      AND NOT r.is_deleted
      AND upper(r.status) = 'PENDING'
    ORDER BY priority_rank, r.created_at, r.id
    LIMIT wanted
  )
  SELECT jsonb_build_object(
    'policyVersion', policy_version,
    'operation', p_input->>'operation',
    'repairs', COALESCE(jsonb_agg(jsonb_build_object(
      'repairId', id,
      'repairVersion', version,
      'repairTitle', title,
      'location', location,
      'status', status,
      'priority', priority
    ) ORDER BY priority_rank, created_at, id), '[]'::jsonb)
  )
  INTO target
  FROM repairs;

  found_count := COALESCE(jsonb_array_length(target->'repairs'), 0);
  IF found_count <> wanted THEN
    RAISE EXCEPTION 'repair_policy_targets_unavailable' USING ERRCODE = 'P0002';
  END IF;

  SELECT count(*)::int INTO worker_count
  FROM users u
  WHERE u.school_id = p_school_id
    AND u.role = 'repairman'
    AND u.status = 'active'
    AND NOT u.is_deleted;
  IF worker_count < 1 THEN
    RAISE EXCEPTION 'repair_policy_no_active_worker' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(jsonb_object_agg(item->>'repairId', (item->>'repairVersion')::integer), '{}'::jsonb)
  INTO versions
  FROM jsonb_array_elements(target->'repairs') item;

  SELECT jsonb_strip_nulls(jsonb_build_object(
    'schoolId', p_school_id,
    'organizationId', ((array_agg(r.organization_id) FILTER (WHERE r.organization_id IS NOT NULL))[1])::text,
    'buildingId', ((array_agg(r.building_id) FILTER (WHERE r.building_id IS NOT NULL))[1])::text
  ))
  INTO scope
  FROM repair_orders r
  WHERE r.id IN (SELECT item->>'repairId' FROM jsonb_array_elements(target->'repairs') item);

  checks := jsonb_build_object(
    'tenantScope', 'PASS',
    'targetState', 'PASS',
    'batchLimit', 'PASS',
    'activeWorkerPool', 'PASS',
    'humanApproval', 'REQUIRED',
    'requestedTargets', wanted,
    'eligibleTargets', found_count,
    'activeWorkers', worker_count
  );
  target := target || jsonb_build_object('checks', checks);
  view_data := jsonb_build_object(
    'targetCount', found_count,
    'affectedResources', target->'repairs',
    'stateChanges', jsonb_build_object('repairOrders', 'NONE', 'complianceLedger', 'SEAL_AFTER_APPROVAL'),
    'warnings', '[]'::jsonb,
    'policyDecision', 'PASS_TO_HUMAN_APPROVAL',
    'policyVersion', policy_version,
    'checks', checks,
    'businessWriteOccurred', false
  );

  PERFORM ai_assert_skill_binding(p_school_id, p_actor_id, p_skill_key, scope, true);
  computed_snapshot_hash := encode(digest(target::text, 'sha256'), 'hex');

  INSERT INTO skill_operation_previews(
    id, school_id, task_id, node_id, skill_key, actor_id, input, input_hash,
    resource_scope, target_snapshot, snapshot_hash, expected_versions, preview,
    status, expires_at
  )
  VALUES (
    preview_id, p_school_id, p_task_id, p_node_id, p_skill_key, p_actor_id, p_input,
    input_hash, scope, target, computed_snapshot_hash, versions, view_data, 'PREPARED', expiry
  )
  ON CONFLICT(school_id, task_id, node_id, snapshot_hash) DO UPDATE SET
    input = EXCLUDED.input,
    input_hash = EXCLUDED.input_hash,
    preview = EXCLUDED.preview,
    expected_versions = EXCLUDED.expected_versions,
    status = 'PREPARED',
    expires_at = EXCLUDED.expires_at
  RETURNING id INTO preview_id;

  INSERT INTO ai_tool_invocations(
    school_id, task_id, node_id, skill_id, idempotency_key, status,
    request, response, started_at, completed_at
  )
  VALUES (
    p_school_id, p_task_id, p_node_id, p_skill_key,
    p_task_id::text || ':' || p_node_id || ':prepare:' || computed_snapshot_hash,
    'PREPARED', p_input,
    jsonb_build_object('previewId', preview_id, 'snapshotHash', computed_snapshot_hash, 'businessWriteOccurred', false),
    now(), now()
  )
  ON CONFLICT(school_id, idempotency_key) DO NOTHING;

  INSERT INTO ai_audit_events(school_id, task_id, node_id, actor_type, actor_id, event_type, metadata)
  VALUES (
    p_school_id, p_task_id, p_node_id, 'agent', p_actor_id,
    'repair.policy.guard.prepared',
    jsonb_build_object(
      'skillKey', p_skill_key,
      'previewId', preview_id,
      'snapshotHash', computed_snapshot_hash,
      'policyVersion', policy_version,
      'decision', 'PASS_TO_HUMAN_APPROVAL',
      'businessWriteOccurred', false
    )
  );

  RETURN jsonb_build_object(
    'previewId', preview_id,
    'skillKey', p_skill_key,
    'input', p_input,
    'inputHash', input_hash,
    'snapshotHash', computed_snapshot_hash,
    'resourceScope', scope,
    'targetSnapshot', target,
    'expectedVersions', versions,
    'preview', view_data,
    'expiresAt', expiry
  );
END $$;

CREATE OR REPLACE FUNCTION ai_commit_repair_policy_guard(
  p_school_id uuid,
  p_task_id uuid,
  p_node_id varchar,
  p_preview_id uuid,
  p_skill_key varchar,
  p_actor_id varchar,
  p_idempotency_key varchar
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  prepared skill_operation_previews%ROWTYPE;
  old_effect ai_business_effects%ROWTYPE;
  effect_id uuid := gen_random_uuid();
  decision_id uuid := gen_random_uuid();
  approvals integer := 0;
  matched integer := 0;
  expected integer := 0;
  policy_version varchar(80);
  repair_ids jsonb;
  checks jsonb;
  result_data jsonb;
BEGIN
  IF p_skill_key <> 'repair.policy.guard.v1' THEN
    RAISE EXCEPTION 'repair_policy_guard_skill_key_mismatch' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO old_effect
  FROM ai_business_effects
  WHERE school_id = p_school_id AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'effectId', old_effect.id,
      'targetType', old_effect.target_type,
      'targetId', old_effect.target_id,
      'status', old_effect.status,
      'idempotentReplay', true,
      'result', COALESCE(old_effect.after_value, '{}'::jsonb),
      'verification', old_effect.verification
    );
  END IF;

  SELECT * INTO prepared
  FROM skill_operation_previews
  WHERE id = p_preview_id
    AND school_id = p_school_id
    AND task_id = p_task_id
    AND node_id = p_node_id
    AND skill_key = p_skill_key
  FOR UPDATE;
  IF NOT FOUND OR prepared.status <> 'PREPARED' OR prepared.expires_at <= now() THEN
    RAISE EXCEPTION 'skill_preview_missing_consumed_or_expired' USING ERRCODE = '40001';
  END IF;
  IF prepared.actor_id <> p_actor_id THEN
    RAISE EXCEPTION 'skill_preview_actor_mismatch' USING ERRCODE = '42501';
  END IF;

  PERFORM ai_assert_skill_binding(p_school_id, p_actor_id, p_skill_key, prepared.resource_scope, false);
  SELECT count(DISTINCT d.user_id)::int INTO approvals
  FROM ai_approval_requests r
  JOIN ai_approval_decisions d
    ON d.approval_request_id = r.id
   AND d.decision = 'APPROVED'
  WHERE r.task_id = p_task_id
    AND r.school_id = p_school_id
    AND r.status = 'APPROVED';
  IF approvals < 1 THEN
    RAISE EXCEPTION 'skill_approval_not_satisfied' USING ERRCODE = '42501';
  END IF;

  expected := jsonb_array_length(prepared.target_snapshot->'repairs');
  SELECT count(*)::int INTO matched
  FROM jsonb_array_elements(prepared.target_snapshot->'repairs') item
  JOIN repair_orders r
    ON r.id = item->>'repairId'
   AND r.school_id = p_school_id
   AND r.version = (item->>'repairVersion')::integer
   AND upper(r.status) = 'PENDING'
   AND NOT r.is_deleted;
  IF matched <> expected THEN
    RAISE EXCEPTION 'skill_target_version_or_state_changed' USING ERRCODE = '40001';
  END IF;

  policy_version := prepared.target_snapshot->>'policyVersion';
  checks := prepared.target_snapshot->'checks';
  SELECT COALESCE(jsonb_agg(item->>'repairId' ORDER BY item->>'repairId'), '[]'::jsonb)
  INTO repair_ids
  FROM jsonb_array_elements(prepared.target_snapshot->'repairs') item;

  INSERT INTO ai_repair_policy_decisions(
    id, school_id, task_id, node_id, actor_id, policy_version, snapshot_hash,
    target_count, repair_ids, checks, decision, business_write_occurred
  )
  VALUES (
    decision_id, p_school_id, p_task_id, p_node_id, p_actor_id, policy_version,
    prepared.snapshot_hash, expected, repair_ids, checks, 'PASS', false
  )
  ON CONFLICT(school_id, task_id, node_id) DO UPDATE SET
    actor_id = EXCLUDED.actor_id,
    policy_version = EXCLUDED.policy_version,
    snapshot_hash = EXCLUDED.snapshot_hash,
    target_count = EXCLUDED.target_count,
    repair_ids = EXCLUDED.repair_ids,
    checks = EXCLUDED.checks,
    decision = 'PASS',
    business_write_occurred = false
  RETURNING id INTO decision_id;

  result_data := jsonb_build_object(
    'decisionId', decision_id,
    'decision', 'PASS',
    'policyVersion', policy_version,
    'checkedRepairs', expected,
    'humanApprovalRecorded', true,
    'snapshotSealed', true,
    'businessWriteOccurred', false,
    'evidenceSource', 'repair_orders_prewrite_snapshot'
  );

  INSERT INTO ai_business_effects(
    id, school_id, task_id, node_id, effect_type, target_type, target_id,
    idempotency_key, status, before_value, after_value, applied_at
  )
  VALUES (
    effect_id, p_school_id, p_task_id, p_node_id, p_skill_key,
    'repair_policy_decision', decision_id::text, p_idempotency_key, 'APPLIED',
    prepared.target_snapshot, result_data, now()
  );

  UPDATE skill_operation_previews
  SET status = 'CONSUMED', consumed_at = now()
  WHERE id = p_preview_id;

  INSERT INTO ai_tool_invocations(
    school_id, task_id, node_id, skill_id, idempotency_key, status,
    request, response, started_at, completed_at
  )
  VALUES (
    p_school_id, p_task_id, p_node_id, p_skill_key,
    p_idempotency_key || ':commit', 'SUCCEEDED',
    jsonb_build_object('previewId', p_preview_id, 'inputHash', prepared.input_hash),
    result_data, now(), now()
  )
  ON CONFLICT(school_id, idempotency_key) DO UPDATE SET
    status = 'SUCCEEDED',
    response = EXCLUDED.response,
    completed_at = now(),
    updated_at = now();

  INSERT INTO ai_audit_events(school_id, task_id, node_id, actor_type, actor_id, event_type, metadata)
  VALUES (
    p_school_id, p_task_id, p_node_id, 'agent', p_actor_id,
    'repair.policy.guard.committed',
    jsonb_build_object(
      'skillKey', p_skill_key,
      'effectId', effect_id,
      'decisionId', decision_id,
      'policyVersion', policy_version,
      'businessWriteOccurred', false
    )
  );

  INSERT INTO ai_outbox_events(
    school_id, aggregate_type, aggregate_id, event_type, deduplication_key, payload
  )
  VALUES (
    p_school_id, 'repair_policy_decision', decision_id::text,
    'repair.policy.guard.sealed', p_idempotency_key,
    jsonb_build_object(
      'effectId', effect_id,
      'decisionId', decision_id,
      'policyVersion', policy_version,
      'targetCount', expected,
      'businessWriteOccurred', false
    )
  )
  ON CONFLICT(school_id, aggregate_type, aggregate_id, event_type, deduplication_key) DO NOTHING;

  RETURN jsonb_build_object(
    'effectId', effect_id,
    'targetType', 'repair_policy_decision',
    'targetId', decision_id::text,
    'status', 'APPLIED',
    'idempotentReplay', false,
    'result', result_data
  );
END $$;

CREATE OR REPLACE FUNCTION ai_verify_repair_policy_guard(
  p_school_id uuid,
  p_effect_id uuid,
  p_actor_id varchar
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  effect ai_business_effects%ROWTYPE;
  decision ai_repair_policy_decisions%ROWTYPE;
  effect_scope jsonb;
  approvals integer := 0;
  evidence jsonb;
  ok boolean := false;
  decision_found boolean := false;
BEGIN
  SELECT * INTO effect
  FROM ai_business_effects
  WHERE id = p_effect_id AND school_id = p_school_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'skill_effect_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF effect.effect_type <> 'repair.policy.guard.v1' THEN
    RAISE EXCEPTION 'repair_policy_guard_effect_type_mismatch' USING ERRCODE = '22023';
  END IF;
  IF effect.status = 'VERIFIED' THEN
    RETURN jsonb_build_object(
      'effectId', effect.id,
      'targetType', effect.target_type,
      'targetId', effect.target_id,
      'status', 'VERIFIED',
      'idempotentReplay', true,
      'result', effect.after_value,
      'verification', effect.verification
    );
  END IF;

  SELECT resource_scope INTO effect_scope
  FROM skill_operation_previews
  WHERE school_id = p_school_id
    AND task_id = effect.task_id
    AND node_id = effect.node_id
    AND skill_key = effect.effect_type
    AND status = 'CONSUMED'
  ORDER BY consumed_at DESC
  LIMIT 1;
  PERFORM ai_assert_skill_binding(
    p_school_id,
    p_actor_id,
    effect.effect_type,
    COALESCE(effect_scope, jsonb_build_object('schoolId', p_school_id)),
    false
  );

  SELECT * INTO decision
  FROM ai_repair_policy_decisions
  WHERE id = effect.target_id::uuid
    AND school_id = p_school_id
    AND task_id = effect.task_id
    AND node_id = effect.node_id;
  decision_found := FOUND;

  SELECT count(DISTINCT d.user_id)::int INTO approvals
  FROM ai_approval_requests r
  JOIN ai_approval_decisions d
    ON d.approval_request_id = r.id
   AND d.decision = 'APPROVED'
  WHERE r.task_id = effect.task_id
    AND r.school_id = p_school_id
    AND r.status = 'APPROVED';

  ok := decision_found
    AND decision.decision = 'PASS'
    AND decision.business_write_occurred = false
    AND decision.snapshot_hash IS NOT NULL
    AND length(decision.snapshot_hash) = 64
    AND jsonb_array_length(decision.repair_ids) = decision.target_count
    AND approvals >= 1;

  evidence := jsonb_build_object(
    'verified', ok,
    'source', 'ai_repair_policy_decisions',
    'policyVersion', decision.policy_version,
    'targetCount', decision.target_count,
    'snapshotSealed', decision.snapshot_hash IS NOT NULL AND length(decision.snapshot_hash) = 64,
    'humanApprovalRecorded', approvals >= 1,
    'businessWriteOccurred', false
  );

  IF NOT ok THEN
    UPDATE ai_business_effects
    SET status = 'FAILED', verification = evidence, updated_at = now()
    WHERE id = effect.id;
    RAISE EXCEPTION 'skill_business_readback_failed' USING ERRCODE = '40001';
  END IF;

  UPDATE ai_repair_policy_decisions
  SET verified_at = now()
  WHERE id = decision.id;
  UPDATE ai_business_effects
  SET status = 'VERIFIED', verification = evidence, verified_at = now(), updated_at = now()
  WHERE id = effect.id;

  INSERT INTO ai_audit_events(school_id, task_id, node_id, actor_type, actor_id, event_type, metadata)
  VALUES (
    p_school_id, effect.task_id, effect.node_id, 'system', p_actor_id,
    'repair.policy.guard.verified',
    jsonb_build_object(
      'skillKey', effect.effect_type,
      'effectId', effect.id,
      'decisionId', decision.id,
      'verification', evidence
    )
  );

  RETURN jsonb_build_object(
    'effectId', effect.id,
    'targetType', effect.target_type,
    'targetId', effect.target_id,
    'status', 'VERIFIED',
    'idempotentReplay', false,
    'result', effect.after_value,
    'verification', evidence
  );
END $$;

ALTER TABLE ai_repair_policy_decisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ai_repair_policy_decisions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION ai_prepare_repair_policy_guard(uuid, uuid, varchar, varchar, varchar, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION ai_commit_repair_policy_guard(uuid, uuid, varchar, uuid, varchar, varchar, varchar) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION ai_verify_repair_policy_guard(uuid, uuid, varchar) FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION ai_prepare_repair_policy_guard(uuid, uuid, varchar, varchar, varchar, jsonb) TO service_role;
    GRANT EXECUTE ON FUNCTION ai_commit_repair_policy_guard(uuid, uuid, varchar, uuid, varchar, varchar, varchar) TO service_role;
    GRANT EXECUTE ON FUNCTION ai_verify_repair_policy_guard(uuid, uuid, varchar) TO service_role;
  END IF;
END $$;
