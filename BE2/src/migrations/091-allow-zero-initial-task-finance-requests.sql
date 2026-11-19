ALTER TABLE task_finance_requests
  DROP CHECK chk_task_finance_request_amount,
  ADD CONSTRAINT chk_task_finance_request_amount CHECK (requested_amount >= 0);
