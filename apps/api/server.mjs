import { createServer } from "node:http";
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const port = Number(process.env.PORT ?? 4000);
const databasePath = resolve(process.env.API_DATABASE_PATH ?? "apps/api/data/mab.sqlite");
mkdirSync(dirname(databasePath), { recursive: true });

const db = new DatabaseSync(databasePath);
db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    username TEXT NOT NULL COLLATE NOCASE UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('superadmin', 'admin', 'user')),
    department TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    department TEXT NOT NULL,
    priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    status TEXT NOT NULL CHECK (status IN ('new', 'assigned', 'in_progress', 'blocked', 'under_review', 'done')),
    assignee_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    due_date TEXT NOT NULL,
    progress INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
    review_comment TEXT,
    completed_at TEXT,
    created_by_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS task_messages (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    author_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    author_name TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS task_files (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    uploaded_by TEXT NOT NULL,
    uploaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
    is_read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_tasks_department ON tasks(department);
  CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id);
  CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC);
`);

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

function passwordMatches(password, storedHash) {
  const [salt, key] = storedHash.split(":");
  if (!salt || !key) return false;
  const stored = Buffer.from(key, "hex");
  const supplied = scryptSync(password, salt, stored.length);
  return stored.length === supplied.length && timingSafeEqual(stored, supplied);
}

const superadminExists = db.prepare("SELECT id FROM users WHERE role = 'superadmin' LIMIT 1").get();
if (!superadminExists) {
  db.prepare(`
    INSERT INTO users (id, name, username, password_hash, role, department)
    VALUES (?, ?, ?, ?, 'superadmin', 'Executive')
  `).run("user-superadmin", "J. Chehade", "j.chehade@mabunited.com", hashPassword("jadjadjad1"));
}

function publicUser(row) {
  return {
    id: row.id,
    name: row.name,
    username: row.username,
    role: row.role,
    department: row.department
  };
}

function formatDate(value) {
  if (!value) return undefined;
  return new Date(`${value.replace(" ", "T")}Z`).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function getTask(taskId) {
  return db.prepare(`
    SELECT tasks.*, users.name AS candidate_name
    FROM tasks LEFT JOIN users ON users.id = tasks.assignee_id
    WHERE tasks.id = ?
  `).get(taskId);
}

function serializeTask(row) {
  const messages = db.prepare(`
    SELECT id, author_name, body, created_at FROM task_messages
    WHERE task_id = ? ORDER BY created_at ASC
  `).all(row.id).map((message) => ({
    id: message.id,
    authorName: message.author_name,
    body: message.body,
    createdAt: formatDate(message.created_at)
  }));
  const files = db.prepare(`
    SELECT id, name, uploaded_by, uploaded_at FROM task_files
    WHERE task_id = ? ORDER BY uploaded_at ASC
  `).all(row.id).map((file) => ({
    id: file.id,
    name: file.name,
    uploadedBy: file.uploaded_by,
    uploadedAt: formatDate(file.uploaded_at)
  }));

  return {
    id: row.id,
    title: row.title,
    department: row.department,
    priority: row.priority,
    status: row.status,
    assigneeId: row.assignee_id ?? undefined,
    candidateName: row.candidate_name ?? "Unassigned",
    dueDate: row.due_date,
    progress: row.progress,
    reviewComment: row.review_comment ?? undefined,
    completedAt: formatDate(row.completed_at),
    files,
    messages
  };
}

function notify(userId, kind, title, body, taskId) {
  if (!userId) return;
  db.prepare(`
    INSERT INTO notifications (id, user_id, kind, title, body, task_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(randomUUID(), userId, kind, title, body, taskId ?? null);
}

function notifyTaskAudience(task, actorId, title, body) {
  const audience = db.prepare(`
    SELECT id FROM users
    WHERE id != ? AND (role = 'superadmin' OR department = ?)
  `).all(actorId, task.department);
  for (const user of audience) notify(user.id, "message", title, body, task.id);
}

