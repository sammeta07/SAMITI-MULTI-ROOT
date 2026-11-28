UPDATE task_budget_requests request
INNER JOIN tasks subtask ON subtask.id = request.task_id
SET request.approval_stage = 'CREATOR',
    request.creator_decision = NULL,
    request.creator_reviewed_by = NULL,
    request.creator_review_note = NULL,
    request.creator_reviewed_at = NULL,
    request.authority_decision = NULL,
    request.authority_reviewed_by = NULL,
    request.authority_review_note = NULL,
    request.authority_reviewed_at = NULL,
    request.reviewed_by = NULL,
    request.review_note = NULL,
    request.reviewed_at = NULL
WHERE subtask.parent_id IS NOT NULL
  AND request.status = 'PENDING'
  AND request.approval_stage = 'AUTHORITY';
