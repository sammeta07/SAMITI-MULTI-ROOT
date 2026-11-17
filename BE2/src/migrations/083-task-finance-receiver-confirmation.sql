SET @finance_recipient_column_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'task_finance_transactions'
    AND COLUMN_NAME = 'recipient_user_id'
);
SET @sql = IF(
  @finance_recipient_column_exists = 0,
  'ALTER TABLE task_finance_transactions ADD COLUMN recipient_user_id INT DEFAULT NULL AFTER request_id',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @finance_received_by_column_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'task_finance_transactions'
    AND COLUMN_NAME = 'received_by'
);
SET @sql = IF(
  @finance_received_by_column_exists = 0,
  'ALTER TABLE task_finance_transactions ADD COLUMN received_by INT DEFAULT NULL AFTER confirmed_by',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @finance_received_at_column_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'task_finance_transactions'
    AND COLUMN_NAME = 'received_at'
);
SET @sql = IF(
  @finance_received_at_column_exists = 0,
  'ALTER TABLE task_finance_transactions ADD COLUMN received_at TIMESTAMP NULL DEFAULT NULL AFTER confirmed_at',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @finance_recipient_fk_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'task_finance_transactions'
    AND CONSTRAINT_NAME = 'fk_task_finance_transactions_recipient'
);
SET @sql = IF(
  @finance_recipient_fk_exists = 0,
  'ALTER TABLE task_finance_transactions ADD CONSTRAINT fk_task_finance_transactions_recipient FOREIGN KEY (recipient_user_id) REFERENCES users(id) ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @finance_receiver_fk_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'task_finance_transactions'
    AND CONSTRAINT_NAME = 'fk_task_finance_transactions_receiver'
);
SET @sql = IF(
  @finance_receiver_fk_exists = 0,
  'ALTER TABLE task_finance_transactions ADD CONSTRAINT fk_task_finance_transactions_receiver FOREIGN KEY (received_by) REFERENCES users(id) ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
