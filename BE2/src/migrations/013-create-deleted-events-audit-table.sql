-- Migration: Create deleted events audit trail table

CREATE TABLE IF NOT EXISTS deleted_events_audit (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  event_id INT NOT NULL,
  event_name VARCHAR(255) NOT NULL,
  committee_id INT NULL,
  deleted_by INT NOT NULL,
  deleted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  event_snapshot LONGTEXT NULL,
  INDEX idx_deleted_events_audit_event_id (event_id),
  INDEX idx_deleted_events_audit_deleted_by (deleted_by),
  INDEX idx_deleted_events_audit_deleted_at (deleted_at),
  CONSTRAINT fk_deleted_events_audit_deleted_by
    FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE RESTRICT
);
