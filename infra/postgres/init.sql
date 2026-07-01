CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY,
  name text NOT NULL,
  username text NOT NULL,
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('superadmin', 'admin', 'user')),
  department text NOT NULL,
  created_at text NOT NULL DEFAULT (timezone('UTC', now())::text)
);

CREATE TABLE IF NOT EXISTS departments (
  id text PRIMARY KEY,
  name text NOT NULL,
  created_by_id text REFERENCES users(id) ON DELETE SET NULL,
  created_at text NOT NULL DEFAULT (timezone('UTC', now())::text)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_departments_name_ci ON departments (lower(name));

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_ci ON users (lower(username));

CREATE TABLE IF NOT EXISTS sessions (
  token text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at text NOT NULL DEFAULT (timezone('UTC', now())::text),
  last_active_at text NOT NULL DEFAULT (timezone('UTC', now())::text)
);

CREATE TABLE IF NOT EXISTS projects (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  department text NOT NULL,
  created_by_id text REFERENCES users(id) ON DELETE SET NULL,
  created_at text NOT NULL DEFAULT (timezone('UTC', now())::text)
);

CREATE TABLE IF NOT EXISTS project_members (
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (project_id, user_id)
);

CREATE TABLE IF NOT EXISTS tasks (
  id text PRIMARY KEY,
  title text NOT NULL,
  department text NOT NULL,
  priority text NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status text NOT NULL CHECK (status IN ('new', 'assigned', 'in_progress', 'blocked', 'under_review', 'done')),
  assignee_id text REFERENCES users(id) ON DELETE SET NULL,
  project_id text REFERENCES projects(id) ON DELETE SET NULL,
  task_type text NOT NULL DEFAULT 'Technical',
  task_code text,
  due_date text,
  complexity integer NOT NULL DEFAULT 3 CHECK (complexity BETWEEN 1 AND 5),
  started_at text,
  claim_requested_by_id text REFERENCES users(id) ON DELETE SET NULL,
  claim_requested_at text,
  progress integer NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  review_comment text,
  completed_at text,
  created_by_id text REFERENCES users(id) ON DELETE SET NULL,
  created_at text NOT NULL DEFAULT (timezone('UTC', now())::text),
  updated_at text NOT NULL DEFAULT (timezone('UTC', now())::text)
);

CREATE TABLE IF NOT EXISTS task_assignees (
  task_id text NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, user_id)
);

ALTER TABLE tasks ALTER COLUMN due_date DROP NOT NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS complexity integer NOT NULL DEFAULT 3;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS started_at text;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS claim_requested_by_id text REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS claim_requested_at text;
DO $$ BEGIN
  ALTER TABLE tasks ADD CONSTRAINT tasks_complexity_check CHECK (complexity BETWEEN 1 AND 5);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

UPDATE tasks SET complexity = 3 WHERE complexity IS NULL OR complexity < 1 OR complexity > 5;
UPDATE tasks SET started_at = created_at
WHERE started_at IS NULL AND EXISTS (SELECT 1 FROM task_assignees WHERE task_assignees.task_id = tasks.id);
UPDATE tasks SET due_date = NULL, started_at = NULL
WHERE status != 'done' AND NOT EXISTS (SELECT 1 FROM task_assignees WHERE task_assignees.task_id = tasks.id);

CREATE TABLE IF NOT EXISTS task_worker_approvals (
  task_id text NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  approved_at text NOT NULL DEFAULT (timezone('UTC', now())::text),
  PRIMARY KEY (task_id, user_id)
);

CREATE TABLE IF NOT EXISTS task_code_sequences (
  prefix text PRIMARY KEY,
  next_number integer NOT NULL
);

CREATE TABLE IF NOT EXISTS task_messages (
  id text PRIMARY KEY,
  task_id text NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  author_id text REFERENCES users(id) ON DELETE SET NULL,
  author_name text NOT NULL,
  body text NOT NULL,
  created_at text NOT NULL DEFAULT (timezone('UTC', now())::text)
);

CREATE TABLE IF NOT EXISTS task_files (
  id text PRIMARY KEY,
  task_id text NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  name text NOT NULL,
  uploaded_by text NOT NULL,
  uploaded_at text NOT NULL DEFAULT (timezone('UTC', now())::text),
  storage_name text,
  mime_type text,
  size integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS notifications (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  task_id text REFERENCES tasks(id) ON DELETE CASCADE,
  is_read integer NOT NULL DEFAULT 0,
  created_at text NOT NULL DEFAULT (timezone('UTC', now())::text)
);

CREATE TABLE IF NOT EXISTS todos (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id text REFERENCES tasks(id) ON DELETE SET NULL,
  title text NOT NULL,
  is_completed integer NOT NULL DEFAULT 0,
  completed_at text,
  created_at text NOT NULL DEFAULT (timezone('UTC', now())::text),
  updated_at text NOT NULL DEFAULT (timezone('UTC', now())::text)
);

CREATE TABLE IF NOT EXISTS chat_groups (
  id text PRIMARY KEY,
  name text NOT NULL,
  department text NOT NULL,
  created_by_id text REFERENCES users(id) ON DELETE SET NULL,
  task_id text REFERENCES tasks(id) ON DELETE CASCADE,
  created_at text NOT NULL DEFAULT (timezone('UTC', now())::text)
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id text PRIMARY KEY,
  channel_id text NOT NULL,
  department text NOT NULL,
  author_id text REFERENCES users(id) ON DELETE SET NULL,
  author_name text NOT NULL,
  body text NOT NULL,
  created_at text NOT NULL DEFAULT (timezone('UTC', now())::text)
);

CREATE INDEX IF NOT EXISTS idx_tasks_department ON tasks(department);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_code ON tasks(task_code);
CREATE INDEX IF NOT EXISTS idx_task_assignees_user ON task_assignees(user_id, task_id);
CREATE INDEX IF NOT EXISTS idx_project_members_user ON project_members(user_id, project_id);
CREATE INDEX IF NOT EXISTS idx_task_messages_task ON task_messages(task_id, created_at);
CREATE INDEX IF NOT EXISTS idx_task_files_task ON task_files(task_id, uploaded_at);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_todos_user ON todos(user_id, is_completed, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_activity ON sessions(last_active_at);
CREATE INDEX IF NOT EXISTS idx_chat_groups_department ON chat_groups(department, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_groups_task ON chat_groups(task_id) WHERE task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chat_messages_department ON chat_messages(department, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_channel ON chat_messages(channel_id, created_at DESC);

INSERT INTO departments (id, name)
VALUES
  ('department-executive', 'Executive'),
  ('department-mechanical', 'Mechanical Technical office engineer'),
  ('department-electrical', 'Electrical Technical office engineer'),
  ('department-document-control', 'Document Controller')
ON CONFLICT DO NOTHING;

INSERT INTO departments (id, name)
SELECT 'department-' || md5(department), department
FROM (
  SELECT department FROM users
  UNION SELECT department FROM projects
  UNION SELECT department FROM tasks
  UNION SELECT department FROM chat_groups
) existing_departments
WHERE department IS NOT NULL AND department != ''
ON CONFLICT DO NOTHING;
