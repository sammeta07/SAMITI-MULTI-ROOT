INSERT INTO task_subtask_transfers (
  parent_task_id,
  subtask_id,
  sender_user_id,
  recipient_user_id,
  amount,
  description,
  status
)
SELECT
  subtask.parent_id,
  subtask.id,
  subtask.created_by,
  subtask.owner_user_id,
  subtask.budget_amount,
  'Subtask budget transfer',
  'PENDING'
FROM tasks subtask
WHERE subtask.parent_id IS NOT NULL
  AND subtask.owner_user_id IS NOT NULL
  AND subtask.budget_amount > 0
  AND NOT EXISTS (
    SELECT 1
    FROM task_subtask_transfers transfer
    WHERE transfer.subtask_id = subtask.id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM task_finance_transactions payment
    WHERE payment.task_id = subtask.id
      AND payment.transaction_type = 'ADVANCE_ISSUED'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM task_finance_requests initialRequest
    WHERE initialRequest.task_id = subtask.parent_id
      AND initialRequest.request_type = 'ADVANCE'
      AND initialRequest.reason = 'Initial sanctioned task budget'
      AND initialRequest.status <> 'APPROVED'
  );
