ALTER TABLE task_finance_requests
  ADD COLUMN approval_stage ENUM('AUTHORITY', 'TREASURER') NOT NULL DEFAULT 'TREASURER' AFTER status,
  ADD COLUMN authority_decision ENUM('APPROVED', 'REJECTED') DEFAULT NULL AFTER review_note,
  ADD COLUMN authority_reviewed_by INT DEFAULT NULL AFTER authority_decision,
  ADD COLUMN authority_review_note VARCHAR(1000) DEFAULT NULL AFTER authority_reviewed_by,
  ADD COLUMN authority_reviewed_at TIMESTAMP NULL DEFAULT NULL AFTER authority_review_note,
  ADD KEY idx_task_finance_requests_stage (status, approval_stage, task_id),
  ADD CONSTRAINT fk_task_finance_requests_authority_reviewer
    FOREIGN KEY (authority_reviewed_by) REFERENCES users(id) ON DELETE SET NULL;

UPDATE task_finance_requests
SET approval_stage = 'AUTHORITY'
WHERE request_type = 'ADVANCE'
  AND status = 'PENDING'
  AND authority_decision IS NULL;

UPDATE task_finance_requests
SET status = 'PENDING',
    approval_stage = 'AUTHORITY',
    approved_amount = NULL,
    reviewed_by = NULL,
    review_note = NULL,
    reviewed_at = NULL
WHERE request_type = 'ADVANCE'
  AND reason = 'Initial sanctioned task budget'
  AND status IN ('APPROVED', 'PARTIALLY_APPROVED')
  AND authority_decision IS NULL;
