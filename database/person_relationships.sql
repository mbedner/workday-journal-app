-- Person-to-person relationships
-- label is free text, e.g. "Manages", "Reports to", "Works with", "Mentor"
create table if not exists person_relationships (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references auth.users(id) on delete cascade not null,
  person_id         uuid references people(id) on delete cascade not null,
  related_person_id uuid references people(id) on delete cascade not null,
  label             text not null,
  created_at        timestamptz default now() not null,
  -- prevent exact duplicates (same person, same related person, same label)
  unique (user_id, person_id, related_person_id, label)
);

alter table person_relationships enable row level security;

create policy "Users own their person relationships"
  on person_relationships for all
  using (auth.uid() = user_id);

create index person_relationships_person_id_idx on person_relationships (person_id);
create index person_relationships_related_person_id_idx on person_relationships (related_person_id);
