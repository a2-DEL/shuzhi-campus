-- Enterprise identity, tenancy, role scope, delegation and revocable session foundation.
-- This migration is deliberately fail-closed: anonymous users receive no table access.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS schools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(32) NOT NULL UNIQUE,
  name varchar(160) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  timezone varchar(64) NOT NULL DEFAULT 'Asia/Shanghai',
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS campuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  code varchar(32) NOT NULL,
  name varchar(160) NOT NULL,
  address text,
  status varchar(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, code)
);

CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  campus_id uuid REFERENCES campuses(id) ON DELETE RESTRICT,
  parent_id uuid REFERENCES organizations(id) ON DELETE RESTRICT,
  code varchar(64) NOT NULL,
  name varchar(160) NOT NULL,
  type varchar(32) NOT NULL CHECK (type IN ('school', 'campus', 'college', 'department', 'service_center', 'class_group', 'other')),
  status varchar(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, code),
  CHECK (parent_id IS NULL OR parent_id <> id)
);

CREATE TABLE IF NOT EXISTS organization_closure (
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  ancestor_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  descendant_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  depth integer NOT NULL CHECK (depth >= 0),
  PRIMARY KEY (ancestor_id, descendant_id)
);

CREATE TABLE IF NOT EXISTS academic_classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  code varchar(64) NOT NULL,
  name varchar(160) NOT NULL,
  grade_year integer,
  status varchar(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'graduated', 'disabled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, code)
);

CREATE TABLE IF NOT EXISTS buildings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  campus_id uuid REFERENCES campuses(id) ON DELETE RESTRICT,
  organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT,
  code varchar(64) NOT NULL,
  name varchar(160) NOT NULL,
  type varchar(32) NOT NULL DEFAULT 'other' CHECK (type IN ('teaching', 'dormitory', 'office', 'logistics', 'other')),
  status varchar(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, code)
);

