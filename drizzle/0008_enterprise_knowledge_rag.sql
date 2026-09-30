-- Enterprise knowledge platform: versioned documents, governed chunks, ACLs, graph candidates and retrieval lineage.
-- Raw user questions and generated answers are never stored; only hashes and bounded operational evidence are persisted.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE OR REPLACE FUNCTION ai_cosine_similarity(left_vector real[], right_vector real[])
RETURNS double precision
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  WITH paired AS (
    SELECT left_vector[i]::double precision AS a, right_vector[i]::double precision AS b
    FROM generate_subscripts(left_vector, 1) AS i
    WHERE i <= COALESCE(array_length(right_vector, 1), 0)
  ), aggregate_values AS (
    SELECT
      COALESCE(sum(a * b), 0)::double precision AS dot_product,
      sqrt(COALESCE(sum(a * a), 0))::double precision AS left_norm,
      sqrt(COALESCE(sum(b * b), 0))::double precision AS right_norm
    FROM paired
  )
  SELECT CASE
    WHEN left_norm = 0 OR right_norm = 0 THEN 0::double precision
    ELSE dot_product / (left_norm * right_norm)
  END
  FROM aggregate_values
$$;

CREATE TABLE IF NOT EXISTS ai_knowledge_bases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  slug varchar(120) NOT NULL,
  name varchar(200) NOT NULL,
  description text NOT NULL DEFAULT '',
  status varchar(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','PAUSED','ARCHIVED')),
  default_sensitivity varchar(20) NOT NULL DEFAULT 'INTERNAL' CHECK (default_sensitivity IN ('PUBLIC','INTERNAL','RESTRICTED','CONFIDENTIAL')),
  created_by varchar(36) REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, slug)
);

CREATE TABLE IF NOT EXISTS ai_knowledge_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  knowledge_base_id uuid NOT NULL REFERENCES ai_knowledge_bases(id) ON DELETE RESTRICT,
  external_key varchar(180),
  title varchar(300) NOT NULL,
  description text NOT NULL DEFAULT '',
  source_kind varchar(32) NOT NULL CHECK (source_kind IN ('TEXT','MARKDOWN','POLICY','RUNBOOK','FAQ','BUSINESS_EVENT')),
  source_uri text,
  visibility varchar(24) NOT NULL DEFAULT 'TENANT' CHECK (visibility IN ('TENANT','ROLE','ORGANIZATION','PRIVATE')),
  sensitivity varchar(20) NOT NULL DEFAULT 'INTERNAL' CHECK (sensitivity IN ('PUBLIC','INTERNAL','RESTRICTED','CONFIDENTIAL')),
  owner_organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  status varchar(24) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','PROCESSING','PUBLISHED','ARCHIVED','FAILED')),
  current_version integer NOT NULL DEFAULT 0 CHECK (current_version >= 0),
  created_by varchar(36) REFERENCES users(id) ON DELETE SET NULL,
  updated_by varchar(36) REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ai_knowledge_documents_external_key_idx
  ON ai_knowledge_documents (school_id, knowledge_base_id, external_key)
  WHERE external_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS ai_knowledge_documents_school_status_idx
  ON ai_knowledge_documents (school_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS ai_knowledge_document_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  document_id uuid NOT NULL REFERENCES ai_knowledge_documents(id) ON DELETE CASCADE,
  principal_type varchar(20) NOT NULL CHECK (principal_type IN ('ROLE','ORGANIZATION','USER')),
  principal_id varchar(80) NOT NULL,
  granted_by varchar(36) REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, principal_type, principal_id)
);
CREATE INDEX IF NOT EXISTS ai_knowledge_document_grants_lookup_idx
  ON ai_knowledge_document_grants (school_id, principal_type, principal_id, document_id);