function canManage(user, task) {
  return user.role === "superadmin" || (user.role === "admin" && user.department === task.department);
}

function canView(user, task) {
  return user.role === "superadmin" || user.department === task.department;
}

function send(response, status, data) {
  response.writeHead(status, {
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json"
  });
  response.end(JSON.stringify(data));
}

async function readBody(request) {
  let raw = "";
  for await (const chunk of request) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

function authenticatedUser(request) {
  const token = request.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const row = db.prepare(`
    SELECT users.* FROM sessions JOIN users ON users.id = sessions.user_id
    WHERE sessions.token = ?
  `).get(token);
  return row ? publicUser(row) : null;
}

function requireManager(user) {
  if (!user || !["admin", "superadmin"].includes(user.role)) {
    const error = new Error("Manager permission required.");
    error.status = 403;
    throw error;
  }
}

function validateUserScope(actor, target) {
  requireManager(actor);
  if (actor.role === "admin" && (target.role !== "user" || target.department !== actor.department)) {
    const error = new Error("Admins can manage normal users in their own department only.");
    error.status = 403;
    throw error;
  }
}

const server = createServer(async (request, response) => {
  if (request.method === "OPTIONS") return send(response, 204, {});

  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const path = url.pathname;
    const body = request.method === "GET" ? {} : await readBody(request);

    if (request.method === "GET" && path === "/api/health") {
      return send(response, 200, { ok: true, database: databasePath });
    }

    if (request.method === "POST" && path === "/api/auth/login") {
      const row = db.prepare("SELECT * FROM users WHERE username = ? COLLATE NOCASE").get(String(body.username ?? "").trim());
      if (!row || !passwordMatches(String(body.password ?? ""), row.password_hash)) {
        return send(response, 401, { message: "Username or password is incorrect." });
      }
      const token = randomBytes(32).toString("hex");
      db.prepare("INSERT INTO sessions (token, user_id) VALUES (?, ?)").run(token, row.id);
      return send(response, 200, { token, user: publicUser(row) });
    }

    const actor = authenticatedUser(request);
    if (!actor) return send(response, 401, { message: "Please log in again." });

    if (request.method === "POST" && path === "/api/auth/logout") {
      const token = request.headers.authorization.replace(/^Bearer\s+/i, "");
      db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
      return send(response, 200, { ok: true });
    }

    if (request.method === "GET" && path === "/api/bootstrap") {
      const users = db.prepare("SELECT * FROM users ORDER BY name").all().map(publicUser);
      const tasks = db.prepare(`
        SELECT tasks.*, users.name AS candidate_name
        FROM tasks LEFT JOIN users ON users.id = tasks.assignee_id
        ORDER BY tasks.created_at DESC
      `).all().map(serializeTask);
      const notifications = db.prepare(`
        SELECT id, kind, title, body, task_id, is_read, created_at
        FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 30
      `).all(actor.id).map((item) => ({
        id: item.id,
        kind: item.kind,
        title: item.title,
        body: item.body,
        taskId: item.task_id ?? undefined,
        isRead: Boolean(item.is_read),
        createdAt: formatDate(item.created_at)
      }));
      return send(response, 200, { currentUser: actor, users, tasks, notifications });
    }

    if (request.method === "POST" && path === "/api/users") {
      requireManager(actor);
      const target = {
        id: randomUUID(),
        name: String(body.name ?? "").trim(),
        username: String(body.username ?? "").trim(),
        password: String(body.password ?? ""),
        role: actor.role === "admin" ? "user" : body.role,
        department: actor.role === "admin" ? actor.department : body.department
      };
      validateUserScope(actor, target);
      if (!target.name || !target.username || !target.password) throw new Error("Name, username, and password are required.");
      db.prepare(`
        INSERT INTO users (id, name, username, password_hash, role, department)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(target.id, target.name, target.username, hashPassword(target.password), target.role, target.department);
      return send(response, 201, { user: publicUser(target) });
    }

    const userMatch = path.match(/^\/api\/users\/([^/]+)$/);
    if (userMatch && request.method === "PUT") {
      const existing = db.prepare("SELECT * FROM users WHERE id = ?").get(userMatch[1]);
      if (!existing) return send(response, 404, { message: "User not found." });
      const target = {
        ...existing,
        name: String(body.name ?? existing.name).trim(),
        username: String(body.username ?? existing.username).trim(),
        role: actor.role === "admin" ? "user" : body.role,
        department: actor.role === "admin" ? actor.department : body.department
      };
      validateUserScope(actor, target);
      db.prepare("UPDATE users SET name = ?, username = ?, role = ?, department = ? WHERE id = ?")
        .run(target.name, target.username, target.role, target.department, target.id);
      if (body.password) db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashPassword(body.password), target.id);
      return send(response, 200, { user: publicUser(target) });
    }

    if (userMatch && request.method === "DELETE") {
      const target = db.prepare("SELECT * FROM users WHERE id = ?").get(userMatch[1]);
      if (!target) return send(response, 404, { message: "User not found." });
      validateUserScope(actor, target);
      if (target.id === actor.id || target.role === "superadmin") return send(response, 403, { message: "This user cannot be deleted." });
      db.prepare("DELETE FROM users WHERE id = ?").run(target.id);
      db.prepare("UPDATE tasks SET status = 'new', progress = 0 WHERE assignee_id IS NULL AND status != 'done'").run();
      return send(response, 200, { ok: true });
    }

    if (request.method === "POST" && path === "/api/tasks") {
      requireManager(actor);
      const assignee = body.assigneeId ? db.prepare("SELECT * FROM users WHERE id = ? AND role = 'user'").get(body.assigneeId) : null;
      const department = assignee?.department ?? (actor.role === "admin" ? actor.department : body.department);
      if (actor.role === "admin" && department !== actor.department) return send(response, 403, { message: "Admins can create tasks in their department only." });
      const task = {
        id: randomUUID(),
        title: String(body.title ?? "").trim(),
        department,
        priority: body.priority,
        status: assignee ? (Number(body.progress) > 0 ? "in_progress" : "assigned") : "new",
        assigneeId: assignee?.id ?? null,
        dueDate: body.dueDate,
        progress: assignee ? Math.max(0, Math.min(100, Number(body.progress) || 0)) : 0
      };
      if (!task.title) throw new Error("Task title is required.");
      db.prepare(`
        INSERT INTO tasks (id, title, department, priority, status, assignee_id, due_date, progress, created_by_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(task.id, task.title, task.department, task.priority, task.status, task.assigneeId, task.dueDate, task.progress, actor.id);
      if (task.assigneeId) notify(task.assigneeId, "assignment", "New task allocated", `You were assigned: ${task.title}`, task.id);
      return send(response, 201, { task: serializeTask(getTask(task.id)) });
    }

    const taskMatch = path.match(/^\/api\/tasks\/([^/]+)$/);
    if (taskMatch && request.method === "PUT") {
      const existing = getTask(taskMatch[1]);
      if (!existing) return send(response, 404, { message: "Task not found." });
      if (!canManage(actor, existing)) return send(response, 403, { message: "You cannot edit this task." });
      const assignee = body.assigneeId ? db.prepare("SELECT * FROM users WHERE id = ? AND role = 'user'").get(body.assigneeId) : null;
      const department = assignee?.department ?? body.department ?? existing.department;
      if (actor.role === "admin" && department !== actor.department) return send(response, 403, { message: "Admins can edit tasks in their department only." });
      db.prepare(`
        UPDATE tasks SET title = ?, department = ?, priority = ?, status = ?, assignee_id = ?, due_date = ?, progress = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(String(body.title).trim(), department, body.priority, body.status, assignee?.id ?? null, body.dueDate, Math.max(0, Math.min(100, Number(body.progress) || 0)), existing.id);
      if (assignee?.id && assignee.id !== existing.assignee_id) notify(assignee.id, "assignment", "Task allocated", `You were assigned: ${body.title}`, existing.id);
      return send(response, 200, { task: serializeTask(getTask(existing.id)) });
    }

    if (taskMatch && request.method === "DELETE") {
      const task = getTask(taskMatch[1]);
      if (!task) return send(response, 404, { message: "Task not found." });
      if (!canManage(actor, task)) return send(response, 403, { message: "You cannot delete this task." });
      db.prepare("DELETE FROM tasks WHERE id = ?").run(task.id);
      return send(response, 200, { ok: true });
    }

    const actionMatch = path.match(/^\/api\/tasks\/([^/]+)\/(claim|submit|approve|reopen|messages|files)$/);
    if (actionMatch && request.method === "POST") {
      const task = getTask(actionMatch[1]);
      if (!task) return send(response, 404, { message: "Task not found." });
      const action = actionMatch[2];

      if (action === "claim") {
        if (actor.role !== "user" || actor.department !== task.department || task.assignee_id) return send(response, 403, { message: "This task cannot be claimed." });
        db.prepare("UPDATE tasks SET assignee_id = ?, status = 'assigned', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(actor.id, task.id);
        notifyTaskAudience(task, actor.id, "Free task claimed", `${actor.name} took: ${task.title}`);
      }
      if (action === "submit") {
        if (actor.role !== "user" || task.assignee_id !== actor.id || ["done", "under_review"].includes(task.status)) return send(response, 403, { message: "This task cannot be submitted." });
        db.prepare("UPDATE tasks SET status = 'under_review', progress = 100, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(task.id);
        notifyTaskAudience(task, actor.id, "Task ready for review", `${actor.name} submitted: ${task.title}`);
      }
      if (action === "approve") {
        if (!canManage(actor, task) || task.status !== "under_review") return send(response, 403, { message: "This task cannot be approved." });
        db.prepare("UPDATE tasks SET status = 'done', progress = 100, review_comment = 'Approved.', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(task.id);
        notify(task.assignee_id, "approval", "Task approved", `${actor.name} approved: ${task.title}`, task.id);
      }
      if (action === "reopen") {
        const comment = String(body.comment ?? "").trim();
        if (!canManage(actor, task) || task.status !== "under_review" || !comment) return send(response, 403, { message: "A review comment is required." });
        db.prepare("UPDATE tasks SET status = 'in_progress', progress = MIN(progress, 90), review_comment = ?, completed_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(comment, task.id);
        notify(task.assignee_id, "review", "Task reopened", `${actor.name}: ${comment}`, task.id);
      }
      if (action === "messages") {
        if (!canView(actor, task)) return send(response, 403, { message: "You cannot view this task." });
        const message = String(body.body ?? "").trim();
        if (!message) throw new Error("Message cannot be empty.");
        db.prepare("INSERT INTO task_messages (id, task_id, author_id, author_name, body) VALUES (?, ?, ?, ?, ?)")
          .run(randomUUID(), task.id, actor.id, actor.name, message);
        notifyTaskAudience(task, actor.id, `New chat on ${task.title}`, `${actor.name}: ${message}`);
      }
      if (action === "files") {
        if (!canView(actor, task)) return send(response, 403, { message: "You cannot view this task." });
        for (const name of Array.isArray(body.names) ? body.names : []) {
          db.prepare("INSERT INTO task_files (id, task_id, name, uploaded_by) VALUES (?, ?, ?, ?)")
            .run(randomUUID(), task.id, String(name), actor.name);
        }
      }
      return send(response, 200, { task: serializeTask(getTask(task.id)) });
    }

    if (request.method === "POST" && path === "/api/notifications/read") {
      db.prepare("UPDATE notifications SET is_read = 1 WHERE user_id = ?").run(actor.id);
      return send(response, 200, { ok: true });
    }

    return send(response, 404, { message: "Route not found." });
  } catch (error) {
    const status = error.status ?? (String(error.message).includes("UNIQUE") ? 409 : 400);
    return send(response, status, { message: error.message || "Unexpected server error." });
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`MAB API listening on http://localhost:${port}`);
  console.log(`Database: ${databasePath}`);
});
