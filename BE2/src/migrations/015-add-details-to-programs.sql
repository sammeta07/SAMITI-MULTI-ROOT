ALTER TABLE programs
  ADD COLUMN start_date_time DATETIME NULL AFTER name,
  ADD COLUMN end_date_time DATETIME NULL AFTER start_date_time,
  ADD COLUMN description LONGTEXT NULL AFTER end_date_time,
  ADD COLUMN address VARCHAR(255) NULL AFTER description,
  ADD COLUMN visibility VARCHAR(50) NULL AFTER address,
  ADD COLUMN created_by INT NULL AFTER visibility,
  ADD COLUMN updated_by INT NULL AFTER created_by;

UPDATE programs
SET
  start_date_time = COALESCE(start_date_time, created_at),
  end_date_time = COALESCE(end_date_time, created_at),
  visibility = COALESCE(NULLIF(visibility, ''), 'VISIBLE'),
  created_by = COALESCE(created_by, 1),
  updated_by = COALESCE(updated_by, created_by, 1)
WHERE
  start_date_time IS NULL
  OR end_date_time IS NULL
  OR visibility IS NULL
  OR created_by IS NULL
  OR updated_by IS NULL;

ALTER TABLE programs
  MODIFY COLUMN start_date_time DATETIME NOT NULL,
  MODIFY COLUMN end_date_time DATETIME NOT NULL,
  MODIFY COLUMN visibility VARCHAR(50) NOT NULL DEFAULT 'VISIBLE',
  MODIFY COLUMN created_by INT NOT NULL,
  MODIFY COLUMN updated_by INT NOT NULL;
