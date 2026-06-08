-- Migration: add decision type classification
-- Run in Supabase SQL editor

ALTER TABLE decisions
  ADD COLUMN IF NOT EXISTS type TEXT
  CHECK (type IN ('strategic', 'tactical', 'operational'));
