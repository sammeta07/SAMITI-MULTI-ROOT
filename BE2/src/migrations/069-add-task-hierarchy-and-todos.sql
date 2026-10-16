-- Add full child-task relationships and checklist items for tasks and programs.
ALTER TABLE tasks
  ADD COLUMN parent_id INT NULL AFTER event_id;

CREATE INDEX idx_tasks_parent_id ON tasks(parent_id);

ALTER TABLE tasks
  ADD CONSTRAINT fk_tasks_parent FOREIGN KEY (parent_id) REFERENCES tasks(id) ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS todos (
  id INT NOT NULL AUTO_INCREMENT,
  program_id INT DEFAULT NULL,
  task_id INT DEFAULT NULL,
  title VARCHAR(255) NOT NULL,
  is_completed TINYINT(1) NOT NULL DEFAULT 0,
  created_by INT NOT NULL,
  updated_by INT DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_todos_program_id (program_id),
  KEY idx_todos_task_id (task_id),
  CONSTRAINT chk_todos_single_parent CHECK ((program_id IS NULL) <> (task_id IS NULL)),
  CONSTRAINT fk_todos_program FOREIGN KEY (program_id) REFERENCES programs(id) ON DELETE CASCADE,
  CONSTRAINT fk_todos_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  CONSTRAINT fk_todos_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_todos_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
