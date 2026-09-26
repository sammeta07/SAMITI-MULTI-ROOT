-- Migration 060: Normalize event_year to an occurrence count.
-- Existing rows receive deterministic dummy values from 1 through 49.
UPDATE events
SET event_year = MOD(id - 1, 49) + 1;
