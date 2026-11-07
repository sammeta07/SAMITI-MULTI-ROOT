ALTER TABLE tasks
  ADD COLUMN budget_decided TINYINT(1) NOT NULL DEFAULT 1 AFTER budget_amount;

CREATE TABLE task_budget_requests (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  task_id INT NOT NULL,
  requested_amount DECIMAL(12, 2) NOT NULL,
  budget_decided TINYINT(1) NOT NULL DEFAULT 1,
  requested_by INT NOT NULL,
  status ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
  reviewed_by INT DEFAULT NULL,
  review_note VARCHAR(1000) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_task_budget_requests_task (task_id, status, created_at),
  KEY idx_task_budget_requests_requester (requested_by),
  CONSTRAINT fk_task_budget_requests_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  CONSTRAINT fk_task_budget_requests_requester FOREIGN KEY (requested_by) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_task_budget_requests_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT chk_task_budget_request_amount CHECK (requested_amount >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