CREATE TABLE IF NOT EXISTS ai_knowledge_document_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  document_id uuid NOT NULL REFERENCES ai_knowledge_documents(id) ON DELETE CASCADE,
  version_no integer NOT NULL CHECK (version_no > 0),
  source_text text NOT NULL,
  content_hash varchar(64) NOT NULL,
  language varchar(16) NOT NULL DEFAULT 'zh-CN',
  parser_kind varchar(40) NOT NULL DEFAULT 'plain-text',
  parser_version varchar(40) NOT NULL,
  status varchar(24) NOT NULL DEFAULT 'PROCESSING' CHECK (status IN ('PROCESSING','PUBLISHED','SUPERSEDED','FAILED')),
  char_count integer NOT NULL CHECK (char_count >= 0),
  chunk_count integer NOT NULL DEFAULT 0 CHECK (chunk_count >= 0),
  lineage jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by varchar(36) REFERENCES users(id) ON DELETE SET NULL,
  published_by varchar(36) REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  UNIQUE (document_id, version_no),
  UNIQUE (document_id, content_hash)
);
CREATE INDEX IF NOT EXISTS ai_knowledge_versions_school_status_idx
  ON ai_knowledge_document_versions (school_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS ai_knowledge_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  document_id uuid NOT NULL REFERENCES ai_knowledge_documents(id) ON DELETE CASCADE,
  version_id uuid NOT NULL REFERENCES ai_knowledge_document_versions(id) ON DELETE CASCADE,
  chunk_index integer NOT NULL CHECK (chunk_index >= 0),
  section_path text[] NOT NULL DEFAULT ARRAY[]::text[],
  page_start integer CHECK (page_start IS NULL OR page_start > 0),
  page_end integer CHECK (page_end IS NULL OR page_end >= page_start),
  char_start integer NOT NULL CHECK (char_start >= 0),
  char_end integer NOT NULL CHECK (char_end >= char_start),
  content text NOT NULL,
  content_hash varchar(64) NOT NULL,
  search_vector tsvector NOT NULL,
  feature_vector real[] NOT NULL,
  vector_dimensions integer NOT NULL CHECK (vector_dimensions > 0),
  embedding_backend varchar(80) NOT NULL,
  embedding_model varchar(120) NOT NULL,
  token_estimate integer NOT NULL CHECK (token_estimate >= 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (version_id, chunk_index),
  UNIQUE (version_id, content_hash),
  CHECK (vector_dimensions = cardinality(feature_vector))
);
CREATE INDEX IF NOT EXISTS ai_knowledge_chunks_school_document_idx
  ON ai_knowledge_chunks (school_id, document_id, chunk_index);
CREATE INDEX IF NOT EXISTS ai_knowledge_chunks_search_idx
  ON ai_knowledge_chunks USING gin (search_vector);
CREATE INDEX IF NOT EXISTS ai_knowledge_chunks_trigram_idx
  ON ai_knowledge_chunks USING gin (content gin_trgm_ops);

CREATE TABLE IF NOT EXISTS ai_knowledge_ingestion_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  document_id uuid NOT NULL REFERENCES ai_knowledge_documents(id) ON DELETE CASCADE,
  version_id uuid REFERENCES ai_knowledge_document_versions(id) ON DELETE CASCADE,
  status varchar(24) NOT NULL CHECK (status IN ('QUEUED','PARSING','INDEXING','GRAPH_EXTRACTING','COMPLETED','FAILED')),
  stage varchar(40) NOT NULL,
  source_hash varchar(64) NOT NULL,
  chunks_created integer NOT NULL DEFAULT 0 CHECK (chunks_created >= 0),
  entity_candidates integer NOT NULL DEFAULT 0 CHECK (entity_candidates >= 0),
  relation_candidates integer NOT NULL DEFAULT 0 CHECK (relation_candidates >= 0),
  error_code varchar(100),
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_by varchar(36) REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS ai_knowledge_ingestion_jobs_school_idx
  ON ai_knowledge_ingestion_jobs (school_id, started_at DESC);

CREATE TABLE IF NOT EXISTS ai_knowledge_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  canonical_name varchar(240) NOT NULL,
  normalized_name varchar(240) NOT NULL,
  entity_type varchar(60) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'CANDIDATE' CHECK (status IN ('CANDIDATE','PUBLISHED','REJECTED')),
  confidence numeric(6,5) NOT NULL DEFAULT 0 CHECK (confidence >= 0 AND confidence <= 1),
  extraction_method varchar(60) NOT NULL,
  created_by varchar(36) REFERENCES users(id) ON DELETE SET NULL,
  reviewed_by varchar(36) REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, entity_type, normalized_name)
);
CREATE INDEX IF NOT EXISTS ai_knowledge_entities_name_idx
  ON ai_knowledge_entities USING gin (canonical_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS ai_knowledge_entities_school_status_idx
  ON ai_knowledge_entities (school_id, status, entity_type);

CREATE TABLE IF NOT EXISTS ai_knowledge_entity_mentions (
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  chunk_id uuid NOT NULL REFERENCES ai_knowledge_chunks(id) ON DELETE CASCADE,
  entity_id uuid NOT NULL REFERENCES ai_knowledge_entities(id) ON DELETE CASCADE,
  mention_text varchar(240) NOT NULL,
  confidence numeric(6,5) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  extraction_method varchar(60) NOT NULL,
  start_offset integer CHECK (start_offset IS NULL OR start_offset >= 0),
  end_offset integer CHECK (end_offset IS NULL OR end_offset >= start_offset),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chunk_id, entity_id, mention_text)
);
CREATE INDEX IF NOT EXISTS ai_knowledge_mentions_entity_idx
  ON ai_knowledge_entity_mentions (school_id, entity_id, chunk_id);

