-- ─────────────────────────────────────────────────────────────────────────────
-- Defense-in-depth: prevent duplicate Person rows per user, even if the app
-- ever races again. Run this in the Supabase SQL editor (optional but recommended).
-- ─────────────────────────────────────────────────────────────────────────────

create unique index if not exists people_user_name_unique
  on people (user_id, lower(name))
  where archived_at is null;
