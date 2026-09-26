-- Migration 061: Replace the legacy puja event category.
UPDATE events
SET category = 'RELIGIOUS'
WHERE UPPER(TRIM(category)) = 'PUJA';
