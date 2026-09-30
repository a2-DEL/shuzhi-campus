-- Enterprise Skill Gateway and eight explicit business-loop adapters.
-- No arbitrary SQL/URL Skill exists. Service-role RPCs enforce tenant, binding, approval,
-- optimistic revalidation, idempotency, audit, outbox, and business read-back.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS skill_definitions (
 id varchar(120) PRIMARY KEY, domain varchar(80) NOT NULL, display_name varchar(200) NOT NULL,
 description text NOT NULL, owner varchar(120) NOT NULL, active_version integer NOT NULL CHECK(active_version>0),
 status varchar(20) NOT NULL DEFAULT 'active' CHECK(status IN('active','disabled','retired')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS skill_versions (
 skill_id varchar(120) NOT NULL REFERENCES skill_definitions(id) ON DELETE RESTRICT,
 version integer NOT NULL CHECK(version>0), skill_key varchar(160) NOT NULL UNIQUE,
 input_schema jsonb NOT NULL CHECK(jsonb_typeof(input_schema)='object'),
 output_schema jsonb NOT NULL CHECK(jsonb_typeof(output_schema)='object'),
 required_permission varchar(120) NOT NULL, data_scope_policy jsonb NOT NULL,
 risk_level varchar(16) NOT NULL CHECK(risk_level IN('low','medium','high','critical')),
 approval_policy varchar(24) NOT NULL CHECK(approval_policy IN('automatic','single_approval','dual_approval')),
 timeout_ms integer NOT NULL CHECK(timeout_ms BETWEEN 1000 AND 600000), retry_policy jsonb NOT NULL,
 rate_limit jsonb NOT NULL, preview_policy jsonb NOT NULL, audit_policy jsonb NOT NULL,
 compensation_policy jsonb NOT NULL, eval_set varchar(200) NOT NULL, checksum varchar(64) NOT NULL,
 status varchar(20) NOT NULL DEFAULT 'published' CHECK(status IN('draft','published','retired')),
 published_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(skill_id,version)
);
CREATE TABLE IF NOT EXISTS skill_bindings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid NOT NULL REFERENCES schools(id),
 skill_key varchar(160) NOT NULL REFERENCES skill_versions(skill_key), role varchar(50) NOT NULL,
 enabled boolean NOT NULL DEFAULT true, scope_policy jsonb NOT NULL DEFAULT '{"source":"server_resource"}',
 rate_limit_override jsonb, bound_by varchar(36) REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(school_id,skill_key,role)
);
CREATE INDEX IF NOT EXISTS skill_bindings_lookup_idx ON skill_bindings(school_id,role,skill_key) WHERE enabled;
CREATE TABLE IF NOT EXISTS skill_eval_results (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid REFERENCES schools(id),
 skill_key varchar(160) NOT NULL REFERENCES skill_versions(skill_key), eval_set varchar(200) NOT NULL,
 run_id varchar(160) NOT NULL, passed boolean NOT NULL, score numeric(8,5), metrics jsonb NOT NULL DEFAULT '{}',
 evidence_uri text, executed_at timestamptz NOT NULL DEFAULT now(), UNIQUE(skill_key,run_id)
);
CREATE TABLE IF NOT EXISTS skill_operation_previews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid NOT NULL REFERENCES schools(id),
 task_id uuid NOT NULL REFERENCES ai_task_runs(id) ON DELETE CASCADE, node_id varchar(128) NOT NULL,
 skill_key varchar(160) NOT NULL REFERENCES skill_versions(skill_key), actor_id varchar(36) NOT NULL REFERENCES users(id),
 input jsonb NOT NULL, input_hash varchar(64) NOT NULL, resource_scope jsonb NOT NULL,
 target_snapshot jsonb NOT NULL, snapshot_hash varchar(64) NOT NULL, expected_versions jsonb NOT NULL DEFAULT '{}',
 preview jsonb NOT NULL, status varchar(20) NOT NULL DEFAULT 'PREPARED' CHECK(status IN('PREPARED','CONSUMED','EXPIRED','CANCELLED')),
 expires_at timestamptz NOT NULL, consumed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(school_id,task_id,node_id,snapshot_hash)
);
CREATE INDEX IF NOT EXISTS skill_operation_previews_active_idx ON skill_operation_previews(school_id,task_id,status,expires_at);
CREATE TABLE IF NOT EXISTS ai_skill_rate_limit_counters (
 school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE, actor_id varchar(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 skill_key varchar(160) NOT NULL REFERENCES skill_versions(skill_key) ON DELETE CASCADE,
 window_started_at timestamptz NOT NULL, request_count integer NOT NULL DEFAULT 1 CHECK(request_count>0),
 updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(school_id,actor_id,skill_key,window_started_at)
);
CREATE OR REPLACE FUNCTION prevent_published_skill_version_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF OLD.status='published' THEN RAISE EXCEPTION 'published_skill_version_is_immutable' USING ERRCODE='55000'; END IF;
RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END; END $$;
DROP TRIGGER IF EXISTS skill_versions_immutable_trigger ON skill_versions;
CREATE TRIGGER skill_versions_immutable_trigger BEFORE UPDATE OR DELETE ON skill_versions
FOR EACH ROW EXECUTE FUNCTION prevent_published_skill_version_mutation();

INSERT INTO skill_definitions(id,domain,display_name,description,owner,active_version) VALUES
('repair.dispatch.commit','repair','Repair dispatch commit','Dispatch validated repairs with SLA and notification outbox','logistics-platform',1),
('notification.publish.commit','notification','Notification publish commit','Resolve audience and persist delivery tasks','communications-platform',1),
('classroom.booking.commit','classroom_booking','Classroom booking commit','Check real schedule conflicts before booking','teaching-resources',1),
('lost_found.claim.commit','lost_found','Lost-and-found claim commit','Persist privacy-safe human-confirmed claim','student-services',1),
('hygiene.rectification.create','hygiene_rectification','Hygiene rectification create','Create work from inspection evidence','hygiene-operations',1),
('dorm_safety.confirm.commit','dorm_safety','Dorm safety confirmation','Persist onsite decision without punitive AI conclusion','dorm-safety',1),
('visitor.admission.approve','visitor','Visitor admission decision','Issue one-time short-lived credential after human decision','dorm-access-control',1),
('maintenance.recommendation.create','energy_maintenance','Predictive maintenance recommendation','Use quality-checked real readings only','energy-operations',1)
ON CONFLICT(id) DO UPDATE SET display_name=EXCLUDED.display_name,description=EXCLUDED.description,owner=EXCLUDED.owner,active_version=1,updated_at=now();

INSERT INTO skill_versions(skill_id,version,skill_key,input_schema,output_schema,required_permission,data_scope_policy,risk_level,approval_policy,timeout_ms,retry_policy,rate_limit,preview_policy,audit_policy,compensation_policy,eval_set,checksum,status,published_at)
SELECT seed.id,1,seed.key,seed.input_schema,'{"type":"object","required":["effectId","status","result"]}',seed.permission,
 jsonb_build_object('source','server_business_snapshot','tenant','school_id'),seed.risk,'single_approval',seed.timeout,
 '{"maxAttempts":1,"backoffMs":1000}','{"requests":20,"windowSeconds":60}','{"ttlSeconds":600}',
 jsonb_build_object('retainDays',365,'redactFields',seed.redact),jsonb_build_object('strategy',seed.compensation),
 seed.key||'.golden',encode(digest(seed.key,'sha256'),'hex'),'published',now()
FROM (VALUES
('repair.dispatch.commit','repair.dispatch.commit.v1','{"type":"object","properties":{"count":{"type":"integer","minimum":1,"maximum":50},"assignments":{"type":"array","maxItems":50}}}'::jsonb,'repair:dispatch','high',60000,'[]'::jsonb,'reassign_or_pending'),
('notification.publish.commit','notification.publish.commit.v1','{"type":"object","required":["title","content","type","audience","channels"]}'::jsonb,'notification:create','high',45000,'["content"]'::jsonb,'publish_correction'),
('classroom.booking.commit','classroom.booking.commit.v1','{"type":"object","required":["classroomId","startsAt","endsAt","purpose","attendeeCount"]}'::jsonb,'classroom:book','high',30000,'[]'::jsonb,'cancel_booking'),
('lost_found.claim.commit','lost_found.claim.commit.v1','{"type":"object","required":["itemId","claimerId","humanConfirmed","verificationEvidence"]}'::jsonb,'lost:claim','high',30000,'["verificationEvidence"]'::jsonb,'reopen_claim'),
('hygiene.rectification.create','hygiene.rectification.create.v1','{"type":"object","required":["inspectionId","assigneeId","dueAt","requirements","severity"]}'::jsonb,'duty:check','high',30000,'[]'::jsonb,'cancel_rectification'),
('dorm_safety.confirm.commit','dorm_safety.confirm.commit.v1','{"type":"object","required":["eventId","onsiteConfirmed","outcome","note"]}'::jsonb,'dorm:inspect','critical',30000,'[]'::jsonb,'human_reopen'),
('visitor.admission.approve','visitor.admission.approve.v1','{"type":"object","required":["visitorApplicationId","decision","rationale"]}'::jsonb,'visitor:check','critical',30000,'["qrToken"]'::jsonb,'revoke_credential'),
('maintenance.recommendation.create','maintenance.recommendation.create.v1','{"type":"object","required":["assetId","readingIds","recommendedAction","rationale","confidence","dueAt"]}'::jsonb,'energy:manage','high',30000,'[]'::jsonb,'withdraw_recommendation')
) seed(id,key,input_schema,permission,risk,timeout,redact,compensation)
ON CONFLICT(skill_key) DO NOTHING;

INSERT INTO skill_bindings(school_id,skill_key,role)
SELECT school.id,b.key,b.role FROM schools school CROSS JOIN (VALUES
('repair.dispatch.commit.v1','super_admin'),('repair.dispatch.commit.v1','logistics_manager'),('repair.dispatch.commit.v1','logistics_admin'),
('notification.publish.commit.v1','super_admin'),('notification.publish.commit.v1','dept_admin'),('notification.publish.commit.v1','logistics_manager'),('notification.publish.commit.v1','dorm_manager'),
('classroom.booking.commit.v1','super_admin'),('classroom.booking.commit.v1','dept_admin'),('classroom.booking.commit.v1','teacher'),('classroom.booking.commit.v1','class_committee'),
('lost_found.claim.commit.v1','super_admin'),('lost_found.claim.commit.v1','student'),('lost_found.claim.commit.v1','class_committee'),
('hygiene.rectification.create.v1','super_admin'),('hygiene.rectification.create.v1','dept_hygiene_manager'),('hygiene.rectification.create.v1','dept_hygiene_admin'),
('dorm_safety.confirm.commit.v1','super_admin'),('dorm_safety.confirm.commit.v1','dorm_manager'),('dorm_safety.confirm.commit.v1','dorm_keeper'),
('visitor.admission.approve.v1','super_admin'),('visitor.admission.approve.v1','dorm_manager'),('visitor.admission.approve.v1','dorm_keeper'),
('maintenance.recommendation.create.v1','super_admin'),('maintenance.recommendation.create.v1','dorm_manager')) b(key,role)
ON CONFLICT(school_id,skill_key,role) DO NOTHING;


-- Canonical additive domain model. Legacy rows are backfilled to the default tenant.
CREATE TABLE IF NOT EXISTS repair_orders(id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,title varchar(200) NOT NULL,damage_type varchar(100) NOT NULL DEFAULT 'OTHER',location varchar(200) NOT NULL,description text,images jsonb,reporter_id varchar(36) NOT NULL REFERENCES users(id),assignee_id varchar(36) REFERENCES users(id),status varchar(20) NOT NULL DEFAULT 'PENDING',priority varchar(20) DEFAULT 'normal',completed_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz DEFAULT now());
ALTER TABLE repair_orders ADD COLUMN IF NOT EXISTS school_id uuid;
ALTER TABLE repair_orders ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE repair_orders ADD COLUMN IF NOT EXISTS building_id uuid;
ALTER TABLE repair_orders ADD COLUMN IF NOT EXISTS assigned_at timestamptz;
ALTER TABLE repair_orders ADD COLUMN IF NOT EXISTS sla_due_at timestamptz;
ALTER TABLE repair_orders ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE repair_orders ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false;
UPDATE repair_orders SET school_id=(SELECT id FROM schools WHERE code='default-school') WHERE school_id IS NULL;
ALTER TABLE repair_orders ALTER COLUMN school_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS repair_orders_tenant_state_idx ON repair_orders(school_id,status,created_at) WHERE is_deleted=false;

CREATE TABLE IF NOT EXISTS notifications(id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,title varchar(200) NOT NULL,content text NOT NULL,type varchar(20) NOT NULL,publisher_id varchar(36) NOT NULL REFERENCES users(id),target_roles jsonb,target_departments jsonb,publish_at timestamptz,expire_at timestamptz,status varchar(20) NOT NULL DEFAULT 'draft',views integer NOT NULL DEFAULT 0,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz DEFAULT now());
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS school_id uuid;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS audience jsonb NOT NULL DEFAULT '{}';
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS channels jsonb NOT NULL DEFAULT '["platform"]';
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS audience_count integer NOT NULL DEFAULT 0;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS require_acknowledgement boolean NOT NULL DEFAULT false;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
UPDATE notifications SET school_id=(SELECT id FROM schools WHERE code='default-school') WHERE school_id IS NULL;
ALTER TABLE notifications ALTER COLUMN school_id SET NOT NULL;
CREATE TABLE IF NOT EXISTS notification_deliveries(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),school_id uuid NOT NULL REFERENCES schools(id),notification_id varchar(36) NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,recipient_user_id varchar(36) NOT NULL REFERENCES users(id),channel varchar(20) NOT NULL CHECK(channel IN('platform','email','sms','wechat')),status varchar(20) NOT NULL DEFAULT 'PENDING' CHECK(status IN('PENDING','DELIVERED','READ','ACKNOWLEDGED','FAILED','DEAD_LETTER')),attempt_count integer NOT NULL DEFAULT 0,delivered_at timestamptz,read_at timestamptz,acknowledged_at timestamptz,last_error text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(notification_id,recipient_user_id,channel));

