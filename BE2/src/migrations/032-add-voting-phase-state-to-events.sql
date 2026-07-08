ALTER TABLE events
ADD COLUMN voting_phase_state TINYINT(1) NOT NULL DEFAULT 0 AFTER voting_closed;

UPDATE events
SET voting_phase_state = CASE
  WHEN COALESCE(voting_closed, 0) = 1 THEN 4
  WHEN COALESCE(voting_enabled, 0) = 1 THEN 3
  ELSE 0
END;