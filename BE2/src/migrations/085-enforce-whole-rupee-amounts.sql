-- Round existing monetary values before changing the columns to whole rupees.
UPDATE programs SET price = ROUND(price);
ALTER TABLE programs
  MODIFY COLUMN price DECIMAL(10, 0) NOT NULL DEFAULT 0;

UPDATE tasks SET budget_amount = ROUND(budget_amount);
ALTER TABLE tasks
  MODIFY COLUMN budget_amount DECIMAL(12, 0) NOT NULL DEFAULT 0;

UPDATE task_budget_requests SET requested_amount = ROUND(requested_amount);
ALTER TABLE task_budget_requests
  MODIFY COLUMN requested_amount DECIMAL(12, 0) NOT NULL;

-- Preserve the existing positive-amount constraints when sub-₹0.50 values round to zero.
UPDATE task_finance_requests
SET requested_amount = GREATEST(1, ROUND(requested_amount)),
    approved_amount = CASE
      WHEN approved_amount IS NULL THEN NULL
      ELSE ROUND(approved_amount)
    END;
ALTER TABLE task_finance_requests
  MODIFY COLUMN requested_amount DECIMAL(12, 0) NOT NULL,
  MODIFY COLUMN approved_amount DECIMAL(12, 0) DEFAULT NULL;

UPDATE task_finance_transactions SET amount = GREATEST(1, ROUND(amount));
ALTER TABLE task_finance_transactions
  MODIFY COLUMN amount DECIMAL(12, 0) NOT NULL;

UPDATE todos SET expense_amount = ROUND(expense_amount);
ALTER TABLE todos
  MODIFY COLUMN expense_amount DECIMAL(12, 0) NOT NULL DEFAULT 0;
