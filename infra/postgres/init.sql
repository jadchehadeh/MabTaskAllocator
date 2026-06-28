CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE user_role AS ENUM ('superadmin', 'admin', 'user');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_priority') THEN
    CREATE TYPE task_priority AS ENUM ('low', 'medium', 'high', 'urgent');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_status') THEN
    CREATE TYPE task_status AS ENUM ('new', 'assigned', 'in_progress', 'blocked', 'done');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id uuid REFERENCES departments(id) ON DELETE SET NULL,
  name text NOT NULL,
  username citext NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role user_role NOT NULL DEFAULT 'user',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  department_id uuid REFERENCES departments(id) ON DELETE SET NULL,
  created_by_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  assigned_to_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  candidate_name text,
  priority task_priority NOT NULL DEFAULT 'medium',
  status task_status NOT NULL DEFAULT 'new',
  progress integer NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  due_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS task_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  action text NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_users_role ON app_users(role);
CREATE INDEX IF NOT EXISTS idx_app_users_department_id ON app_users(department_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to_id ON tasks(assigned_to_id);
CREATE INDEX IF NOT EXISTS idx_tasks_department_id ON tasks(department_id);
CREATE INDEX IF NOT EXISTS idx_task_activity_task_id ON task_activity(task_id);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS departments_set_updated_at ON departments;
CREATE TRIGGER departments_set_updated_at
BEFORE UPDATE ON departments
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS app_users_set_updated_at ON app_users;
CREATE TRIGGER app_users_set_updated_at
BEFORE UPDATE ON app_users
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS tasks_set_updated_at ON tasks;
CREATE TRIGGER tasks_set_updated_at
BEFORE UPDATE ON tasks
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

INSERT INTO departments (name)
VALUES
  ('Executive'),
  ('Mechanical Technical office engineer'),
  ('Electrical Technical office engineer')
ON CONFLICT (name) DO NOTHING;

INSERT INTO app_users (name, username, password_hash, role, department_id)
VALUES
  (
    'J. Chehade',
    'j.chehade@mabunited.com',
    crypt('jadjadjad1', gen_salt('bf')),
    'superadmin',
    (SELECT id FROM departments WHERE name = 'Executive')
  ),
  (
    'MAB Super User',
    'super.user@mabunited.com',
    crypt('super12345', gen_salt('bf')),
    'admin',
    (SELECT id FROM departments WHERE name = 'Electrical Technical office engineer')
  ),
  (
    'Bilal',
    'bilal@mabunited.com',
    crypt('bilal123', gen_salt('bf')),
    'admin',
    (SELECT id FROM departments WHERE name = 'Mechanical Technical office engineer')
  ),
  (
    'Ali',
    'ali@mabunited.com',
    crypt('ali123', gen_salt('bf')),
    'user',
    (SELECT id FROM departments WHERE name = 'Mechanical Technical office engineer')
  ),
  (
    'Sara Ahmed',
    'sara.ahmed@mabunited.com',
    crypt('sara123', gen_salt('bf')),
    'user',
    (SELECT id FROM departments WHERE name = 'Mechanical Technical office engineer')
  ),
  (
    'Maya Nasser',
    'maya.nasser@mabunited.com',
    crypt('maya123', gen_salt('bf')),
    'user',
    (SELECT id FROM departments WHERE name = 'Electrical Technical office engineer')
  )
ON CONFLICT (username) DO NOTHING;

INSERT INTO tasks (title, description, department_id, created_by_id, assigned_to_id, candidate_name, priority, status, progress, due_date)
SELECT
    'Prepare HVAC shop drawing package',
    'Prepare the HVAC shop drawing package for consultant review.',
    (SELECT id FROM departments WHERE name = 'Mechanical Technical office engineer'),
    (SELECT id FROM app_users WHERE username = 'bilal@mabunited.com'),
    (SELECT id FROM app_users WHERE username = 'ali@mabunited.com'),
    'Ali',
    'high',
    'in_progress',
    62,
    DATE '2026-07-01'
WHERE NOT EXISTS (SELECT 1 FROM tasks WHERE title = 'Prepare HVAC shop drawing package');

INSERT INTO tasks (title, description, department_id, created_by_id, assigned_to_id, candidate_name, priority, status, progress, due_date)
SELECT
    'Review electrical load schedule',
    'Review and validate the electrical load schedule before submission.',
    (SELECT id FROM departments WHERE name = 'Electrical Technical office engineer'),
    (SELECT id FROM app_users WHERE username = 'super.user@mabunited.com'),
    (SELECT id FROM app_users WHERE username = 'maya.nasser@mabunited.com'),
    'Maya Nasser',
    'medium',
    'assigned',
    35,
    DATE '2026-07-03'
WHERE NOT EXISTS (SELECT 1 FROM tasks WHERE title = 'Review electrical load schedule');

INSERT INTO tasks (title, description, department_id, created_by_id, assigned_to_id, candidate_name, priority, status, progress, due_date)
SELECT
    'Resolve MEP coordination comments',
    'Resolve coordination comments related to the latest MEP clash report.',
    (SELECT id FROM departments WHERE name = 'Mechanical Technical office engineer'),
    (SELECT id FROM app_users WHERE username = 'j.chehade@mabunited.com'),
    NULL,
    'Unassigned',
    'urgent',
    'new',
    0,
    DATE '2026-06-30'
WHERE NOT EXISTS (SELECT 1 FROM tasks WHERE title = 'Resolve MEP coordination comments');

INSERT INTO task_activity (task_id, actor_id, action, notes)
SELECT
  tasks.id,
  tasks.created_by_id,
  'created',
  'Seeded from initial MAB Task Allocator setup.'
FROM tasks
WHERE NOT EXISTS (
  SELECT 1
  FROM task_activity
  WHERE task_activity.task_id = tasks.id
);
