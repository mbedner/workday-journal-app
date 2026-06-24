-- ─────────────────────────────────────────────────────────────────────────────
-- People — personal knowledge base about people in the user's life
-- Run this in the Supabase SQL editor.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists people (
  id                 uuid        primary key default gen_random_uuid(),
  user_id            uuid        not null references auth.users(id) on delete cascade,
  name               text        not null,
  relationship_type  text        not null default 'other'
                                  check (relationship_type in ('coworker', 'friend', 'family', 'acquaintance', 'other')),
  role               text,
  organization       text,
  where_met          text,
  avatar_url         text,
  snapshot           jsonb       not null default '{}'::jsonb,
  last_viewed_at     timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  archived_at        timestamptz
);

alter table people enable row level security;

create policy "Users manage their own people"
  on people for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists people_user_idx on people(user_id) where archived_at is null;
create index if not exists people_name_idx on people using gin (to_tsvector('simple', name));

-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists person_notes (
  id          uuid        primary key default gen_random_uuid(),
  person_id   uuid        not null references people(id) on delete cascade,
  user_id     uuid        not null references auth.users(id) on delete cascade,
  content     text        not null,
  tags        text[]      not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table person_notes enable row level security;

create policy "Users manage their own person notes"
  on person_notes for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists person_notes_person_idx on person_notes(person_id, created_at desc);

-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists person_mentions (
  id          uuid        primary key default gen_random_uuid(),
  person_id   uuid        not null references people(id) on delete cascade,
  user_id     uuid        not null references auth.users(id) on delete cascade,
  source_type text        not null check (source_type in ('journal', 'meeting', 'project')),
  source_id   uuid        not null,
  created_at  timestamptz not null default now(),
  unique (person_id, source_type, source_id)
);

alter table person_mentions enable row level security;

create policy "Users manage their own person mentions"
  on person_mentions for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists person_mentions_person_idx on person_mentions(person_id, created_at desc);
create index if not exists person_mentions_source_idx on person_mentions(source_type, source_id);
