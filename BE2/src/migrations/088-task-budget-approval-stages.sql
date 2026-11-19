ALTER TABLE task_budget_requests
  ADD COLUMN budget_before_request DECIMAL(12, 2) NOT NULL DEFAULT 0.00 AFTER requested_amount,
  ADD COLUMN approval_stage ENUM('CREATOR', 'AUTHORITY') NOT NULL DEFAULT 'AUTHORITY' AFTER status,
  ADD COLUMN creator_decision ENUM('APPROVED', 'REJECTED') DEFAULT NULL AFTER review_note,
  ADD COLUMN creator_reviewed_by INT DEFAULT NULL AFTER creator_decision,
  ADD COLUMN creator_review_note VARCHAR(1000) DEFAULT NULL AFTER creator_reviewed_by,
  ADD COLUMN creator_reviewed_at TIMESTAMP NULL DEFAULT NULL AFTER creator_review_note,
  ADD COLUMN authority_decision ENUM('APPROVED', 'REJECTED') DEFAULT NULL AFTER creator_reviewed_at,
  ADD COLUMN authority_reviewed_by INT DEFAULT NULL AFTER authority_decision,
  ADD COLUMN authority_review_note VARCHAR(1000) DEFAULT NULL AFTER authority_reviewed_by,
  ADD COLUMN authority_reviewed_at TIMESTAMP NULL DEFAULT NULL AFTER authority_review_note,
  ADD KEY idx_task_budget_requests_stage (status, approval_stage, task_id),
  ADD CONSTRAINT fk_task_budget_requests_creator_reviewer
    FOREIGN KEY (creator_reviewed_by) REFERENCES users(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_task_budget_requests_authority_reviewer
    FOREIGN KEY (authority_reviewed_by) REFERENCES users(id) ON DELETE SET NULL;

UPDATE task_budget_requests request
INNER JOIN tasks task ON task.id = request.task_id
SET request.budget_before_request = CASE
      WHEN request.status = 'PENDING' THEN task.budget_amount
      ELSE 0
    END,
    request.approval_stage = CASE
      WHEN task.parent_id IS NULL THEN 'AUTHORITY'
      ELSE 'CREATOR'
    END,
    request.authority_decision = CASE
      WHEN request.status = 'APPROVED' THEN 'APPROVED'
      WHEN request.status = 'REJECTED' THEN 'REJECTED'
      ELSE NULL
    END,
    request.authority_reviewed_by = CASE
      WHEN request.status IN ('APPROVED', 'REJECTED') THEN request.reviewed_by
      ELSE NULL
    END,
    request.authority_review_note = CASE
      WHEN request.status IN ('APPROVED', 'REJECTED') THEN request.review_note
      ELSE NULL
    END,
    request.authority_reviewed_at = CASE
      WHEN request.status IN ('APPROVED', 'REJECTED') THEN request.reviewed_at
      ELSE NULL
    END;
