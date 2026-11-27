ALTER TABLE todos
  ADD COLUMN expense_status ENUM('RESERVED', 'CONFIRMED') NOT NULL DEFAULT 'CONFIRMED' AFTER expense_amount,
  ADD COLUMN expense_confirmed_by INT DEFAULT NULL AFTER expense_status,
  ADD COLUMN expense_confirmed_at TIMESTAMP NULL DEFAULT NULL AFTER expense_confirmed_by,
  ADD KEY idx_todos_task_expense_status (task_id, expense_status, status),
  ADD CONSTRAINT fk_todos_expense_confirmed_by
    FOREIGN KEY (expense_confirmed_by) REFERENCES users(id) ON DELETE SET NULL;

UPDATE todos
SET expense_confirmed_by = created_by,
    expense_confirmed_at = created_at
WHERE expense_status = 'CONFIRMED'
  AND expense_amount > 0;