CREATE TABLE IF NOT EXISTS ai_knowledge_relations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  subject_entity_id uuid NOT NULL REFERENCES ai_knowledge_entities(id) ON DELETE RESTRICT,
  predicate varchar(100) NOT NULL,
  object_entity_id uuid NOT NULL REFERENCES ai_knowledge_entities(id) ON DELETE RESTRICT,
  source_chunk_id uuid NOT NULL REFERENCES ai_knowledge_chunks(id) ON DELETE CASCADE,
  evidence_quote text NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'CANDIDATE' CHECK (status IN ('CANDIDATE','PUBLISHED','REJECTED')),
  confidence numeric(6,5) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  extraction_method varchar(60) NOT NULL,
  created_by varchar(36) REFERENCES users(id) ON DELETE SET NULL,
  reviewed_by varchar(36) REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subject_entity_id, predicate, object_entity_id, source_chunk_id),
  CHECK (subject_entity_id <> object_entity_id)
);
CREATE INDEX IF NOT EXISTS ai_knowledge_relations_subject_idx
  ON ai_knowledge_relations (school_id, status, subject_entity_id);
CREATE INDEX IF NOT EXISTS ai_knowledge_relations_object_idx
  ON ai_knowledge_relations (school_id, status, object_entity_id);

CREATE TABLE IF NOT EXISTS ai_knowledge_retrievals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  user_id varchar(36) REFERENCES users(id) ON DELETE SET NULL,
  trace_id varchar(64) NOT NULL,
  query_hash varchar(64) NOT NULL,
  query_characters integer NOT NULL CHECK (query_characters >= 0),
  route_mode varchar(32) NOT NULL CHECK (route_mode IN ('HYBRID','HYBRID_GRAPH','REFUSED')),
  vector_backend varchar(80) NOT NULL,
  status varchar(20) NOT NULL CHECK (status IN ('RUNNING','ANSWERED','REFUSED','FAILED')),
  result_count integer NOT NULL DEFAULT 0 CHECK (result_count >= 0),
  citation_count integer NOT NULL DEFAULT 0 CHECK (citation_count >= 0),
  top_score numeric(8,7) CHECK (top_score IS NULL OR (top_score >= 0 AND top_score <= 1)),
  model_invocation_id uuid REFERENCES ai_model_invocations(id) ON DELETE SET NULL,
  answer_hash varchar(64),
  refusal_code varchar(100),
  latency_ms integer CHECK (latency_ms IS NULL OR latency_ms >= 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (school_id, trace_id)
);
CREATE INDEX IF NOT EXISTS ai_knowledge_retrievals_school_created_idx
  ON ai_knowledge_retrievals (school_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_knowledge_retrievals_user_created_idx
  ON ai_knowledge_retrievals (school_id, user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ai_knowledge_retrieval_items (
  retrieval_id uuid NOT NULL REFERENCES ai_knowledge_retrievals(id) ON DELETE CASCADE,
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  chunk_id uuid NOT NULL REFERENCES ai_knowledge_chunks(id) ON DELETE RESTRICT,
  rank integer NOT NULL CHECK (rank > 0),
  citation_label varchar(20) NOT NULL,
  lexical_score numeric(8,7) NOT NULL CHECK (lexical_score >= 0 AND lexical_score <= 1),
  vector_score numeric(8,7) NOT NULL CHECK (vector_score >= 0 AND vector_score <= 1),
  graph_score numeric(8,7) NOT NULL CHECK (graph_score >= 0 AND graph_score <= 1),
  authority_score numeric(8,7) NOT NULL CHECK (authority_score >= 0 AND authority_score <= 1),
  fused_score numeric(8,7) NOT NULL CHECK (fused_score >= 0 AND fused_score <= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (retrieval_id, rank),
  UNIQUE (retrieval_id, chunk_id),
  UNIQUE (retrieval_id, citation_label)
);

CREATE TABLE IF NOT EXISTS ai_knowledge_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  actor_user_id varchar(36) REFERENCES users(id) ON DELETE SET NULL,
  action varchar(80) NOT NULL,
  target_type varchar(60) NOT NULL,
  target_id varchar(100) NOT NULL,
  trace_id varchar(64) NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_knowledge_audit_school_created_idx
  ON ai_knowledge_audit_events (school_id, created_at DESC);

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'ai_knowledge_bases','ai_knowledge_documents','ai_knowledge_document_grants',
    'ai_knowledge_document_versions','ai_knowledge_chunks','ai_knowledge_ingestion_jobs',
    'ai_knowledge_entities','ai_knowledge_entity_mentions','ai_knowledge_relations',
    'ai_knowledge_retrievals','ai_knowledge_retrieval_items','ai_knowledge_audit_events'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', table_name);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', table_name);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM authenticated', table_name);
  END LOOP;
END $$;
