ALTER TABLE todos
  ADD COLUMN assigned_user_id INT DEFAULT NULL AFTER title,
  ADD COLUMN status VARCHAR(30) NOT NULL DEFAULT 'PENDING' AFTER assigned_user_id,
  ADD COLUMN assigned_by INT DEFAULT NULL AFTER updated_by,
  ADD COLUMN assigned_at TIMESTAMP NULL DEFAULT NULL AFTER assigned_by,
  ADD KEY idx_todos_assigned_user_id (assigned_user_id),
  ADD CONSTRAINT fk_todos_assigned_user FOREIGN KEY (assigned_user_id) REFERENCES users(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_todos_assigned_by FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL;

UPDATE todos
SET status = CASE WHEN is_completed = 1 THEN 'COMPLETED' ELSE 'PENDING' END;
