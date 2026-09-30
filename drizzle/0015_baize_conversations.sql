-- Additive, tenant/user-bound Baize chat storage. Existing business tables and Skill functions are unchanged.
CREATE TABLE IF NOT EXISTS baize_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  user_id varchar(36) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  title varchar(120) NOT NULL DEFAULT '与白泽的新对话',
  summary varchar(1200),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_active_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, user_id, id)
);
CREATE INDEX IF NOT EXISTS baize_conversations_owner_recent_idx ON baize_conversations(school_id,user_id,last_active_at DESC);

CREATE TABLE IF NOT EXISTS baize_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL,
  school_id uuid NOT NULL,
  user_id varchar(36) NOT NULL,
  role varchar(12) NOT NULL CHECK (role IN ('user','assistant')),
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 8000),
  input_tokens integer NOT NULL DEFAULT 0 CHECK (input_tokens>=0),
  output_tokens integer NOT NULL DEFAULT 0 CHECK (output_tokens>=0),
  model_version varchar(160),
  tool_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(tool_snapshot)='object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (school_id,user_id,conversation_id) REFERENCES baize_conversations(school_id,user_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS baize_messages_owner_recent_idx ON baize_messages(school_id,user_id,conversation_id,created_at DESC,id DESC);

-- Only verified resource identifiers and their last observed state: never cache full business records here.
CREATE TABLE IF NOT EXISTS baize_memory_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  user_id varchar(36) NOT NULL,
  conversation_id uuid NOT NULL,
  entity_type varchar(40) NOT NULL CHECK (entity_type IN ('repair','dormitory','classroom','lost_found','duty','visitor','energy')),
  entity_key varchar(120) NOT NULL,
  entity_status varchar(40),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (school_id,user_id,conversation_id) REFERENCES baize_conversations(school_id,user_id,id) ON DELETE CASCADE,
  UNIQUE(school_id,user_id,conversation_id,entity_type,entity_key)
);
CREATE INDEX IF NOT EXISTS baize_memory_entities_owner_idx ON baize_memory_entities(school_id,user_id,entity_type,last_seen_at DESC);

CREATE TABLE IF NOT EXISTS baize_request_windows (
  bucket varchar(120) NOT NULL,
  window_start timestamptz NOT NULL,
  request_count integer NOT NULL DEFAULT 0 CHECK (request_count>=0),
  PRIMARY KEY(bucket,window_start)
);
CREATE INDEX IF NOT EXISTS baize_request_windows_expiry_idx ON baize_request_windows(window_start);

CREATE TABLE IF NOT EXISTS baize_model_circuits (
  school_id uuid PRIMARY KEY REFERENCES schools(id) ON DELETE CASCADE,
  consecutive_failures integer NOT NULL DEFAULT 0 CHECK (consecutive_failures>=0),
  open_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE baize_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE baize_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE baize_memory_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE baize_request_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE baize_model_circuits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON baize_conversations,baize_messages,baize_memory_entities,baize_request_windows,baize_model_circuits FROM PUBLIC;
