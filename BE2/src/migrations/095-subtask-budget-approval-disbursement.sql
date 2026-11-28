ALTER TABLE task_subtask_transfers
  ADD COLUMN source_budget_request_id BIGINT UNSIGNED DEFAULT NULL AFTER subtask_id,
  ADD KEY idx_task_subtask_transfers_budget_request (source_budget_request_id),
  ADD CONSTRAINT fk_task_subtask_transfers_budget_request
    FOREIGN KEY (source_budget_request_id) REFERENCES task_budget_requests(id) ON DELETE SET NULL;

INSERT INTO task_budget_requests (
  task_id,
  requested_amount,
  budget_before_request,
  requested_by,
  approval_stage
)
SELECT
  subtask.id,
  subtask.budget_amount,
  0,
  subtask.created_by,
  'CREATOR'
FROM tasks subtask
WHERE subtask.parent_id IS NOT NULL
  AND subtask.budget_amount > 0
  AND NOT EXISTS (
    SELECT 1
    FROM task_subtask_transfers transfer
    WHERE transfer.subtask_id = subtask.id
      AND transfer.status = 'CONFIRMED'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM task_finance_transactions payment
    WHERE payment.task_id = subtask.id
      AND payment.transaction_type = 'ADVANCE_ISSUED'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM task_budget_requests request
    WHERE request.task_id = subtask.id
      AND request.budget_before_request = 0
      AND request.requested_amount = subtask.budget_amount
  );

UPDATE task_budget_requests request
INNER JOIN tasks subtask ON subtask.id = request.task_id
SET request.approval_stage = 'AUTHORITY'
WHERE subtask.parent_id IS NOT NULL
  AND request.status = 'PENDING'
  AND request.approval_stage = 'CREATOR'
  AND request.budget_before_request > 0
  AND request.requested_amount > request.budget_before_request;

DELETE transfer
FROM task_subtask_transfers transfer
INNER JOIN task_budget_requests request
  ON request.task_id = transfer.subtask_id
 AND request.status = 'PENDING'
 AND request.approval_stage = 'CREATOR'
 AND request.budget_before_request = 0
WHERE transfer.status = 'PENDING'
  AND transfer.source_budget_request_id IS NULL;
