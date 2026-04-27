-- ============================================================
-- Workday Journal — Supabase Schema + RLS
-- Run this in your Supabase SQL editor to set up the database.
-- ============================================================

-- Enable UUID extension (usually already on)
create extension if not exists "uuid-ossp";

-- ─────────────────────────────────────────────
-- TABLES
-- ─────────────────────────────────────────────

create table if not exists journal_entries (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_date date not null,
  focus text,
  accomplished text,
  needs_attention text,
  reflection text,
  productivity_rating integer check (productivity_rating between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, entry_date)
);

create table if not exists tasks (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  notes text,
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'done', 'blocked')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  due_date date,
  completed_at timestamptz,
  source_type text default 'manual' check (source_type in ('manual', 'journal', 'transcript')),
  source_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists transcripts (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  meeting_title text not null,
  meeting_date date,
  attendees text,
  raw_transcript text,
  summary text,
  decisions text,
  action_items text,
  follow_ups text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists projects (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists tags (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

-- ─────────────────────────────────────────────
-- JOIN TABLES
-- ─────────────────────────────────────────────

create table if not exists journal_entry_projects (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  journal_entry_id uuid not null references journal_entries(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (journal_entry_id, project_id)
);

create table if not exists journal_entry_tags (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  journal_entry_id uuid not null references journal_entries(id) on delete cascade,
  tag_id uuid not null references tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (journal_entry_id, tag_id)
);

create table if not exists task_projects (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null references tasks(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (task_id, project_id)
);

create table if not exists task_tags (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null references tasks(id) on delete cascade,
  tag_id uuid not null references tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (task_id, tag_id)
);

create table if not exists transcript_projects (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  transcript_id uuid not null references transcripts(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (transcript_id, project_id)
);

create table if not exists transcript_tags (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  transcript_id uuid not null references transcripts(id) on delete cascade,
  tag_id uuid not null references tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (transcript_id, tag_id)
);

-- ─────────────────────────────────────────────
-- ROW-LEVEL SECURITY
-- ─────────────────────────────────────────────

alter table journal_entries enable row level security;
alter table tasks enable row level security;
alter table transcripts enable row level security;
alter table projects enable row level security;
alter table tags enable row level security;
alter table journal_entry_projects enable row level security;
alter table journal_entry_tags enable row level security;
alter table task_projects enable row level security;
alter table task_tags enable row level security;
alter table transcript_projects enable row level security;
alter table transcript_tags enable row level security;

-- journal_entries
create policy "journal_entries: own rows" on journal_entries for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- tasks
create policy "tasks: own rows" on tasks for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- transcripts
create policy "transcripts: own rows" on transcripts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- projects
create policy "projects: own rows" on projects for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- tags
create policy "tags: own rows" on tags for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- join tables
create policy "journal_entry_projects: own rows" on journal_entry_projects for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "journal_entry_tags: own rows" on journal_entry_tags for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "task_projects: own rows" on task_projects for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "task_tags: own rows" on task_tags for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "transcript_projects: own rows" on transcript_projects for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "transcript_tags: own rows" on transcript_tags for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ─────────────────────────────────────────────
-- HELPFUL INDEXES
-- ─────────────────────────────────────────────

create index if not exists idx_journal_entries_user_date on journal_entries(user_id, entry_date desc);
create index if not exists idx_tasks_user_status on tasks(user_id, status);
create index if not exists idx_transcripts_user_date on transcripts(user_id, meeting_date desc);
