-- Repair databases created from the first draft of the init migration,
-- which used vector(1536). Fresh installs of the current init file are
-- already 1024-d; the column rewrite below is then a no-op.
--
-- pgvector's typmodin returns the dimension itself, so atttypmod is 1536
-- on the old column and 1024 on a fresh one. Some type mods are stored as
-- dimension + 4; 1540 is that form of 1536. A 1024 column (typmod 1024
-- or 1028) is never rewritten.
-- A 1536 vector cannot be cast to 1024. Chunks are dropped and the file
-- must be re-uploaded. Pages, the original file, and messages stay.

alter table documents
  add column if not exists embedding_dimensions integer;

-- Old rows were 1536-d. Leave that number so the app guard refuses search
-- until the file is re-uploaded. New writes send the real width.
update documents
  set embedding_dimensions = 1536
  where embedding_dimensions is null;

alter table documents
  alter column embedding_dimensions set not null;

do $$
declare
  dim integer;
begin
  select a.atttypmod into dim
  from pg_attribute a
  where a.attrelid = 'chunks'::regclass
    and a.attname = 'embedding'
    and not a.attisdropped;

  if dim = 1536 or dim = 1540 then
    delete from chunks;
    drop index if exists chunks_embedding_hnsw_idx;
    alter table chunks drop column embedding;
    alter table chunks add column embedding vector(1024) not null;
    create index chunks_embedding_hnsw_idx
      on chunks using hnsw (embedding vector_cosine_ops)
      with (m = 16, ef_construction = 64);
  end if;
end $$;

-- Argument typmods are not part of the function identity, so drop the
-- old vector(1536) declaration before creating the 1024-d one.
drop function if exists match_chunks(uuid, uuid, vector, integer);

create function match_chunks(
  p_workspace_id uuid,
  p_document_id uuid,
  p_query_embedding vector(1024),
  p_match_count integer
)
returns table (
  id uuid,
  document_id uuid,
  page_number integer,
  chunk_index integer,
  content text,
  char_start integer,
  char_end integer,
  similarity double precision
)
language sql
stable
as $$
  select
    c.id,
    c.document_id,
    c.page_number,
    c.chunk_index,
    c.content,
    c.char_start,
    c.char_end,
    1 - (c.embedding <=> p_query_embedding) as similarity
  from chunks c
  where c.workspace_id = p_workspace_id
    and c.document_id = p_document_id
  order by c.embedding <=> p_query_embedding
  limit greatest(p_match_count, 1);
$$;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function match_chunks(uuid, uuid, vector, integer) to service_role;
  end if;
end $$;
