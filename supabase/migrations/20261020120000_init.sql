-- Cited Docs QA
-- Apply in the Supabase SQL editor (or `supabase db push`).
-- Enable the vector extension first if this file errors on type "vector"
-- (Database → Extensions → vector).
--
-- Embeddings are 1536-d to match OpenAI text-embedding-3-small.
-- A different width means altering `chunks.embedding` and rebuilding the
-- HNSW index. Demo hash vectors use the same width so the column can stay,
-- but they are a different space: re-upload after changing providers.

create extension if not exists vector;

create table if not exists workspaces (
  id uuid primary key,
  name text not null,
  -- Seam for multi-tenancy. The app sends one owner today.
  -- Next step: policies with auth.uid()::text = owner_id, and stop using the service role for user traffic.
  owner_id text not null,
  created_at timestamptz not null default now()
);

create table if not exists documents (
  id uuid primary key,
  workspace_id uuid not null references workspaces (id),
  filename text not null,
  mime_type text not null,
  -- Original file so the source viewer can reopen the PDF.
  -- Base64 avoids bytea encoding surprises in PostgREST. Fine under the 8 MB upload cap.
  -- Next step for larger files: object storage, and keep only the path here.
  file_base64 text not null,
  page_count integer not null,
  chunk_count integer not null,
  embedding_provider text not null,
  embedding_model text not null,
  created_at timestamptz not null default now()
);

create index if not exists documents_workspace_created_idx
  on documents (workspace_id, created_at desc);

create table if not exists pages (
  document_id uuid not null references documents (id) on delete cascade,
  page_number integer not null check (page_number > 0),
  -- Normalized page text. Chunk char_start/char_end are indexes into this string.
  text text not null,
  primary key (document_id, page_number)
);

create table if not exists chunks (
  id uuid primary key,
  document_id uuid not null references documents (id) on delete cascade,
  workspace_id uuid not null references workspaces (id),
  page_number integer not null check (page_number > 0),
  chunk_index integer not null check (chunk_index >= 0),
  content text not null,
  char_start integer not null,
  char_end integer not null,
  embedding vector(1536) not null,
  -- Keyword half of hybrid search. Generated so the app cannot forget to update it.
  content_tsv tsvector generated always as (to_tsvector('english', content)) stored,
  constraint chunks_offsets_chk check (char_start >= 0 and char_end >= char_start),
  constraint chunks_document_index_uniq unique (document_id, chunk_index)
);

create index if not exists chunks_document_idx on chunks (document_id, chunk_index);
create index if not exists chunks_content_tsv_idx on chunks using gin (content_tsv);

-- HNSW does not need a training sample, so it is safe on an empty project.
-- IVFFlat is the other common index and is a poor fit until the table is large.
-- Cosine distance matches L2-normalized embeddings (OpenAI's, and the demo hash).
create index if not exists chunks_embedding_hnsw_idx
  on chunks using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);

create table if not exists messages (
  id uuid primary key,
  document_id uuid not null references documents (id) on delete cascade,
  workspace_id uuid not null references workspaces (id),
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  citations jsonb not null default '[]'::jsonb,
  dropped_citations jsonb not null default '[]'::jsonb,
  retrieved jsonb not null default '[]'::jsonb,
  prompt_tokens integer not null default 0,
  completion_tokens integer not null default 0,
  embedding_tokens integer not null default 0,
  estimated_cost_usd numeric(14, 8) not null default 0,
  illustrative_cost_usd numeric(14, 8) not null default 0,
  refused boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists messages_document_created_idx
  on messages (document_id, created_at);

create table if not exists usage_events (
  id uuid primary key,
  workspace_id uuid not null references workspaces (id),
  document_id uuid references documents (id) on delete cascade,
  kind text not null check (kind in ('embed', 'chat')),
  provider text not null,
  model text not null,
  prompt_tokens integer not null default 0,
  completion_tokens integer not null default 0,
  embedding_tokens integer not null default 0,
  estimated_cost_usd numeric(14, 8) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists usage_workspace_idx on usage_events (workspace_id, created_at desc);
create index if not exists usage_document_idx on usage_events (document_id);

-- `<=>` is cosine distance (lower is closer). Similarity is 1 - distance.
create or replace function match_chunks(
  p_workspace_id uuid,
  p_document_id uuid,
  p_query_embedding vector(1536),
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

alter table workspaces enable row level security;
alter table documents enable row level security;
alter table pages enable row level security;
alter table chunks enable row level security;
alter table messages enable row level security;
alter table usage_events enable row level security;

-- No policies. The Next.js server uses the service role, which bypasses RLS.
-- The anon and authenticated roles cannot read these tables.

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant all privileges on table workspaces, documents, pages, chunks, messages, usage_events to service_role;
    grant execute on function match_chunks(uuid, uuid, vector, integer) to service_role;
  end if;
end $$;