CREATE TABLE IF NOT EXISTS classrooms(id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,campus varchar(20) NOT NULL DEFAULT '',building varchar(50) NOT NULL DEFAULT '',floor integer NOT NULL DEFAULT 1,room_number varchar(20) NOT NULL,full_name varchar(50) NOT NULL,capacity integer NOT NULL DEFAULT 60,status varchar(20) NOT NULL DEFAULT 'available',facilities jsonb,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz DEFAULT now());
ALTER TABLE classrooms ADD COLUMN IF NOT EXISTS school_id uuid;
ALTER TABLE classrooms ADD COLUMN IF NOT EXISTS campus_id uuid;
ALTER TABLE classrooms ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE classrooms ADD COLUMN IF NOT EXISTS building_id uuid;
ALTER TABLE classrooms ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
UPDATE classrooms SET school_id=(SELECT id FROM schools WHERE code='default-school') WHERE school_id IS NULL;
ALTER TABLE classrooms ALTER COLUMN school_id SET NOT NULL;
CREATE TABLE IF NOT EXISTS classroom_bookings(id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,classroom_id varchar(36) NOT NULL REFERENCES classrooms(id),applicant_id varchar(36) NOT NULL REFERENCES users(id),booking_date varchar(20),time_slot varchar(50),purpose text NOT NULL,status varchar(20) NOT NULL DEFAULT 'pending',reviewer_id varchar(36) REFERENCES users(id),review_note text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz DEFAULT now());
ALTER TABLE classroom_bookings ADD COLUMN IF NOT EXISTS school_id uuid;
ALTER TABLE classroom_bookings ADD COLUMN IF NOT EXISTS starts_at timestamptz;
ALTER TABLE classroom_bookings ADD COLUMN IF NOT EXISTS ends_at timestamptz;
ALTER TABLE classroom_bookings ADD COLUMN IF NOT EXISTS attendee_count integer;
ALTER TABLE classroom_bookings ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
UPDATE classroom_bookings SET school_id=(SELECT id FROM schools WHERE code='default-school') WHERE school_id IS NULL;
ALTER TABLE classroom_bookings ALTER COLUMN school_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS classroom_bookings_conflict_idx ON classroom_bookings(school_id,classroom_id,starts_at,ends_at) WHERE status IN('pending','approved','PENDING','APPROVED');
CREATE TABLE IF NOT EXISTS class_schedules(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),school_id uuid NOT NULL REFERENCES schools(id),classroom_id varchar(36) NOT NULL REFERENCES classrooms(id),class_id uuid REFERENCES academic_classes(id),starts_at timestamptz NOT NULL,ends_at timestamptz NOT NULL,course_name varchar(200) NOT NULL,status varchar(20) NOT NULL DEFAULT 'active' CHECK(status IN('active','cancelled')),source varchar(80) NOT NULL,source_version varchar(80),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),CHECK(ends_at>starts_at));

CREATE TABLE IF NOT EXISTS lost_found(id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,type varchar(20) NOT NULL,item_type varchar(50) NOT NULL,item_name varchar(200) NOT NULL,description text,location varchar(200),images jsonb,reporter_id varchar(36) NOT NULL REFERENCES users(id),status varchar(20) NOT NULL DEFAULT 'open',claimer_id varchar(36) REFERENCES users(id),claimed_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz DEFAULT now());
ALTER TABLE lost_found ADD COLUMN IF NOT EXISTS school_id uuid;
ALTER TABLE lost_found ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE lost_found ADD COLUMN IF NOT EXISTS claim_evidence_hash varchar(64);
ALTER TABLE lost_found ADD COLUMN IF NOT EXISTS claim_confirmed_by varchar(36);
ALTER TABLE lost_found ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
UPDATE lost_found SET school_id=(SELECT id FROM schools WHERE code='default-school') WHERE school_id IS NULL;
ALTER TABLE lost_found ALTER COLUMN school_id SET NOT NULL;

