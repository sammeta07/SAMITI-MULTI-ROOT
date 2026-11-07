SET @task_budget_decided_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'tasks'
    AND COLUMN_NAME = 'budget_decided'
);
SET @sql = IF(
  @task_budget_decided_exists > 0,
  'ALTER TABLE tasks DROP COLUMN budget_decided',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @request_budget_decided_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'task_budget_requests'
    AND COLUMN_NAME = 'budget_decided'
);
SET @sql = IF(
  @request_budget_decided_exists > 0,
  'ALTER TABLE task_budget_requests DROP COLUMN budget_decided',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