CREATE TABLE IF NOT EXISTS users (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id varchar(50) NOT NULL UNIQUE,
  name varchar(128) NOT NULL,
  password_hash varchar(255) NOT NULL,
  role varchar(50) NOT NULL DEFAULT 'student',
  department varchar(100),
  class_name varchar(100),
  phone varchar(20),
  email varchar(255),
  avatar varchar(500),
  status varchar(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  wechat_openid varchar(100),
  wechat_unionid varchar(100),
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS users_role_idx ON users (role);
CREATE INDEX IF NOT EXISTS users_department_idx ON users (department);

INSERT INTO schools (code, name)
VALUES ('default-school', 'Default School')
ON CONFLICT (code) DO NOTHING;

INSERT INTO organizations (school_id, code, name, type)
SELECT id, 'root', name, 'school'
FROM schools
WHERE code = 'default-school'
ON CONFLICT (school_id, code) DO NOTHING;

INSERT INTO organization_closure (school_id, ancestor_id, descendant_id, depth)
SELECT school_id, id, id, 0
FROM organizations
WHERE code = 'root'
ON CONFLICT (ancestor_id, descendant_id) DO NOTHING;

ALTER TABLE users ADD COLUMN IF NOT EXISTS school_id uuid;
ALTER TABLE users ADD COLUMN IF NOT EXISTS primary_organization_id uuid;
ALTER TABLE users ADD COLUMN IF NOT EXISTS primary_campus_id uuid;
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_version integer NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

UPDATE users
SET school_id = (SELECT id FROM schools WHERE code = 'default-school')
WHERE school_id IS NULL;

UPDATE users
SET primary_organization_id = (
  SELECT id FROM organizations
  WHERE school_id = users.school_id AND code = 'root'
  LIMIT 1
)
WHERE primary_organization_id IS NULL;

ALTER TABLE users ALTER COLUMN school_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_school_id_fk') THEN
    ALTER TABLE users ADD CONSTRAINT users_school_id_fk
      FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_primary_organization_id_fk') THEN
    ALTER TABLE users ADD CONSTRAINT users_primary_organization_id_fk
      FOREIGN KEY (primary_organization_id) REFERENCES organizations(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_primary_campus_id_fk') THEN
    ALTER TABLE users ADD CONSTRAINT users_primary_campus_id_fk
      FOREIGN KEY (primary_campus_id) REFERENCES campuses(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_role_code_check') THEN
    ALTER TABLE users ADD CONSTRAINT users_role_code_check CHECK (role IN (
      'super_admin', 'dept_admin', 'dept_hygiene_manager', 'dept_hygiene_admin',
      'counselor', 'teacher', 'logistics_manager', 'logistics_admin', 'repairman',
      'dorm_manager', 'dorm_keeper', 'student', 'class_committee'
    )) NOT VALID;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS external_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  user_id varchar(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider varchar(32) NOT NULL CHECK (provider IN ('password', 'oidc', 'cas', 'ldap', 'wechat')),
  issuer varchar(255) NOT NULL DEFAULT '',
  subject varchar(255) NOT NULL,
  profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_authenticated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, provider, issuer, subject),
  UNIQUE (user_id, provider, issuer)
);

CREATE TABLE IF NOT EXISTS user_role_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  user_id varchar(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role varchar(50) NOT NULL CHECK (role IN (
    'super_admin', 'dept_admin', 'dept_hygiene_manager', 'dept_hygiene_admin',
    'counselor', 'teacher', 'logistics_manager', 'logistics_admin', 'repairman',
    'dorm_manager', 'dorm_keeper', 'student', 'class_committee'
  )),
  scope_type varchar(24) NOT NULL CHECK (scope_type IN ('global', 'school', 'campus', 'organization', 'class', 'building', 'self')),
  scope_id uuid,
  is_primary boolean NOT NULL DEFAULT false,
  status varchar(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'revoked')),
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz,
  granted_by varchar(36) REFERENCES users(id) ON DELETE SET NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (valid_until IS NULL OR valid_until > valid_from),
  CHECK ((scope_type IN ('global', 'self') AND scope_id IS NULL) OR (scope_type NOT IN ('global', 'self') AND scope_id IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS user_role_assignments_primary_active_idx
  ON user_role_assignments (user_id)
  WHERE is_primary AND status = 'active';
CREATE UNIQUE INDEX IF NOT EXISTS user_role_assignments_unique_active_scope_idx
  ON user_role_assignments (user_id, role, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS user_role_assignments_school_role_idx ON user_role_assignments (school_id, role);
CREATE INDEX IF NOT EXISTS user_role_assignments_scope_idx ON user_role_assignments (school_id, scope_type, scope_id);

INSERT INTO user_role_assignments (school_id, user_id, role, scope_type, scope_id, is_primary, reason)
SELECT
  u.school_id,
  u.id,
  CASE WHEN u.role IN (
    'super_admin', 'dept_admin', 'dept_hygiene_manager', 'dept_hygiene_admin',
    'counselor', 'teacher', 'logistics_manager', 'logistics_admin', 'repairman',
    'dorm_manager', 'dorm_keeper', 'student', 'class_committee'
  ) THEN u.role ELSE 'student' END,
  CASE WHEN u.role = 'super_admin' THEN 'global' ELSE 'school' END,
  CASE WHEN u.role = 'super_admin' THEN NULL ELSE u.school_id END,
  true,
  'migration backfill'
FROM users u
WHERE NOT EXISTS (
  SELECT 1 FROM user_role_assignments ura
  WHERE ura.user_id = u.id AND ura.status = 'active'
);

CREATE TABLE IF NOT EXISTS role_delegations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  grantor_user_id varchar(36) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  grantee_user_id varchar(36) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  role varchar(50) NOT NULL,
  scope_type varchar(24) NOT NULL CHECK (scope_type IN ('school', 'campus', 'organization', 'class', 'building')),
  scope_id uuid NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'revoked', 'expired')),
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  approved_by varchar(36) REFERENCES users(id) ON DELETE SET NULL,
  reason text NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (grantor_user_id <> grantee_user_id),
  CHECK (expires_at > starts_at)
);
CREATE INDEX IF NOT EXISTS role_delegations_grantee_active_idx ON role_delegations (grantee_user_id, status, expires_at);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id uuid PRIMARY KEY,
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  user_id varchar(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  auth_version integer NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revoke_reason varchar(160),
  ip_hash varchar(64),
  user_agent_hash varchar(64),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS auth_sessions_user_active_idx ON auth_sessions (user_id, expires_at) WHERE revoked_at IS NULL;

CREATE OR REPLACE FUNCTION create_identity_user(
  p_school_id uuid,
  p_user_id varchar,
  p_name varchar,
  p_password_hash varchar,
  p_role varchar,
  p_primary_organization_id uuid,
  p_primary_campus_id uuid,
  p_scope_type varchar,
  p_scope_id uuid,
  p_department varchar,
  p_class_name varchar,
  p_phone varchar,
  p_email varchar,
  p_granted_by varchar
)
RETURNS varchar
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_user_id varchar(36) := gen_random_uuid()::text;
BEGIN
  INSERT INTO users (
    id, user_id, name, password_hash, role, school_id,
    primary_organization_id, primary_campus_id, department,
    class_name, phone, email, status, auth_version, is_deleted,
    created_at, updated_at
  ) VALUES (
    new_user_id, p_user_id, p_name, p_password_hash, p_role, p_school_id,
    p_primary_organization_id, p_primary_campus_id, p_department,
    p_class_name, p_phone, p_email, 'active', 1, false,
    now(), now()
  );

  INSERT INTO external_identities (
    school_id, user_id, provider, issuer, subject, profile
  ) VALUES (
    p_school_id, new_user_id, 'password', '', p_user_id, '{}'::jsonb
  );

  INSERT INTO user_role_assignments (
    school_id, user_id, role, scope_type, scope_id,
    is_primary, status, valid_from, granted_by, reason
  ) VALUES (
    p_school_id, new_user_id, p_role, p_scope_type, p_scope_id,
    true, 'active', now(), p_granted_by, 'initial account role'
  );

  RETURN new_user_id;
END
$$;

REVOKE ALL ON FUNCTION create_identity_user(
  uuid, varchar, varchar, varchar, varchar, uuid, uuid,
  varchar, uuid, varchar, varchar, varchar, varchar, varchar
) FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION create_identity_user(
      uuid, varchar, varchar, varchar, varchar, uuid, uuid,
      varchar, uuid, varchar, varchar, varchar, varchar, varchar
    ) TO service_role;
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION update_identity_user(
  p_school_id uuid,
  p_target_user_id varchar,
  p_patch jsonb,
  p_password_hash varchar,
  p_actor varchar
)
RETURNS varchar
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_record users%ROWTYPE;
  security_changed boolean := p_password_hash IS NOT NULL OR p_patch ? 'status';
  next_status varchar := COALESCE(p_patch ->> 'status', 'active');
BEGIN
  IF next_status NOT IN ('active', 'disabled') THEN
    RAISE EXCEPTION 'invalid_identity_status' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO current_user_record
  FROM users
  WHERE id = p_target_user_id AND school_id = p_school_id AND is_deleted = false
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'identity_not_found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE users
  SET
    name = CASE WHEN p_patch ? 'name' THEN COALESCE(NULLIF(p_patch ->> 'name', ''), name) ELSE name END,
    department = CASE WHEN p_patch ? 'department' THEN NULLIF(p_patch ->> 'department', '') ELSE department END,
    class_name = CASE WHEN p_patch ? 'class_name' THEN NULLIF(p_patch ->> 'class_name', '') ELSE class_name END,
    phone = CASE WHEN p_patch ? 'phone' THEN NULLIF(p_patch ->> 'phone', '') ELSE phone END,
    email = CASE WHEN p_patch ? 'email' THEN NULLIF(p_patch ->> 'email', '') ELSE email END,
    avatar = CASE WHEN p_patch ? 'avatar' THEN NULLIF(p_patch ->> 'avatar', '') ELSE avatar END,
    status = CASE WHEN p_patch ? 'status' THEN next_status ELSE status END,
    password_hash = COALESCE(p_password_hash, password_hash),
    auth_version = auth_version + CASE WHEN security_changed THEN 1 ELSE 0 END,
    updated_at = now()
  WHERE id = p_target_user_id AND school_id = p_school_id;

  IF security_changed THEN
    UPDATE auth_sessions
    SET revoked_at = now(), revoke_reason = 'identity_security_change'
    WHERE user_id = p_target_user_id AND revoked_at IS NULL;
  END IF;

  IF next_status = 'disabled' THEN
    UPDATE user_role_assignments
    SET status = 'suspended', updated_at = now()
    WHERE user_id = p_target_user_id AND status = 'active';
  END IF;

  RETURN p_target_user_id;
END
$$;

CREATE OR REPLACE FUNCTION deactivate_identity_user(
  p_school_id uuid,
  p_target_user_id varchar,
  p_actor varchar
)
RETURNS varchar
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE users
  SET status = 'disabled', is_deleted = true, deleted_at = now(), auth_version = auth_version + 1, updated_at = now()
  WHERE id = p_target_user_id AND school_id = p_school_id AND is_deleted = false;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'identity_not_found' USING ERRCODE = 'P0002';
  END IF;
  UPDATE auth_sessions
  SET revoked_at = now(), revoke_reason = 'identity_deactivated'
  WHERE user_id = p_target_user_id AND revoked_at IS NULL;
  UPDATE user_role_assignments
  SET status = 'suspended', updated_at = now()
  WHERE user_id = p_target_user_id AND status = 'active';
  RETURN p_target_user_id;
END
$$;

REVOKE ALL ON FUNCTION update_identity_user(uuid, varchar, jsonb, varchar, varchar) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION deactivate_identity_user(uuid, varchar, varchar) FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION update_identity_user(uuid, varchar, jsonb, varchar, varchar) TO service_role;
    GRANT EXECUTE ON FUNCTION deactivate_identity_user(uuid, varchar, varchar) TO service_role;
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION app_request_claim(claim_name text)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  claims jsonb;
  direct_value text;
BEGIN
  direct_value := current_setting('request.jwt.claim.' || claim_name, true);
  IF direct_value IS NOT NULL AND direct_value <> '' THEN
    RETURN direct_value;
  END IF;
  BEGIN
    claims := NULLIF(current_setting('request.jwt.claims', true), '')::jsonb;
  EXCEPTION WHEN OTHERS THEN
    claims := NULL;
  END;
  RETURN claims ->> claim_name;
END
$$;

CREATE OR REPLACE FUNCTION app_has_role(expected_role text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(app_request_claim('role') = expected_role, false)
$$;

-- Remove the legacy public/anonymous access surface before enabling RLS everywhere.
DO $$
DECLARE
  policy_record record;
  table_record record;
BEGIN
  FOR policy_record IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND 'public' = ANY(roles)
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', policy_record.policyname, policy_record.schemaname, policy_record.tablename);
  END LOOP;

  FOR table_record IN
    SELECT schemaname, tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename <> 'schema_migrations'
  LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', table_record.schemaname, table_record.tablename);
    EXECUTE format('REVOKE ALL ON TABLE %I.%I FROM PUBLIC', table_record.schemaname, table_record.tablename);
    EXECUTE format('REVOKE ALL ON TABLE %I.%I FROM anon', table_record.schemaname, table_record.tablename);
  END LOOP;
END
$$;

DROP POLICY IF EXISTS schools_tenant_read ON schools;
CREATE POLICY schools_tenant_read ON schools FOR SELECT TO authenticated
USING (id::text = app_request_claim('school_id'));

DROP POLICY IF EXISTS campuses_tenant_read ON campuses;
CREATE POLICY campuses_tenant_read ON campuses FOR SELECT TO authenticated
USING (school_id::text = app_request_claim('school_id'));

DROP POLICY IF EXISTS organizations_tenant_read ON organizations;
CREATE POLICY organizations_tenant_read ON organizations FOR SELECT TO authenticated
USING (school_id::text = app_request_claim('school_id'));

DROP POLICY IF EXISTS organization_closure_tenant_read ON organization_closure;
CREATE POLICY organization_closure_tenant_read ON organization_closure FOR SELECT TO authenticated
USING (school_id::text = app_request_claim('school_id'));

DROP POLICY IF EXISTS academic_classes_tenant_read ON academic_classes;
CREATE POLICY academic_classes_tenant_read ON academic_classes FOR SELECT TO authenticated
USING (school_id::text = app_request_claim('school_id'));

DROP POLICY IF EXISTS buildings_tenant_read ON buildings;
CREATE POLICY buildings_tenant_read ON buildings FOR SELECT TO authenticated
USING (school_id::text = app_request_claim('school_id'));

DROP POLICY IF EXISTS users_tenant_self_or_admin_read ON users;
CREATE POLICY users_tenant_self_or_admin_read ON users FOR SELECT TO authenticated
USING (
  school_id::text = app_request_claim('school_id')
  AND (
    id = app_request_claim('sub')
    OR app_has_role('super_admin')
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
    OR app_has_role('dept_admin')
  )
);

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT ON schools, campuses, organizations, organization_closure, academic_classes, buildings TO authenticated;
GRANT SELECT ON users, user_role_assignments TO authenticated;
REVOKE ALL ON external_identities, role_delegations, auth_sessions FROM authenticated, anon, PUBLIC;
