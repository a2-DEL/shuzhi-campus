-- White Ze audit metadata only. The original query remains in the owner-scoped conversation message;
-- this ledger references it instead of duplicating potentially sensitive free text.
ALTER TABLE baize_tool_invocations
  ADD COLUMN IF NOT EXISTS query_message_id uuid REFERENCES baize_messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS raw_query_hash varchar(64),
  ADD COLUMN IF NOT EXISTS parsed_args jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS effective_args jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS scope_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE INDEX IF NOT EXISTS baize_tool_invocations_query_message_idx
  ON baize_tool_invocations(school_id,user_id,query_message_id) WHERE query_message_id IS NOT NULL;
