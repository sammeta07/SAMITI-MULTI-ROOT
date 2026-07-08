-- Migration 025: Drop role_code and description from events_roles_master
-- Purpose: Keep master role data in bilingual names only.

ALTER TABLE events_roles_master
  DROP COLUMN role_code;

ALTER TABLE events_roles_master
  DROP COLUMN description;