CREATE TABLE IF NOT EXISTS dormitories(id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,building_name varchar(50) NOT NULL,total_rooms integer NOT NULL,occupied_rooms integer NOT NULL DEFAULT 0,manager_id varchar(36) REFERENCES users(id),status varchar(20) NOT NULL DEFAULT 'normal',created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz DEFAULT now());
ALTER TABLE dormitories ADD COLUMN IF NOT EXISTS school_id uuid;
ALTER TABLE dormitories ADD COLUMN IF NOT EXISTS building_id uuid;
ALTER TABLE dormitories ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
UPDATE dormitories SET school_id=(SELECT id FROM schools WHERE code='default-school') WHERE school_id IS NULL;
ALTER TABLE dormitories ALTER COLUMN school_id SET NOT NULL;
CREATE TABLE IF NOT EXISTS dorm_inspections(id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,dormitory_id varchar(36) NOT NULL REFERENCES dormitories(id),room_number varchar(20) NOT NULL,inspector_id varchar(36) NOT NULL REFERENCES users(id),inspection_date varchar(40) NOT NULL,score integer NOT NULL,issues jsonb,images jsonb,notes text,created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE dorm_inspections ADD COLUMN IF NOT EXISTS school_id uuid;
ALTER TABLE dorm_inspections ADD COLUMN IF NOT EXISTS status varchar(20) NOT NULL DEFAULT 'COMPLETED';
ALTER TABLE dorm_inspections ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE dorm_inspections ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
UPDATE dorm_inspections SET school_id=(SELECT d.school_id FROM dormitories d WHERE d.id=dorm_inspections.dormitory_id) WHERE school_id IS NULL;
ALTER TABLE dorm_inspections ALTER COLUMN school_id SET NOT NULL;

CREATE TABLE IF NOT EXISTS hygiene_inspections(id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,school_id uuid NOT NULL REFERENCES schools(id),organization_id uuid REFERENCES organizations(id),building_id uuid REFERENCES buildings(id),class_id uuid REFERENCES academic_classes(id),location varchar(200) NOT NULL,inspector_id varchar(36) NOT NULL REFERENCES users(id),inspected_at timestamptz NOT NULL,deterministic_score numeric(6,2),ai_advisory_score numeric(6,2),evidence jsonb NOT NULL,status varchar(20) NOT NULL DEFAULT 'COMPLETED' CHECK(status IN('PENDING','COMPLETED','REVIEWED','DISPUTED')),version integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS hygiene_rectifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),school_id uuid NOT NULL REFERENCES schools(id),inspection_id varchar(36) NOT NULL REFERENCES hygiene_inspections(id),assignee_id varchar(36) NOT NULL REFERENCES users(id),created_by varchar(36) NOT NULL REFERENCES users(id),requirements jsonb NOT NULL,severity varchar(16) NOT NULL CHECK(severity IN('low','medium','high','critical')),due_at timestamptz NOT NULL,status varchar(24) NOT NULL DEFAULT 'OPEN' CHECK(status IN('OPEN','IN_PROGRESS','SUBMITTED','VERIFIED','ESCALATED','DISPUTED','CANCELLED')),evidence jsonb NOT NULL DEFAULT '[]',version integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE IF NOT EXISTS dorm_safety_events(id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,school_id uuid NOT NULL REFERENCES schools(id),building_id uuid NOT NULL REFERENCES buildings(id),dormitory_id varchar(36),room_number varchar(20),event_type varchar(80) NOT NULL,source varchar(40) NOT NULL CHECK(source IN('MQTT','RULE','ANOMALY_MODEL','MANUAL')),severity varchar(16) NOT NULL CHECK(severity IN('low','medium','high','critical')),observed_value jsonb NOT NULL,rule_evidence jsonb NOT NULL DEFAULT '{}',status varchar(24) NOT NULL DEFAULT 'PENDING_CONFIRMATION' CHECK(status IN('PENDING_CONFIRMATION','FALSE_ALARM','RECTIFICATION_REQUIRED','ESCALATED','RESOLVED')),confirmed_by varchar(36) REFERENCES users(id),confirmed_at timestamptz,confirmation_note text,version integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS iot_readings(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),school_id uuid NOT NULL REFERENCES schools(id),building_id uuid NOT NULL REFERENCES buildings(id),dormitory_id varchar(36),room_number varchar(20),device_id varchar(160) NOT NULL,metric varchar(80) NOT NULL,value numeric(20,6) NOT NULL,unit varchar(32) NOT NULL,quality varchar(20) NOT NULL CHECK(quality IN('valid','suspect','invalid')),observed_at timestamptz NOT NULL,source_message_id varchar(200) NOT NULL,raw_hash varchar(64) NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(school_id,source_message_id));

CREATE TABLE IF NOT EXISTS visitors(id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,dormitory_id varchar(36),room_number varchar(20) NOT NULL DEFAULT '',visitor_name varchar(100) NOT NULL,visitor_phone varchar(20),purpose varchar(200) NOT NULL,visit_time timestamptz NOT NULL,leave_time timestamptz,created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE visitors ADD COLUMN IF NOT EXISTS school_id uuid;
ALTER TABLE visitors ADD COLUMN IF NOT EXISTS building_id uuid;
ALTER TABLE visitors ADD COLUMN IF NOT EXISTS host_id varchar(36);
ALTER TABLE visitors ADD COLUMN IF NOT EXISTS applicant_id varchar(36);
ALTER TABLE visitors ADD COLUMN IF NOT EXISTS status varchar(24) NOT NULL DEFAULT 'PENDING';
ALTER TABLE visitors ADD COLUMN IF NOT EXISTS decision_by varchar(36);
ALTER TABLE visitors ADD COLUMN IF NOT EXISTS decision_at timestamptz;
ALTER TABLE visitors ADD COLUMN IF NOT EXISTS decision_rationale text;
ALTER TABLE visitors ADD COLUMN IF NOT EXISTS qr_token_hash varchar(64);
ALTER TABLE visitors ADD COLUMN IF NOT EXISTS qr_valid_from timestamptz;
ALTER TABLE visitors ADD COLUMN IF NOT EXISTS qr_valid_until timestamptz;
ALTER TABLE visitors ADD COLUMN IF NOT EXISTS qr_used_at timestamptz;
ALTER TABLE visitors ADD COLUMN IF NOT EXISTS qr_revoked_at timestamptz;
ALTER TABLE visitors ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE visitors ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
UPDATE visitors SET school_id=(SELECT id FROM schools WHERE code='default-school') WHERE school_id IS NULL;
ALTER TABLE visitors ALTER COLUMN school_id SET NOT NULL;

CREATE TABLE IF NOT EXISTS energy_assets(id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,school_id uuid NOT NULL REFERENCES schools(id),building_id uuid REFERENCES buildings(id),asset_code varchar(100) NOT NULL,name varchar(200) NOT NULL,asset_type varchar(80) NOT NULL,status varchar(20) NOT NULL DEFAULT 'active' CHECK(status IN('active','maintenance','retired')),rated_capacity numeric(20,6),metadata jsonb NOT NULL DEFAULT '{}',version integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(school_id,asset_code));
CREATE TABLE IF NOT EXISTS energy_readings(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),school_id uuid NOT NULL REFERENCES schools(id),asset_id varchar(36) NOT NULL REFERENCES energy_assets(id),metric varchar(80) NOT NULL,value numeric(20,6) NOT NULL,unit varchar(32) NOT NULL,quality varchar(20) NOT NULL CHECK(quality IN('valid','suspect','invalid')),observed_at timestamptz NOT NULL,source varchar(80) NOT NULL,source_record_id varchar(200) NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(school_id,source,source_record_id));
CREATE TABLE IF NOT EXISTS maintenance_recommendations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),school_id uuid NOT NULL REFERENCES schools(id),asset_id varchar(36) NOT NULL REFERENCES energy_assets(id),created_by varchar(36) NOT NULL REFERENCES users(id),source_reading_ids jsonb NOT NULL,recommended_action text NOT NULL,rationale text NOT NULL,confidence numeric(6,5) NOT NULL CHECK(confidence BETWEEN 0 AND 1),due_at timestamptz NOT NULL,estimated_savings_kwh numeric(20,6),data_quality jsonb NOT NULL,status varchar(24) NOT NULL DEFAULT 'DRAFT' CHECK(status IN('DRAFT','ACCEPTED','REJECTED','CONVERTED_TO_WORK_ORDER','WITHDRAWN')),version integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());


CREATE OR REPLACE FUNCTION ai_assert_skill_binding(p_school_id uuid,p_actor_id varchar,p_skill_key varchar,p_resource_scope jsonb,p_consume_rate boolean DEFAULT false)
RETURNS varchar LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE matched_role varchar(50); rate_max integer; rate_count integer; rate_window timestamptz:=date_trunc('minute',now());
BEGIN
 IF NOT EXISTS(SELECT 1 FROM users WHERE id=p_actor_id AND school_id=p_school_id AND status='active' AND is_deleted=false) THEN RAISE EXCEPTION 'skill_actor_not_active_in_tenant' USING ERRCODE='42501'; END IF;
 SELECT assignment.role INTO matched_role FROM user_role_assignments assignment
 JOIN skill_bindings binding ON binding.school_id=assignment.school_id AND binding.role=assignment.role AND binding.skill_key=p_skill_key AND binding.enabled
 WHERE assignment.school_id=p_school_id AND assignment.user_id=p_actor_id AND assignment.status='active'
 AND assignment.valid_from<=now() AND (assignment.valid_until IS NULL OR assignment.valid_until>now())
 AND (assignment.scope_type='global' OR (assignment.scope_type='school' AND assignment.scope_id=p_school_id)
  OR (assignment.scope_type='organization' AND p_resource_scope?'organizationId' AND (assignment.scope_id::text=p_resource_scope->>'organizationId' OR EXISTS(SELECT 1 FROM organization_closure c WHERE c.school_id=p_school_id AND c.ancestor_id=assignment.scope_id AND c.descendant_id::text=p_resource_scope->>'organizationId')))
  OR (assignment.scope_type='building' AND assignment.scope_id::text=p_resource_scope->>'buildingId')
  OR (assignment.scope_type='class' AND (assignment.scope_id::text=p_resource_scope->>'classId' OR p_resource_scope->>'ownerUserId'=p_actor_id))
  OR (assignment.scope_type='self' AND p_resource_scope->>'ownerUserId'=p_actor_id))
 LIMIT 1;
 IF matched_role IS NULL THEN RAISE EXCEPTION 'skill_binding_or_scope_denied' USING ERRCODE='42501'; END IF;
 IF p_consume_rate THEN
  SELECT COALESCE((rate_limit->>'requests')::integer,1) INTO rate_max FROM skill_versions WHERE skill_key=p_skill_key AND status='published';
  INSERT INTO ai_skill_rate_limit_counters(school_id,actor_id,skill_key,window_started_at,request_count) VALUES(p_school_id,p_actor_id,p_skill_key,rate_window,1)
  ON CONFLICT(school_id,actor_id,skill_key,window_started_at) DO UPDATE SET request_count=ai_skill_rate_limit_counters.request_count+1,updated_at=now() RETURNING request_count INTO rate_count;
  IF rate_count>rate_max THEN RAISE EXCEPTION 'skill_rate_limit_exceeded' USING ERRCODE='57014'; END IF;
 END IF;
 RETURN matched_role;
