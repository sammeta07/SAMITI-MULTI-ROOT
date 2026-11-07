CREATE TABLE IF NOT EXISTS task_finance_requests (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  task_id INT NOT NULL,
  request_type ENUM('ADVANCE', 'TOP_UP', 'REIMBURSEMENT') NOT NULL,
  requested_amount DECIMAL(12, 2) NOT NULL,
  approved_amount DECIMAL(12, 2) DEFAULT NULL,
  reason VARCHAR(1000) NOT NULL,
  status ENUM('PENDING', 'APPROVED', 'PARTIALLY_APPROVED', 'REJECTED', 'PAID') NOT NULL DEFAULT 'PENDING',
  requested_by INT NOT NULL,
  reviewed_by INT DEFAULT NULL,
  review_note VARCHAR(1000) DEFAULT NULL,
  source_transaction_id BIGINT UNSIGNED DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_task_finance_requests_task (task_id, created_at),
  KEY idx_task_finance_requests_requester (requested_by),
  KEY idx_task_finance_requests_reviewer (reviewed_by),
  CONSTRAINT chk_task_finance_request_amount CHECK (requested_amount > 0),
  CONSTRAINT chk_task_finance_approved_amount CHECK (approved_amount IS NULL OR approved_amount >= 0),
  CONSTRAINT fk_task_finance_requests_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  CONSTRAINT fk_task_finance_requests_requester FOREIGN KEY (requested_by) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_task_finance_requests_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS task_finance_transactions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  task_id INT NOT NULL,
  request_id BIGINT UNSIGNED DEFAULT NULL,
  transaction_type ENUM('ADVANCE_ISSUED', 'ADVANCE_EXPENSE', 'PERSONAL_EXPENSE', 'ADVANCE_RETURN', 'REIMBURSEMENT_PAID') NOT NULL,
  amount DECIMAL(12, 2) NOT NULL,
  description VARCHAR(1000) NOT NULL,
  status ENUM('RECORDED', 'PENDING', 'CONFIRMED', 'REJECTED', 'PAID') NOT NULL DEFAULT 'RECORDED',
  created_by INT NOT NULL,
  confirmed_by INT DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  confirmed_at TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_task_finance_transactions_task (task_id, created_at),
  KEY idx_task_finance_transactions_request (request_id),
  KEY idx_task_finance_transactions_creator (created_by),
  CONSTRAINT chk_task_finance_transaction_amount CHECK (amount > 0),
  CONSTRAINT fk_task_finance_transactions_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  CONSTRAINT fk_task_finance_transactions_request FOREIGN KEY (request_id) REFERENCES task_finance_requests(id) ON DELETE SET NULL,
  CONSTRAINT fk_task_finance_transactions_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_task_finance_transactions_confirmer FOREIGN KEY (confirmed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE task_finance_requests
  ADD CONSTRAINT fk_task_finance_requests_source_transaction
  FOREIGN KEY (source_transaction_id) REFERENCES task_finance_transactions(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX uq_task_finance_requests_source_transaction
  ON task_finance_requests(source_transaction_id);
