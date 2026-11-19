UPDATE task_finance_requests
SET status = 'APPROVED',
    approved_amount = requested_amount,
    reviewed_by = COALESCE(reviewed_by, authority_reviewed_by),
    review_note = COALESCE(review_note, authority_review_note),
    reviewed_at = COALESCE(reviewed_at, authority_reviewed_at)
WHERE request_type = 'ADVANCE'
  AND status = 'PENDING'
  AND approval_stage = 'TREASURER'
  AND authority_decision = 'APPROVED';
