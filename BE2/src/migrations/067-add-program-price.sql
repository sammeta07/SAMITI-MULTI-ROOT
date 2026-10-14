-- Add price column to programs table to support paid programs.
-- Price defaults to 0 (free); any positive value marks the program as paid.
ALTER TABLE programs ADD COLUMN price DECIMAL(10,2) NOT NULL DEFAULT 0;