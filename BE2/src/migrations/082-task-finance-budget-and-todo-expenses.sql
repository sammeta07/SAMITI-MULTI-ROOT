SET @todos_expense_amount_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'todos'
    AND COLUMN_NAME = 'expense_amount'
);
SET @sql = IF(
  @todos_expense_amount_exists = 0,
  'ALTER TABLE todos ADD COLUMN expense_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00 AFTER title',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @finance_budget_request_column_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'task_finance_requests'
    AND COLUMN_NAME = 'source_budget_request_id'
);
SET @sql = IF(
  @finance_budget_request_column_exists = 0,
  'ALTER TABLE task_finance_requests ADD COLUMN source_budget_request_id BIGINT UNSIGNED DEFAULT NULL AFTER source_transaction_id',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @finance_budget_request_index_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'task_finance_requests'
    AND INDEX_NAME = 'uq_task_finance_requests_budget_source'
);
SET @sql = IF(
  @finance_budget_request_index_exists = 0,
  'CREATE UNIQUE INDEX uq_task_finance_requests_budget_source ON task_finance_requests(source_budget_request_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @finance_budget_request_fk_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'task_finance_requests'
    AND CONSTRAINT_NAME = 'fk_task_finance_requests_budget_source'
);
SET @sql = IF(
  @finance_budget_request_fk_exists = 0,
  'ALTER TABLE task_finance_requests ADD CONSTRAINT fk_task_finance_requests_budget_source FOREIGN KEY (source_budget_request_id) REFERENCES task_budget_requests(id) ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
