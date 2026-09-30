-- Multi-Agent collaboration offices linked to the authoritative Agent runtime.
-- Agent messages remain sourced from ai_agent_messages; this module stores workspace notes and deliverable review state.

CREATE TABLE IF NOT EXISTS ai_collaboration_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  task_id uuid NOT NULL REFERENCES ai_task_runs(id) ON DELETE CASCADE,
  title varchar(220) NOT NULL,
  objective text NOT NULL,
  status varchar(24) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','AWAITING_DECISION','COMPLETED','BLOCKED','ARCHIVED')),
  owner_user_id varchar(36) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_by varchar(36) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, task_id)
);
CREATE INDEX IF NOT EXISTS ai_collaboration_rooms_school_updated_idx ON ai_collaboration_rooms (school_id,updated_at DESC);

CREATE TABLE IF NOT EXISTS ai_collaboration_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  room_id uuid NOT NULL REFERENCES ai_collaboration_rooms(id) ON DELETE CASCADE,
  author_user_id varchar(36) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  author_name varchar(128) NOT NULL,
  note_type varchar(24) NOT NULL DEFAULT 'NOTE' CHECK (note_type IN ('NOTE','CLARIFICATION','DECISION_CONTEXT','ACCEPTANCE')),
  content text NOT NULL,
  content_hash varchar(64) NOT NULL,
  node_id varchar(128),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_collaboration_notes_room_idx ON ai_collaboration_notes (school_id,room_id,created_at);

CREATE TABLE IF NOT EXISTS ai_collaboration_deliverables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  room_id uuid NOT NULL REFERENCES ai_collaboration_rooms(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES ai_task_runs(id) ON DELETE CASCADE,
  node_id varchar(128) NOT NULL,
  title varchar(220) NOT NULL,
  owner_agent_id varchar(160) NOT NULL,
  owner_agent_name varchar(160) NOT NULL,
  status varchar(24) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','IN_PROGRESS','READY_FOR_REVIEW','ACCEPTED','BLOCKED','FAILED')),
  summary text NOT NULL DEFAULT '',
  evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  accepted_by varchar(36) REFERENCES users(id) ON DELETE SET NULL,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (room_id,node_id)
);
CREATE INDEX IF NOT EXISTS ai_collaboration_deliverables_room_idx ON ai_collaboration_deliverables (school_id,room_id,status,updated_at DESC);

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['ai_collaboration_rooms','ai_collaboration_notes','ai_collaboration_deliverables'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL ON TABLE %I FROM PUBLIC, anon, authenticated', table_name);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE %I TO service_role', table_name);
    END IF;
  END LOOP;
END $$;
