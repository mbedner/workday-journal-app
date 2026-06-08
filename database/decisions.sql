-- ─────────────────────────────────────────────────────────────────────────────
-- Decision Archaeology — decisions table
-- Run this in the Supabase SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists decisions (
  id             uuid        primary key default gen_random_uuid(),
  project_id     uuid        not null references projects(id) on delete cascade,
  user_id        uuid        not null references auth.users(id) on delete cascade,
  content        text        not null,
  source_type    text        not null check (source_type in ('journal_entry', 'meeting_note', 'manual')),
  source_id      uuid,
  date           date        not null,
  people         text[]      not null default '{}',
  confidence     text        check (confidence in ('high', 'medium', 'low')),
  status         text        not null default 'pending_review'
                             check (status in ('pending_review', 'active', 'superseded', 'dismissed')),
  superseded_by  uuid        references decisions(id),
  notes          text,
  excerpt        text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Row-level security
alter table decisions enable row level security;

create policy "Users manage their own decisions"
  on decisions for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Indexes
create index if not exists decisions_project_status_idx on decisions(project_id, status);
create index if not exists decisions_source_idx        on decisions(source_id)  where source_id is not null;
create index if not exists decisions_date_idx          on decisions(project_id, date desc);
