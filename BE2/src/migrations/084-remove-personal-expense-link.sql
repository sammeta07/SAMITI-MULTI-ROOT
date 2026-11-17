-- Keep legacy claim and reimbursement rows intact; remove only their obsolete source link.
SET @source_transaction_fk_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'task_finance_requests'
    AND CONSTRAINT_NAME = 'fk_task_finance_requests_source_transaction'
);
SET @sql = IF(
  @source_transaction_fk_exists > 0,
  'ALTER TABLE task_finance_requests DROP FOREIGN KEY fk_task_finance_requests_source_transaction',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @source_transaction_index_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'task_finance_requests'
    AND INDEX_NAME = 'uq_task_finance_requests_source_transaction'
);
SET @sql = IF(
  @source_transaction_index_exists > 0,
  'DROP INDEX uq_task_finance_requests_source_transaction ON task_finance_requests',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @source_transaction_column_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'task_finance_requests'
    AND COLUMN_NAME = 'source_transaction_id'
);
SET @sql = IF(
  @source_transaction_column_exists > 0,
  'ALTER TABLE task_finance_requests DROP COLUMN source_transaction_id',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
