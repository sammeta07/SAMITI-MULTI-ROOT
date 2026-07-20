-- Migration 044: Reset all event interest expressions to PENDING
-- Purpose: Normalize existing data so every interest expression starts from
-- the PENDING state before the master admin begins the review phase.

UPDATE event_interest_expressions
SET status = 'PENDING',
    reviewed_by = NULL,
    reviewed_at = NULL
WHERE status <> 'PENDING';
