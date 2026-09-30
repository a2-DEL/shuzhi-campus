-- User-owned entity index and safety event ledger; no change to original business tables.
CREATE TABLE IF NOT EXISTS baize_user_entity_index (
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  user_id varchar(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_type varchar(40) NOT NULL CHECK (entity_type IN ('repair','dormitory','classroom','lost_found','duty','visitor','energy')),
  entity_key varchar(120) NOT NULL,
  entity_status varchar(40),
  mention_count integer NOT NULL DEFAULT 1 CHECK (mention_count >= 1),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (school_id,user_id,entity_type,entity_key)
);
CREATE INDEX IF NOT EXISTS baize_user_entity_recent_idx ON baize_user_entity_index(school_id,user_id,last_seen_at DESC);

CREATE TABLE IF NOT EXISTS baize_safety_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  user_id varchar(36) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  conversation_id uuid,
  reason varchar(48) NOT NULL,
  direction varchar(16) NOT NULL CHECK (direction IN ('INPUT','OUTPUT','TOOL')),
  content_hash varchar(64) NOT NULL,
  summary varchar(160) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (school_id,user_id,conversation_id) REFERENCES baize_conversations(school_id,user_id,id) ON DELETE SET NULL (conversation_id)
);
CREATE INDEX IF NOT EXISTS baize_safety_events_owner_time_idx ON baize_safety_events(school_id,user_id,created_at DESC);
ALTER TABLE baize_user_entity_index ENABLE ROW LEVEL SECURITY;
ALTER TABLE baize_safety_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON baize_user_entity_index,baize_safety_events FROM PUBLIC;
