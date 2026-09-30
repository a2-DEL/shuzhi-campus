-- Tenant-scoped operational support domains for the enterprise workspace.
-- Replaces legacy client-side mock material and duty records with governed PostgreSQL data.

CREATE TABLE IF NOT EXISTS materials (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  name varchar(200) NOT NULL,
  category varchar(100) NOT NULL,
  quantity integer NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  unit varchar(20) NOT NULL,
  threshold integer NOT NULL DEFAULT 10 CHECK (threshold >= 0),
  status varchar(24) NOT NULL DEFAULT 'normal' CHECK (status IN ('normal','warning','out_of_stock','retired')),
  location varchar(200),
  supplier varchar(200),
  unit_price numeric(12,2) CHECK (unit_price IS NULL OR unit_price >= 0),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  is_deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, name)
);
CREATE INDEX IF NOT EXISTS materials_school_status_idx ON materials(school_id,status,updated_at DESC) WHERE NOT is_deleted;
CREATE INDEX IF NOT EXISTS materials_school_category_idx ON materials(school_id,category,name) WHERE NOT is_deleted;

CREATE TABLE IF NOT EXISTS material_requests (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  material_id varchar(36) NOT NULL REFERENCES materials(id) ON DELETE RESTRICT,
  quantity integer NOT NULL CHECK (quantity > 0),
  requester_id varchar(36) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reason text NOT NULL,
  status varchar(24) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','issued','rejected','cancelled')),
  reviewer_id varchar(36) REFERENCES users(id) ON DELETE SET NULL,
  review_note text,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS material_requests_school_state_idx ON material_requests(school_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS material_requests_material_idx ON material_requests(school_id,material_id,created_at DESC);
CREATE INDEX IF NOT EXISTS material_requests_requester_idx ON material_requests(school_id,requester_id,created_at DESC);

CREATE TABLE IF NOT EXISTS duty_schedules (
  id varchar(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  class_id uuid REFERENCES academic_classes(id) ON DELETE SET NULL,
  duty_date date NOT NULL,
  class_name varchar(100) NOT NULL,
  location varchar(200) NOT NULL,
  students jsonb NOT NULL DEFAULT '[]',
  duty_type varchar(50) NOT NULL DEFAULT 'cleaning',
  status varchar(24) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','IN_PROGRESS','COMPLETED','CHECKED','CANCELLED')),
  notes text,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(students)='array')
);
CREATE INDEX IF NOT EXISTS duty_schedules_school_date_idx ON duty_schedules(school_id,duty_date,status);
CREATE INDEX IF NOT EXISTS duty_schedules_school_class_idx ON duty_schedules(school_id,class_id,duty_date DESC);

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['materials','material_requests','duty_schedules']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', table_name);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', table_name);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM authenticated', table_name);
  END LOOP;
END
$$;

DROP POLICY IF EXISTS materials_tenant_read ON materials;
CREATE POLICY materials_tenant_read ON materials FOR SELECT TO authenticated
USING (school_id::text=app_request_claim('school_id') AND NOT is_deleted);

DROP POLICY IF EXISTS material_requests_tenant_read ON material_requests;
CREATE POLICY material_requests_tenant_read ON material_requests FOR SELECT TO authenticated
USING (school_id::text=app_request_claim('school_id'));

DROP POLICY IF EXISTS duty_schedules_tenant_read ON duty_schedules;
CREATE POLICY duty_schedules_tenant_read ON duty_schedules FOR SELECT TO authenticated
USING (school_id::text=app_request_claim('school_id'));