END $$;

CREATE OR REPLACE FUNCTION ai_prepare_skill_operation(p_school_id uuid,p_task_id uuid,p_node_id varchar,p_skill_key varchar,p_actor_id varchar,p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE preview_id uuid:=gen_random_uuid(); target jsonb; scope jsonb; view_data jsonb; versions jsonb:='{}'; input_hash varchar(64):=encode(digest(p_input::text,'sha256'),'hex'); snapshot_hash varchar(64); expiry timestamptz:=now()+interval '10 minutes'; wanted integer; found_count integer; conflict_count integer;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM ai_task_runs WHERE id=p_task_id AND school_id=p_school_id) THEN RAISE EXCEPTION 'skill_task_not_found' USING ERRCODE='P0002'; END IF;
 IF NOT EXISTS(SELECT 1 FROM ai_task_nodes WHERE task_id=p_task_id AND id=p_node_id AND school_id=p_school_id) THEN RAISE EXCEPTION 'skill_task_node_not_found' USING ERRCODE='P0002'; END IF;
 IF NOT EXISTS(SELECT 1 FROM skill_versions WHERE skill_key=p_skill_key AND status='published') THEN RAISE EXCEPTION 'skill_version_not_published' USING ERRCODE='P0002'; END IF;
 CASE p_skill_key
 WHEN 'repair.dispatch.commit.v1' THEN
  wanted:=LEAST(GREATEST(COALESCE((p_input->>'count')::integer,1),1),50);
  IF p_input?'assignments' THEN
   WITH requested AS(SELECT x->>'repairId' repair_id,x->>'assigneeId' assignee_id FROM jsonb_array_elements(p_input->'assignments') x)
   SELECT jsonb_build_object('assignments',COALESCE(jsonb_agg(jsonb_build_object('repairId',r.id,'repairVersion',r.version,'assigneeId',u.id,'repairTitle',r.title,'workerName',u.name) ORDER BY r.created_at),'[]')) INTO target
   FROM requested q JOIN repair_orders r ON r.id=q.repair_id AND r.school_id=p_school_id AND NOT r.is_deleted AND upper(r.status)='PENDING'
   JOIN users u ON u.id=q.assignee_id AND u.school_id=p_school_id AND u.role='repairman' AND u.status='active' AND NOT u.is_deleted;
   wanted:=jsonb_array_length(p_input->'assignments');
  ELSIF p_input?'repairId' THEN
   SELECT jsonb_build_object('assignments',jsonb_build_array(jsonb_build_object('repairId',r.id,'repairVersion',r.version,'assigneeId',u.id,'repairTitle',r.title,'workerName',u.name))) INTO target
   FROM repair_orders r JOIN users u ON u.id=p_input->>'assigneeId' AND u.school_id=p_school_id AND u.role='repairman' AND u.status='active' AND NOT u.is_deleted
   WHERE r.id=p_input->>'repairId' AND r.school_id=p_school_id AND NOT r.is_deleted AND upper(r.status)='PENDING'; wanted:=1;
  ELSE
   WITH repairs AS(SELECT r.*,row_number() OVER(ORDER BY CASE lower(COALESCE(r.priority,'normal')) WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 ELSE 3 END,r.created_at,r.id) seq FROM repair_orders r WHERE r.school_id=p_school_id AND NOT r.is_deleted AND upper(r.status)='PENDING' LIMIT wanted),
   workers AS(SELECT u.id,u.name,row_number() OVER(ORDER BY(SELECT count(*) FROM repair_orders w WHERE w.school_id=p_school_id AND w.assignee_id=u.id AND upper(w.status) IN('DISPATCHED','PROCESSING')),u.id) seq,count(*) OVER() total FROM users u WHERE u.school_id=p_school_id AND u.role='repairman' AND u.status='active' AND NOT u.is_deleted)
   SELECT jsonb_build_object('assignments',COALESCE(jsonb_agg(jsonb_build_object('repairId',r.id,'repairVersion',r.version,'assigneeId',w.id,'repairTitle',r.title,'workerName',w.name) ORDER BY r.seq),'[]')) INTO target FROM repairs r JOIN workers w ON w.seq=((r.seq-1)%w.total)+1;
  END IF;
  found_count:=COALESCE(jsonb_array_length(target->'assignments'),0); IF target IS NULL OR found_count<>wanted THEN RAISE EXCEPTION 'repair_dispatch_targets_or_workers_unavailable' USING ERRCODE='P0002'; END IF;
  SELECT COALESCE(jsonb_object_agg(x->>'repairId',(x->>'repairVersion')::integer),'{}') INTO versions FROM jsonb_array_elements(target->'assignments') x;
  SELECT jsonb_strip_nulls(jsonb_build_object('schoolId',p_school_id,'organizationId',((array_agg(r.organization_id) FILTER(WHERE r.organization_id IS NOT NULL))[1])::text,'buildingId',((array_agg(r.building_id) FILTER(WHERE r.building_id IS NOT NULL))[1])::text)) INTO scope FROM repair_orders r WHERE r.id IN(SELECT x->>'repairId' FROM jsonb_array_elements(target->'assignments') x);
  view_data:=jsonb_build_object('targetCount',found_count,'affectedResources',target->'assignments','stateChanges',jsonb_build_object('from','PENDING','to','DISPATCHED'),'warnings','[]'::jsonb,'outboxEvents',jsonb_build_array('repair.dispatched','repair.sla.started','notification.delivery.requested'));
 WHEN 'notification.publish.commit.v1' THEN
  SELECT count(DISTINCT u.id) INTO found_count FROM users u WHERE u.school_id=p_school_id AND u.status='active' AND NOT u.is_deleted AND (u.role IN(SELECT jsonb_array_elements_text(COALESCE(p_input#>'{audience,roles}','[]'))) OR u.id IN(SELECT jsonb_array_elements_text(COALESCE(p_input#>'{audience,userIds}','[]'))) OR u.primary_organization_id::text IN(SELECT jsonb_array_elements_text(COALESCE(p_input#>'{audience,organizationIds}','[]'))));
  IF found_count=0 THEN RAISE EXCEPTION 'notification_audience_empty' USING ERRCODE='22023'; END IF;
  target:=jsonb_build_object('audience',p_input->'audience','audienceCount',found_count,'title',p_input->>'title','contentHash',encode(digest(p_input->>'content','sha256'),'hex'));
  scope:=jsonb_build_object('schoolId',p_school_id); IF jsonb_array_length(COALESCE(p_input#>'{audience,organizationIds}','[]'))=1 THEN scope:=scope||jsonb_build_object('organizationId',p_input#>>'{audience,organizationIds,0}'); END IF;
  view_data:=jsonb_build_object('targetCount',found_count,'affectedResources',p_input->'audience','stateChanges',jsonb_build_object('from','DRAFT','to',CASE WHEN p_input?'scheduledAt' THEN 'SCHEDULED' ELSE 'PUBLISHED' END),'channels',p_input->'channels','deliveryCost',jsonb_build_object('kind','estimate_units','units',found_count*jsonb_array_length(p_input->'channels')),'warnings',CASE WHEN p_input->>'content'~*'(password|id card|bank card)' THEN jsonb_build_array('sensitive_content_detected') ELSE '[]'::jsonb END);
 WHEN 'classroom.booking.commit.v1' THEN
  SELECT jsonb_build_object('classroomId',c.id,'version',c.version,'name',c.full_name,'capacity',c.capacity,'status',c.status,'startsAt',p_input->>'startsAt','endsAt',p_input->>'endsAt') INTO target FROM classrooms c WHERE c.id=p_input->>'classroomId' AND c.school_id=p_school_id AND lower(c.status)='available';
  IF target IS NULL THEN RAISE EXCEPTION 'classroom_not_available' USING ERRCODE='P0002'; END IF; IF (target->>'capacity')::integer<(p_input->>'attendeeCount')::integer THEN RAISE EXCEPTION 'classroom_capacity_exceeded' USING ERRCODE='22023'; END IF;
  SELECT(SELECT count(*) FROM classroom_bookings b WHERE b.school_id=p_school_id AND b.classroom_id=p_input->>'classroomId' AND upper(b.status) IN('PENDING','APPROVED') AND b.starts_at<(p_input->>'endsAt')::timestamptz AND b.ends_at>(p_input->>'startsAt')::timestamptz)+(SELECT count(*) FROM class_schedules s WHERE s.school_id=p_school_id AND s.classroom_id=p_input->>'classroomId' AND s.status='active' AND s.starts_at<(p_input->>'endsAt')::timestamptz AND s.ends_at>(p_input->>'startsAt')::timestamptz) INTO conflict_count;
  IF conflict_count>0 THEN RAISE EXCEPTION 'classroom_booking_conflict' USING ERRCODE='23P01'; END IF;
  SELECT jsonb_strip_nulls(jsonb_build_object('schoolId',p_school_id,'campusId',campus_id::text,'organizationId',organization_id::text,'buildingId',building_id::text)) INTO scope FROM classrooms WHERE id=p_input->>'classroomId'; versions:=jsonb_build_object(p_input->>'classroomId',(target->>'version')::integer); view_data:=jsonb_build_object('targetCount',1,'affectedResources',jsonb_build_array(target),'stateChanges',jsonb_build_object('booking','CREATE_PENDING'),'conflictCount',0,'warnings','[]'::jsonb);
 WHEN 'lost_found.claim.commit.v1' THEN
  IF NOT COALESCE((p_input->>'humanConfirmed')::boolean,false) THEN RAISE EXCEPTION 'lost_found_human_confirmation_required' USING ERRCODE='42501'; END IF;
  SELECT jsonb_build_object('itemId',i.id,'version',i.version,'itemType',i.item_type,'itemName',i.item_name,'status',i.status,'reporterId',i.reporter_id) INTO target FROM lost_found i WHERE i.id=p_input->>'itemId' AND i.school_id=p_school_id AND lower(i.status) IN('open','matched');
  IF target IS NULL OR NOT EXISTS(SELECT 1 FROM users WHERE id=p_input->>'claimerId' AND school_id=p_school_id AND status='active' AND NOT is_deleted) THEN RAISE EXCEPTION 'lost_found_item_or_claimer_invalid' USING ERRCODE='P0002'; END IF;
  SELECT jsonb_strip_nulls(jsonb_build_object('schoolId',p_school_id,'organizationId',organization_id::text,'ownerUserId',p_input->>'claimerId')) INTO scope FROM lost_found WHERE id=p_input->>'itemId'; versions:=jsonb_build_object(p_input->>'itemId',(target->>'version')::integer); view_data:=jsonb_build_object('targetCount',1,'affectedResources',jsonb_build_array(target- 'reporterId'),'stateChanges',jsonb_build_object('from',target->>'status','to','claimed'),'warnings',jsonb_build_array('human_identity_evidence_required'));
 WHEN 'hygiene.rectification.create.v1' THEN
  SELECT jsonb_build_object('inspectionId',i.id,'version',i.version,'location',i.location,'deterministicScore',i.deterministic_score,'aiAdvisoryScore',i.ai_advisory_score,'status',i.status,'evidenceHash',encode(digest(i.evidence::text,'sha256'),'hex')) INTO target FROM hygiene_inspections i WHERE i.id=p_input->>'inspectionId' AND i.school_id=p_school_id AND i.status IN('COMPLETED','REVIEWED');
  IF target IS NULL OR NOT EXISTS(SELECT 1 FROM users WHERE id=p_input->>'assigneeId' AND school_id=p_school_id AND status='active' AND NOT is_deleted) THEN RAISE EXCEPTION 'hygiene_inspection_or_assignee_invalid' USING ERRCODE='P0002'; END IF;
  SELECT jsonb_strip_nulls(jsonb_build_object('schoolId',p_school_id,'organizationId',organization_id::text,'buildingId',building_id::text,'classId',class_id::text)) INTO scope FROM hygiene_inspections WHERE id=p_input->>'inspectionId'; versions:=jsonb_build_object(p_input->>'inspectionId',(target->>'version')::integer); view_data:=jsonb_build_object('targetCount',1,'affectedResources',jsonb_build_array(target),'stateChanges',jsonb_build_object('rectification','CREATE_OPEN'),'warnings',jsonb_build_array('ai_score_is_advisory_only'));
 WHEN 'dorm_safety.confirm.commit.v1' THEN
  IF NOT COALESCE((p_input->>'onsiteConfirmed')::boolean,false) THEN RAISE EXCEPTION 'dorm_safety_onsite_confirmation_required' USING ERRCODE='42501'; END IF;
  SELECT jsonb_build_object('eventId',e.id,'version',e.version,'eventType',e.event_type,'severity',e.severity,'status',e.status,'observedValue',e.observed_value,'ruleEvidence',e.rule_evidence) INTO target FROM dorm_safety_events e WHERE e.id=p_input->>'eventId' AND e.school_id=p_school_id AND e.status='PENDING_CONFIRMATION';
  IF target IS NULL THEN RAISE EXCEPTION 'dorm_safety_event_not_confirmable' USING ERRCODE='P0002'; END IF; SELECT jsonb_build_object('schoolId',p_school_id,'buildingId',building_id::text) INTO scope FROM dorm_safety_events WHERE id=p_input->>'eventId'; versions:=jsonb_build_object(p_input->>'eventId',(target->>'version')::integer); view_data:=jsonb_build_object('targetCount',1,'affectedResources',jsonb_build_array(target),'stateChanges',jsonb_build_object('from','PENDING_CONFIRMATION','to',upper(p_input->>'outcome')),'warnings',jsonb_build_array('human_onsite_decision','no_punitive_ai_conclusion'));
 WHEN 'visitor.admission.approve.v1' THEN
  SELECT jsonb_build_object('visitorApplicationId',v.id,'version',v.version,'visitorName',v.visitor_name,'purpose',v.purpose,'visitTime',v.visit_time,'status',v.status,'hostId',v.host_id) INTO target FROM visitors v WHERE v.id=p_input->>'visitorApplicationId' AND v.school_id=p_school_id AND upper(v.status)='PENDING'; IF target IS NULL THEN RAISE EXCEPTION 'visitor_application_not_pending' USING ERRCODE='P0002'; END IF;
  IF p_input->>'decision'='approve' AND ((p_input->>'validUntil')::timestamptz<=(p_input->>'validFrom')::timestamptz OR (p_input->>'validUntil')::timestamptz>(p_input->>'validFrom')::timestamptz+interval '12 hours') THEN RAISE EXCEPTION 'visitor_qr_validity_invalid' USING ERRCODE='22023'; END IF;
  SELECT jsonb_strip_nulls(jsonb_build_object('schoolId',p_school_id,'buildingId',building_id::text,'ownerUserId',target->>'hostId')) INTO scope FROM visitors WHERE id=p_input->>'visitorApplicationId'; versions:=jsonb_build_object(p_input->>'visitorApplicationId',(target->>'version')::integer); view_data:=jsonb_build_object('targetCount',1,'affectedResources',jsonb_build_array(target-'hostId'),'stateChanges',jsonb_build_object('from','PENDING','to',upper(p_input->>'decision')),'warnings',CASE WHEN p_input->>'decision'='approve' THEN jsonb_build_array('one_time_qr_will_be_issued') ELSE '[]'::jsonb END);
 WHEN 'maintenance.recommendation.create.v1' THEN
  SELECT count(*) INTO found_count FROM energy_readings r WHERE r.school_id=p_school_id AND r.asset_id=p_input->>'assetId' AND r.quality='valid' AND r.id IN(SELECT value::uuid FROM jsonb_array_elements_text(p_input->'readingIds') value); IF found_count<>jsonb_array_length(p_input->'readingIds') OR found_count<3 THEN RAISE EXCEPTION 'maintenance_real_quality_readings_required' USING ERRCODE='22023'; END IF;
  SELECT jsonb_build_object('assetId',a.id,'version',a.version,'assetCode',a.asset_code,'assetName',a.name,'assetType',a.asset_type,'status',a.status,'readingCount',found_count,'readingIdsHash',encode(digest((p_input->'readingIds')::text,'sha256'),'hex'),'observedFrom',min(r.observed_at),'observedTo',max(r.observed_at),'minimum',min(r.value),'maximum',max(r.value)) INTO target FROM energy_assets a JOIN energy_readings r ON r.asset_id=a.id AND r.school_id=a.school_id WHERE a.id=p_input->>'assetId' AND a.school_id=p_school_id AND a.status='active' AND r.quality='valid' AND r.id IN(SELECT value::uuid FROM jsonb_array_elements_text(p_input->'readingIds') value) GROUP BY a.id;
  IF target IS NULL THEN RAISE EXCEPTION 'maintenance_asset_or_readings_unavailable' USING ERRCODE='P0002'; END IF; SELECT jsonb_strip_nulls(jsonb_build_object('schoolId',p_school_id,'buildingId',building_id::text)) INTO scope FROM energy_assets WHERE id=p_input->>'assetId'; versions:=jsonb_build_object(p_input->>'assetId',(target->>'version')::integer); view_data:=jsonb_build_object('targetCount',1,'affectedResources',jsonb_build_array(target),'stateChanges',jsonb_build_object('recommendation','CREATE_DRAFT'),'warnings',jsonb_build_array('recommendation_is_advisory','no_random_or_synthetic_curve'));
 ELSE RAISE EXCEPTION 'skill_not_bound_to_explicit_domain_adapter' USING ERRCODE='0A000'; END CASE;
 PERFORM ai_assert_skill_binding(p_school_id,p_actor_id,p_skill_key,scope,true); snapshot_hash:=encode(digest(target::text,'sha256'),'hex');
 INSERT INTO skill_operation_previews(id,school_id,task_id,node_id,skill_key,actor_id,input,input_hash,resource_scope,target_snapshot,snapshot_hash,expected_versions,preview,status,expires_at)
 VALUES(preview_id,p_school_id,p_task_id,p_node_id,p_skill_key,p_actor_id,p_input,input_hash,scope,target,snapshot_hash,versions,view_data,'PREPARED',expiry)
 ON CONFLICT(school_id,task_id,node_id,snapshot_hash) DO UPDATE SET input=EXCLUDED.input,input_hash=EXCLUDED.input_hash,preview=EXCLUDED.preview,expected_versions=EXCLUDED.expected_versions,status='PREPARED',expires_at=EXCLUDED.expires_at RETURNING id INTO preview_id;
 INSERT INTO ai_tool_invocations(school_id,task_id,node_id,skill_id,idempotency_key,status,request,response,started_at,completed_at) VALUES(p_school_id,p_task_id,p_node_id,p_skill_key,p_task_id::text||':'||p_node_id||':prepare:'||snapshot_hash,'PREPARED',p_input,jsonb_build_object('previewId',preview_id,'snapshotHash',snapshot_hash),now(),now()) ON CONFLICT(school_id,idempotency_key) DO NOTHING;
 INSERT INTO ai_audit_events(school_id,task_id,node_id,actor_type,actor_id,event_type,metadata) VALUES(p_school_id,p_task_id,p_node_id,'user',p_actor_id,'skill.operation.prepared',jsonb_build_object('skillKey',p_skill_key,'previewId',preview_id,'snapshotHash',snapshot_hash));
 RETURN jsonb_build_object('previewId',preview_id,'skillKey',p_skill_key,'input',p_input,'inputHash',input_hash,'snapshotHash',snapshot_hash,'resourceScope',scope,'targetSnapshot',target,'expectedVersions',versions,'preview',view_data,'expiresAt',expiry);
END $$;


CREATE OR REPLACE FUNCTION ai_commit_skill_operation(p_school_id uuid,p_task_id uuid,p_node_id varchar,p_preview_id uuid,p_skill_key varchar,p_actor_id varchar,p_idempotency_key varchar)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE prepared skill_operation_previews%ROWTYPE; old_effect ai_business_effects%ROWTYPE; approval varchar(24); needed integer; approvals integer; effect_id uuid:=gen_random_uuid(); target_type varchar(100); target_id varchar(160); before_data jsonb; after_data jsonb; result_data jsonb; safe_result jsonb; changed integer; created_id varchar(160); qr_secret varchar(160);
BEGIN
 SELECT * INTO old_effect FROM ai_business_effects WHERE school_id=p_school_id AND idempotency_key=p_idempotency_key;
 IF FOUND THEN RETURN jsonb_build_object('effectId',old_effect.id,'targetType',old_effect.target_type,'targetId',old_effect.target_id,'status',old_effect.status,'idempotentReplay',true,'result',COALESCE(old_effect.after_value,'{}'),'verification',old_effect.verification); END IF;
 SELECT * INTO prepared FROM skill_operation_previews WHERE id=p_preview_id AND school_id=p_school_id AND task_id=p_task_id AND node_id=p_node_id AND skill_key=p_skill_key FOR UPDATE;
 IF NOT FOUND OR prepared.status<>'PREPARED' OR prepared.expires_at<=now() THEN RAISE EXCEPTION 'skill_preview_missing_consumed_or_expired' USING ERRCODE='40001'; END IF;
 IF prepared.actor_id<>p_actor_id THEN RAISE EXCEPTION 'skill_preview_actor_mismatch' USING ERRCODE='42501'; END IF;
 PERFORM ai_assert_skill_binding(p_school_id,p_actor_id,p_skill_key,prepared.resource_scope,false);
 SELECT approval_policy INTO approval FROM skill_versions WHERE skill_key=p_skill_key AND status='published'; needed:=CASE approval WHEN 'dual_approval' THEN 2 WHEN 'single_approval' THEN 1 ELSE 0 END;
 IF p_skill_key='repair.dispatch.commit.v1' AND jsonb_array_length(prepared.target_snapshot->'assignments')>10 THEN needed:=2; END IF;
 IF p_skill_key='notification.publish.commit.v1' AND (prepared.target_snapshot->>'audienceCount')::integer>500 THEN needed:=2; END IF;
 IF needed>0 THEN SELECT count(DISTINCT d.user_id) INTO approvals FROM ai_approval_requests r JOIN ai_approval_decisions d ON d.approval_request_id=r.id AND d.decision='APPROVED' WHERE r.task_id=p_task_id AND r.school_id=p_school_id AND r.status='APPROVED'; IF approvals<needed THEN RAISE EXCEPTION 'skill_approval_not_satisfied' USING ERRCODE='42501'; END IF; END IF;
 CASE p_skill_key
 WHEN 'repair.dispatch.commit.v1' THEN
  before_data:=prepared.target_snapshot;
  UPDATE repair_orders r SET assignee_id=x->>'assigneeId',status='DISPATCHED',assigned_at=now(),sla_due_at=COALESCE(r.sla_due_at,now()+CASE lower(COALESCE(r.priority,'normal')) WHEN 'urgent' THEN interval '2 hours' ELSE interval '24 hours' END),version=r.version+1,updated_at=now()
  FROM jsonb_array_elements(prepared.target_snapshot->'assignments') x WHERE r.id=x->>'repairId' AND r.school_id=p_school_id AND r.version=(x->>'repairVersion')::integer AND upper(r.status)='PENDING' AND NOT r.is_deleted
  AND EXISTS(SELECT 1 FROM users u WHERE u.id=x->>'assigneeId' AND u.school_id=p_school_id AND u.role='repairman' AND u.status='active' AND NOT u.is_deleted);
  GET DIAGNOSTICS changed=ROW_COUNT; IF changed<>jsonb_array_length(prepared.target_snapshot->'assignments') THEN RAISE EXCEPTION 'skill_target_version_or_state_changed' USING ERRCODE='40001'; END IF;
  target_type:='repair_order'; target_id:=CASE WHEN changed=1 THEN prepared.target_snapshot#>>'{assignments,0,repairId}' ELSE NULL END; after_data:=jsonb_build_object('assignments',prepared.target_snapshot->'assignments','dispatched',changed,'state','DISPATCHED'); result_data:=after_data;
 WHEN 'notification.publish.commit.v1' THEN
  created_id:=gen_random_uuid()::text;
  INSERT INTO notifications(id,school_id,title,content,type,publisher_id,audience,channels,audience_count,require_acknowledgement,publish_at,status,version,created_at,updated_at)
  VALUES(created_id,p_school_id,prepared.input->>'title',prepared.input->>'content',prepared.input->>'type',p_actor_id,prepared.input->'audience',prepared.input->'channels',(prepared.target_snapshot->>'audienceCount')::integer,COALESCE((prepared.input->>'requireAcknowledgement')::boolean,false),COALESCE((prepared.input->>'scheduledAt')::timestamptz,now()),CASE WHEN prepared.input?'scheduledAt' THEN 'SCHEDULED' ELSE 'PUBLISHED' END,1,now(),now());
  INSERT INTO notification_deliveries(school_id,notification_id,recipient_user_id,channel)
  SELECT p_school_id,created_id,u.id,ch.value FROM users u CROSS JOIN LATERAL jsonb_array_elements_text(prepared.input->'channels') ch(value)
  WHERE u.school_id=p_school_id AND u.status='active' AND NOT u.is_deleted AND (u.role IN(SELECT jsonb_array_elements_text(COALESCE(prepared.input#>'{audience,roles}','[]'))) OR u.id IN(SELECT jsonb_array_elements_text(COALESCE(prepared.input#>'{audience,userIds}','[]'))) OR u.primary_organization_id::text IN(SELECT jsonb_array_elements_text(COALESCE(prepared.input#>'{audience,organizationIds}','[]'))));
  GET DIAGNOSTICS changed=ROW_COUNT; IF changed<>(prepared.target_snapshot->>'audienceCount')::integer*jsonb_array_length(prepared.input->'channels') THEN RAISE EXCEPTION 'notification_audience_changed_after_preview' USING ERRCODE='40001'; END IF;
  target_type:='notification';target_id:=created_id;before_data:=jsonb_build_object('state','DRAFT');after_data:=jsonb_build_object('notificationId',created_id,'audienceCount',prepared.target_snapshot->'audienceCount','deliveryTasks',changed,'status',CASE WHEN prepared.input?'scheduledAt' THEN 'SCHEDULED' ELSE 'PUBLISHED' END);result_data:=after_data;
 WHEN 'classroom.booking.commit.v1' THEN
  PERFORM 1 FROM classrooms c WHERE c.id=prepared.input->>'classroomId' AND c.school_id=p_school_id AND c.version=(prepared.target_snapshot->>'version')::integer AND lower(c.status)='available' FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'skill_target_version_or_state_changed' USING ERRCODE='40001'; END IF;
  SELECT(SELECT count(*) FROM classroom_bookings b WHERE b.school_id=p_school_id AND b.classroom_id=prepared.input->>'classroomId' AND upper(b.status) IN('PENDING','APPROVED') AND b.starts_at<(prepared.input->>'endsAt')::timestamptz AND b.ends_at>(prepared.input->>'startsAt')::timestamptz)+(SELECT count(*) FROM class_schedules s WHERE s.school_id=p_school_id AND s.classroom_id=prepared.input->>'classroomId' AND s.status='active' AND s.starts_at<(prepared.input->>'endsAt')::timestamptz AND s.ends_at>(prepared.input->>'startsAt')::timestamptz) INTO changed;
  IF changed>0 THEN RAISE EXCEPTION 'classroom_booking_conflict_after_preview' USING ERRCODE='23P01'; END IF; created_id:=gen_random_uuid()::text;
  INSERT INTO classroom_bookings(id,school_id,classroom_id,applicant_id,starts_at,ends_at,booking_date,time_slot,purpose,attendee_count,status,version,created_at,updated_at)
  VALUES(created_id,p_school_id,prepared.input->>'classroomId',p_actor_id,(prepared.input->>'startsAt')::timestamptz,(prepared.input->>'endsAt')::timestamptz,to_char((prepared.input->>'startsAt')::timestamptz,'YYYY-MM-DD'),to_char((prepared.input->>'startsAt')::timestamptz,'HH24:MI')||'-'||to_char((prepared.input->>'endsAt')::timestamptz,'HH24:MI'),prepared.input->>'purpose',(prepared.input->>'attendeeCount')::integer,'PENDING',1,now(),now());
  target_type:='classroom_booking';target_id:=created_id;before_data:=prepared.target_snapshot;after_data:=jsonb_build_object('bookingId',created_id,'classroomId',prepared.input->>'classroomId','status','PENDING','startsAt',prepared.input->>'startsAt','endsAt',prepared.input->>'endsAt');result_data:=after_data;
 WHEN 'lost_found.claim.commit.v1' THEN
  before_data:=prepared.target_snapshot; UPDATE lost_found i SET status='claimed',claimer_id=prepared.input->>'claimerId',claimed_at=now(),claim_evidence_hash=encode(digest(prepared.input->>'verificationEvidence','sha256'),'hex'),claim_confirmed_by=p_actor_id,version=i.version+1,updated_at=now()
  WHERE i.id=prepared.input->>'itemId' AND i.school_id=p_school_id AND i.version=(prepared.target_snapshot->>'version')::integer AND lower(i.status) IN('open','matched'); GET DIAGNOSTICS changed=ROW_COUNT; IF changed<>1 THEN RAISE EXCEPTION 'skill_target_version_or_state_changed' USING ERRCODE='40001'; END IF;
  target_type:='lost_found_item';target_id:=prepared.input->>'itemId';after_data:=jsonb_build_object('itemId',target_id,'claimerId',prepared.input->>'claimerId','status','claimed','humanConfirmedBy',p_actor_id);result_data:=after_data;
 WHEN 'hygiene.rectification.create.v1' THEN
  PERFORM 1 FROM hygiene_inspections i WHERE i.id=prepared.input->>'inspectionId' AND i.school_id=p_school_id AND i.version=(prepared.target_snapshot->>'version')::integer AND i.status IN('COMPLETED','REVIEWED') FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'skill_target_version_or_state_changed' USING ERRCODE='40001'; END IF;
  created_id:=gen_random_uuid()::text; INSERT INTO hygiene_rectifications(id,school_id,inspection_id,assignee_id,created_by,requirements,severity,due_at,status) VALUES(created_id::uuid,p_school_id,prepared.input->>'inspectionId',prepared.input->>'assigneeId',p_actor_id,prepared.input->'requirements',prepared.input->>'severity',(prepared.input->>'dueAt')::timestamptz,'OPEN');
  target_type:='hygiene_rectification';target_id:=created_id;before_data:=prepared.target_snapshot;after_data:=jsonb_build_object('rectificationId',created_id,'inspectionId',prepared.input->>'inspectionId','assigneeId',prepared.input->>'assigneeId','status','OPEN','dueAt',prepared.input->>'dueAt','scorePolicy','deterministic_authoritative_ai_advisory');result_data:=after_data;
 WHEN 'dorm_safety.confirm.commit.v1' THEN
  before_data:=prepared.target_snapshot; UPDATE dorm_safety_events e SET status=CASE prepared.input->>'outcome' WHEN 'false_alarm' THEN 'FALSE_ALARM' WHEN 'rectification_required' THEN 'RECTIFICATION_REQUIRED' ELSE 'ESCALATED' END,confirmed_by=p_actor_id,confirmed_at=now(),confirmation_note=prepared.input->>'note',version=e.version+1,updated_at=now()
  WHERE e.id=prepared.input->>'eventId' AND e.school_id=p_school_id AND e.version=(prepared.target_snapshot->>'version')::integer AND e.status='PENDING_CONFIRMATION'; GET DIAGNOSTICS changed=ROW_COUNT; IF changed<>1 THEN RAISE EXCEPTION 'skill_target_version_or_state_changed' USING ERRCODE='40001'; END IF;
  target_type:='dorm_safety_event';target_id:=prepared.input->>'eventId';after_data:=jsonb_build_object('eventId',target_id,'status',CASE prepared.input->>'outcome' WHEN 'false_alarm' THEN 'FALSE_ALARM' WHEN 'rectification_required' THEN 'RECTIFICATION_REQUIRED' ELSE 'ESCALATED' END,'onsiteConfirmedBy',p_actor_id,'punitiveConclusion',false);result_data:=after_data;
 WHEN 'visitor.admission.approve.v1' THEN
  before_data:=prepared.target_snapshot;
  IF prepared.input->>'decision'='approve' THEN qr_secret:=encode(gen_random_bytes(32),'hex'); UPDATE visitors v SET status='APPROVED',decision_by=p_actor_id,decision_at=now(),decision_rationale=prepared.input->>'rationale',qr_token_hash=encode(digest(qr_secret,'sha256'),'hex'),qr_valid_from=(prepared.input->>'validFrom')::timestamptz,qr_valid_until=(prepared.input->>'validUntil')::timestamptz,qr_used_at=NULL,qr_revoked_at=NULL,version=v.version+1,updated_at=now() WHERE v.id=prepared.input->>'visitorApplicationId' AND v.school_id=p_school_id AND v.version=(prepared.target_snapshot->>'version')::integer AND upper(v.status)='PENDING';
  ELSE UPDATE visitors v SET status='REJECTED',decision_by=p_actor_id,decision_at=now(),decision_rationale=prepared.input->>'rationale',qr_token_hash=NULL,qr_valid_from=NULL,qr_valid_until=NULL,version=v.version+1,updated_at=now() WHERE v.id=prepared.input->>'visitorApplicationId' AND v.school_id=p_school_id AND v.version=(prepared.target_snapshot->>'version')::integer AND upper(v.status)='PENDING'; END IF;
  GET DIAGNOSTICS changed=ROW_COUNT; IF changed<>1 THEN RAISE EXCEPTION 'skill_target_version_or_state_changed' USING ERRCODE='40001'; END IF; target_type:='visitor_application';target_id:=prepared.input->>'visitorApplicationId';after_data:=jsonb_strip_nulls(jsonb_build_object('visitorApplicationId',target_id,'status',CASE prepared.input->>'decision' WHEN 'approve' THEN 'APPROVED' ELSE 'REJECTED' END,'credentialOneTime',prepared.input->>'decision'='approve','validUntil',prepared.input->>'validUntil'));result_data:=after_data||CASE WHEN qr_secret IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('qrToken',qr_secret) END;
 WHEN 'maintenance.recommendation.create.v1' THEN
  SELECT count(*) INTO changed FROM energy_readings r WHERE r.school_id=p_school_id AND r.asset_id=prepared.input->>'assetId' AND r.quality='valid' AND r.id IN(SELECT value::uuid FROM jsonb_array_elements_text(prepared.input->'readingIds') value); IF changed<>jsonb_array_length(prepared.input->'readingIds') OR changed<3 THEN RAISE EXCEPTION 'maintenance_readings_changed_after_preview' USING ERRCODE='40001'; END IF;
  PERFORM 1 FROM energy_assets a WHERE a.id=prepared.input->>'assetId' AND a.school_id=p_school_id AND a.version=(prepared.target_snapshot->>'version')::integer AND a.status='active' FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'skill_target_version_or_state_changed' USING ERRCODE='40001'; END IF; created_id:=gen_random_uuid()::text;
  INSERT INTO maintenance_recommendations(id,school_id,asset_id,created_by,source_reading_ids,recommended_action,rationale,confidence,due_at,estimated_savings_kwh,data_quality,status) VALUES(created_id::uuid,p_school_id,prepared.input->>'assetId',p_actor_id,prepared.input->'readingIds',prepared.input->>'recommendedAction',prepared.input->>'rationale',(prepared.input->>'confidence')::numeric,(prepared.input->>'dueAt')::timestamptz,(prepared.input->>'estimatedSavingsKwh')::numeric,jsonb_build_object('validReadingCount',changed,'source','real_energy_readings','synthetic',false),'DRAFT');
  target_type:='maintenance_recommendation';target_id:=created_id;before_data:=prepared.target_snapshot;after_data:=jsonb_build_object('recommendationId',created_id,'assetId',prepared.input->>'assetId','status','DRAFT','validReadingCount',changed,'advisory',true,'syntheticData',false);result_data:=after_data;
 ELSE RAISE EXCEPTION 'skill_not_bound_to_explicit_domain_adapter' USING ERRCODE='0A000'; END CASE;
 safe_result:=result_data-'qrToken';
 INSERT INTO ai_business_effects(id,school_id,task_id,node_id,effect_type,target_type,target_id,idempotency_key,status,before_value,after_value,applied_at) VALUES(effect_id,p_school_id,p_task_id,p_node_id,p_skill_key,target_type,target_id,p_idempotency_key,'APPLIED',before_data,safe_result,now());
 UPDATE skill_operation_previews SET status='CONSUMED',consumed_at=now() WHERE id=p_preview_id;
 INSERT INTO ai_tool_invocations(school_id,task_id,node_id,skill_id,idempotency_key,status,request,response,started_at,completed_at) VALUES(p_school_id,p_task_id,p_node_id,p_skill_key,p_idempotency_key||':commit','SUCCEEDED',jsonb_build_object('previewId',p_preview_id,'inputHash',prepared.input_hash),safe_result,now(),now()) ON CONFLICT(school_id,idempotency_key) DO UPDATE SET status='SUCCEEDED',response=EXCLUDED.response,completed_at=now(),updated_at=now();
 INSERT INTO ai_audit_events(school_id,task_id,node_id,actor_type,actor_id,event_type,metadata) VALUES(p_school_id,p_task_id,p_node_id,'user',p_actor_id,'skill.operation.committed',jsonb_build_object('skillKey',p_skill_key,'effectId',effect_id,'targetType',target_type,'targetId',target_id));
 INSERT INTO ai_outbox_events(school_id,aggregate_type,aggregate_id,event_type,deduplication_key,payload) VALUES(p_school_id,target_type,COALESCE(target_id,effect_id::text),replace(p_skill_key,'.v1','')||'.applied',p_idempotency_key,jsonb_build_object('effectId',effect_id,'skillKey',p_skill_key,'targetType',target_type,'targetId',target_id,'result',safe_result));
 RETURN jsonb_build_object('effectId',effect_id,'targetType',target_type,'targetId',target_id,'status','APPLIED','idempotentReplay',false,'result',result_data);
END $$;


CREATE OR REPLACE FUNCTION ai_verify_skill_effect(p_school_id uuid,p_effect_id uuid,p_actor_id varchar)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE effect ai_business_effects%ROWTYPE; ok boolean:=false; evidence jsonb; matched integer; expected integer; effect_scope jsonb;
BEGIN
 SELECT * INTO effect FROM ai_business_effects WHERE id=p_effect_id AND school_id=p_school_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'skill_effect_not_found' USING ERRCODE='P0002'; END IF;
 IF effect.status='VERIFIED' THEN RETURN jsonb_build_object('effectId',effect.id,'targetType',effect.target_type,'targetId',effect.target_id,'status','VERIFIED','idempotentReplay',true,'result',effect.after_value,'verification',effect.verification); END IF;
 SELECT resource_scope INTO effect_scope FROM skill_operation_previews WHERE school_id=p_school_id AND task_id=effect.task_id AND node_id=effect.node_id AND skill_key=effect.effect_type AND status='CONSUMED' ORDER BY consumed_at DESC LIMIT 1;
 PERFORM ai_assert_skill_binding(p_school_id,p_actor_id,effect.effect_type,COALESCE(effect_scope,jsonb_build_object('schoolId',p_school_id)),false);
 CASE effect.effect_type
 WHEN 'repair.dispatch.commit.v1' THEN
  expected:=COALESCE((effect.after_value->>'dispatched')::integer,0); SELECT count(*) INTO matched FROM jsonb_array_elements(effect.after_value->'assignments') x JOIN repair_orders r ON r.id=x->>'repairId' AND r.school_id=p_school_id WHERE upper(r.status)='DISPATCHED' AND r.assignee_id=x->>'assigneeId' AND NOT r.is_deleted; ok:=matched=expected; evidence:=jsonb_build_object('verified',ok,'expected',expected,'matched',matched,'source','repair_orders');
 WHEN 'notification.publish.commit.v1' THEN
  SELECT count(*) INTO matched FROM notification_deliveries d WHERE d.school_id=p_school_id AND d.notification_id=effect.target_id; expected:=COALESCE((effect.after_value->>'deliveryTasks')::integer,-1); ok:=EXISTS(SELECT 1 FROM notifications WHERE id=effect.target_id AND school_id=p_school_id AND status IN('PUBLISHED','SCHEDULED')) AND matched=expected; evidence:=jsonb_build_object('verified',ok,'expectedDeliveryTasks',expected,'persistedDeliveryTasks',matched,'deliveryClaimed',false);
 WHEN 'classroom.booking.commit.v1' THEN ok:=EXISTS(SELECT 1 FROM classroom_bookings WHERE id=effect.target_id AND school_id=p_school_id AND upper(status)='PENDING' AND starts_at IS NOT NULL AND ends_at>starts_at); evidence:=jsonb_build_object('verified',ok,'source','classroom_bookings');
 WHEN 'lost_found.claim.commit.v1' THEN ok:=EXISTS(SELECT 1 FROM lost_found WHERE id=effect.target_id AND school_id=p_school_id AND lower(status)='claimed' AND claimer_id=effect.after_value->>'claimerId' AND claim_evidence_hash IS NOT NULL AND claim_confirmed_by IS NOT NULL); evidence:=jsonb_build_object('verified',ok,'source','lost_found','privateEvidenceExposed',false);
 WHEN 'hygiene.rectification.create.v1' THEN ok:=EXISTS(SELECT 1 FROM hygiene_rectifications WHERE id=effect.target_id::uuid AND school_id=p_school_id AND status='OPEN'); evidence:=jsonb_build_object('verified',ok,'source','hygiene_rectifications','aiScoreAuthoritative',false);
 WHEN 'dorm_safety.confirm.commit.v1' THEN ok:=EXISTS(SELECT 1 FROM dorm_safety_events WHERE id=effect.target_id AND school_id=p_school_id AND status=effect.after_value->>'status' AND confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL); evidence:=jsonb_build_object('verified',ok,'source','dorm_safety_events','humanOnsiteConfirmed',true,'punitiveConclusion',false);
 WHEN 'visitor.admission.approve.v1' THEN ok:=EXISTS(SELECT 1 FROM visitors WHERE id=effect.target_id AND school_id=p_school_id AND status=effect.after_value->>'status' AND (status='REJECTED' OR(qr_token_hash IS NOT NULL AND qr_valid_until>qr_valid_from AND qr_valid_until<=qr_valid_from+interval '12 hours' AND qr_used_at IS NULL))); evidence:=jsonb_build_object('verified',ok,'source','visitors','credentialOneTime',effect.after_value->'credentialOneTime','rawTokenPersistedInAudit',false);
 WHEN 'maintenance.recommendation.create.v1' THEN ok:=EXISTS(SELECT 1 FROM maintenance_recommendations WHERE id=effect.target_id::uuid AND school_id=p_school_id AND status='DRAFT' AND data_quality->>'source'='real_energy_readings' AND COALESCE((data_quality->>'synthetic')::boolean,true)=false); evidence:=jsonb_build_object('verified',ok,'source','maintenance_recommendations','advisory',true,'syntheticData',false);
 ELSE RAISE EXCEPTION 'skill_effect_has_unknown_adapter' USING ERRCODE='0A000'; END CASE;
 IF NOT ok THEN UPDATE ai_business_effects SET status='FAILED',verification=evidence,updated_at=now() WHERE id=effect.id; RAISE EXCEPTION 'skill_business_readback_failed' USING ERRCODE='40001'; END IF;
 UPDATE ai_business_effects SET status='VERIFIED',verification=evidence,verified_at=now(),updated_at=now() WHERE id=effect.id;
 INSERT INTO ai_audit_events(school_id,task_id,node_id,actor_type,actor_id,event_type,metadata) VALUES(p_school_id,effect.task_id,effect.node_id,'system',p_actor_id,'skill.operation.verified',jsonb_build_object('skillKey',effect.effect_type,'effectId',effect.id,'verification',evidence));
 RETURN jsonb_build_object('effectId',effect.id,'targetType',effect.target_type,'targetId',effect.target_id,'status','VERIFIED','idempotentReplay',false,'result',effect.after_value,'verification',evidence);
END $$;

ALTER TABLE skill_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE skill_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE skill_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE skill_eval_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE skill_operation_previews ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_skill_rate_limit_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE dormitories ENABLE ROW LEVEL SECURITY;
ALTER TABLE dorm_inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE hygiene_inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE hygiene_rectifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE dorm_safety_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE iot_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE energy_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE energy_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE repair_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE classrooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE classroom_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE lost_found ENABLE ROW LEVEL SECURITY;
ALTER TABLE visitors ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON skill_definitions,skill_versions,skill_bindings,skill_eval_results,skill_operation_previews,ai_skill_rate_limit_counters FROM PUBLIC,anon,authenticated;
REVOKE ALL ON dormitories,dorm_inspections,notification_deliveries,class_schedules,hygiene_inspections,hygiene_rectifications,dorm_safety_events,iot_readings,energy_assets,energy_readings,maintenance_recommendations FROM PUBLIC,anon,authenticated;
REVOKE INSERT,UPDATE,DELETE ON repair_orders,notifications,classrooms,classroom_bookings,lost_found,visitors FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION prevent_published_skill_version_mutation() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION ai_assert_skill_binding(uuid,varchar,varchar,jsonb,boolean) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION ai_prepare_skill_operation(uuid,uuid,varchar,varchar,varchar,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION ai_commit_skill_operation(uuid,uuid,varchar,uuid,varchar,varchar,varchar) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION ai_verify_skill_effect(uuid,uuid,varchar) FROM PUBLIC,anon,authenticated;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
 GRANT EXECUTE ON FUNCTION ai_prepare_skill_operation(uuid,uuid,varchar,varchar,varchar,jsonb) TO service_role;
 GRANT EXECUTE ON FUNCTION ai_commit_skill_operation(uuid,uuid,varchar,uuid,varchar,varchar,varchar) TO service_role;
 GRANT EXECUTE ON FUNCTION ai_verify_skill_effect(uuid,uuid,varchar) TO service_role;
END IF; END $$;
