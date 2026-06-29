import { createServer } from "node:http";
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { DatabaseSync } from "node:sqlite";
import ExcelJS from "exceljs";

const port = Number(process.env.PORT ?? 4000);
const appDirectory = dirname(fileURLToPath(import.meta.url));
const databasePath = process.env.API_DATABASE_PATH
  ? resolve(process.env.API_DATABASE_PATH)
  : join(appDirectory, "data", "mab.sqlite");
const attachmentsPath = join(dirname(databasePath), "attachments");
const sessionIdleMinutes = 10;
const maxFileSize = 10 * 1024 * 1024;
const maxFilesPerUpload = 5;
const taskTypes = ["Technical", "QS", "Shop Drawings", "BIM", "Variation"];
mkdirSync(dirname(databasePath), { recursive: true });
mkdirSync(attachmentsPath, { recursive: true });

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
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    department TEXT NOT NULL,
    created_by_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS project_members (
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (project_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    department TEXT NOT NULL,
    priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    status TEXT NOT NULL CHECK (status IN ('new', 'assigned', 'in_progress', 'blocked', 'under_review', 'done')),
    assignee_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
    task_type TEXT NOT NULL DEFAULT 'Technical',
    due_date TEXT NOT NULL,
    progress INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
    review_comment TEXT,
    completed_at TEXT,
    created_by_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS task_assignees (
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, user_id)
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
  CREATE TABLE IF NOT EXISTS chat_groups (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    department TEXT NOT NULL,
    created_by_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL,
    department TEXT NOT NULL,
    author_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    author_name TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_tasks_department ON tasks(department);
  CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id);
  CREATE INDEX IF NOT EXISTS idx_task_assignees_user ON task_assignees(user_id, task_id);
  CREATE INDEX IF NOT EXISTS idx_project_members_user ON project_members(user_id, project_id);
  CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_chat_groups_department ON chat_groups(department, created_at);
  CREATE INDEX IF NOT EXISTS idx_chat_messages_department ON chat_messages(department, created_at DESC);
`);

function ensureColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((item) => item.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

ensureColumn("sessions", "last_active_at", "TEXT");
ensureColumn("task_files", "storage_name", "TEXT");
ensureColumn("task_files", "mime_type", "TEXT");
ensureColumn("task_files", "size", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("tasks", "project_id", "TEXT");
ensureColumn("tasks", "task_type", "TEXT NOT NULL DEFAULT 'Technical'");
db.exec("CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id)");
db.exec("UPDATE sessions SET last_active_at = COALESCE(last_active_at, created_at)");
db.exec(`
  INSERT OR IGNORE INTO task_assignees (task_id, user_id)
  SELECT id, assignee_id FROM tasks WHERE assignee_id IS NOT NULL
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

function isoDateTime(value) {
  if (!value) return undefined;
  return new Date(`${value.replace(" ", "T")}Z`).toISOString();
}

function getTask(taskId) {
  return db.prepare(`
    SELECT tasks.*, projects.name AS project_name
    FROM tasks LEFT JOIN projects ON projects.id = tasks.project_id
    WHERE tasks.id = ?
  `).get(taskId);
}

function serializeTask(row) {
  const messages = db.prepare(`
    SELECT id, author_id, author_name, body, created_at FROM task_messages
    WHERE task_id = ? ORDER BY created_at ASC
  `).all(row.id).map((message) => ({
    id: message.id,
    authorId: message.author_id ?? "deleted-user",
    authorName: message.author_name,
    body: message.body,
    createdAt: formatDate(message.created_at)
  }));
  const assignees = db.prepare(`
    SELECT users.id, users.name FROM task_assignees
    JOIN users ON users.id = task_assignees.user_id
    WHERE task_assignees.task_id = ? ORDER BY users.name
  `).all(row.id);
  const files = db.prepare(`
    SELECT id, name, uploaded_by, uploaded_at, mime_type, size FROM task_files
    WHERE task_id = ? ORDER BY uploaded_at ASC
  `).all(row.id).map((file) => ({
    id: file.id,
    name: file.name,
    uploadedBy: file.uploaded_by,
    uploadedAt: formatDate(file.uploaded_at),
    mimeType: file.mime_type ?? "application/octet-stream",
    size: file.size ?? 0
  }));

  return {
    id: row.id,
    title: row.title,
    department: row.department,
    priority: row.priority,
    status: row.status,
    assigneeId: assignees[0]?.id ?? row.assignee_id ?? undefined,
    assigneeIds: assignees.map((assignee) => assignee.id),
    candidateName: assignees.map((assignee) => assignee.name).join(", ") || "Unassigned",
    candidateNames: assignees.map((assignee) => assignee.name),
    projectId: row.project_id ?? undefined,
    projectName: row.project_name ?? undefined,
    taskType: row.task_type ?? "Technical",
    dueDate: row.due_date,
    progress: row.progress,
    reviewComment: row.review_comment ?? undefined,
    completedAt: formatDate(row.completed_at),
    completedAtIso: isoDateTime(row.completed_at),
    createdAt: isoDateTime(row.created_at),
    updatedAt: isoDateTime(row.updated_at),
    files,
    messages
  };
}

function projectsFor(actor) {
  const rows = actor.role === "superadmin"
    ? db.prepare("SELECT * FROM projects ORDER BY created_at DESC").all()
    : actor.role === "admin"
      ? db.prepare("SELECT * FROM projects WHERE department = ? ORDER BY created_at DESC").all(actor.department)
      : db.prepare(`
          SELECT projects.* FROM projects JOIN project_members ON project_members.project_id = projects.id
          WHERE project_members.user_id = ? ORDER BY projects.created_at DESC
        `).all(actor.id);
  return rows.map((project) => {
    const members = db.prepare(`
      SELECT users.id, users.name, users.username, users.role, users.department
      FROM project_members JOIN users ON users.id = project_members.user_id
      WHERE project_members.project_id = ? ORDER BY users.name
    `).all(project.id).map(publicUser);
    const taskCount = db.prepare("SELECT count(*) AS count FROM tasks WHERE project_id = ?").get(project.id).count;
    return {
      id: project.id,
      name: project.name,
      description: project.description,
      department: project.department,
      createdAt: isoDateTime(project.created_at),
      members,
      taskCount
    };
  });
}

function normalizeTaskType(value) {
  const requested = String(value ?? "Technical").trim().toLowerCase();
  if (requested === "varation") return "Variation";
  return taskTypes.find((type) => type.toLowerCase() === requested) ?? "Technical";
}

function taskAssigneeIds(taskId) {
  return db.prepare("SELECT user_id FROM task_assignees WHERE task_id = ?").all(taskId).map((item) => item.user_id);
}

function setTaskAssignees(taskId, assigneeIds) {
  db.prepare("DELETE FROM task_assignees WHERE task_id = ?").run(taskId);
  for (const userId of assigneeIds) {
    db.prepare("INSERT INTO task_assignees (task_id, user_id) VALUES (?, ?)").run(taskId, userId);
  }
  db.prepare("UPDATE tasks SET assignee_id = ? WHERE id = ?").run(assigneeIds[0] ?? null, taskId);
}

function validTaskAssignees(ids, department, projectId = null) {
  const uniqueIds = [...new Set(Array.isArray(ids) ? ids.map(String) : [])];
  if (!uniqueIds.length) return [];
  const users = db.prepare(`
    SELECT * FROM users WHERE id IN (${uniqueIds.map(() => "?").join(",")})
      AND role = 'user' AND department = ?
  `).all(...uniqueIds, department);
  if (users.length !== uniqueIds.length) throw new Error("Every assignee must be a normal user in the task department.");
  if (projectId) {
    const memberCount = db.prepare(`
      SELECT count(*) AS count FROM project_members
      WHERE project_id = ? AND user_id IN (${uniqueIds.map(() => "?").join(",")})
    `).get(projectId, ...uniqueIds).count;
    if (memberCount !== uniqueIds.length) throw new Error("Task assignees must be members of the selected project.");
  }
  return users;
}

async function parseTaskSheet(file) {
  const name = basename(String(file?.name ?? "project-tasks.xlsx"));
  const data = Buffer.from(String(file?.data ?? ""), "base64");
  if (!data.length) throw new Error("Choose a project task sheet to import.");
  if (data.length > maxFileSize) throw new Error("The project task sheet exceeds the 10 MB limit.");
  const workbook = new ExcelJS.Workbook();
  let sheet;
  if (extname(name).toLowerCase() === ".csv") {
    sheet = await workbook.csv.read(Readable.from([data]));
  } else {
    await workbook.xlsx.load(data);
    sheet = workbook.worksheets[0];
  }
  if (!sheet) throw new Error("The task sheet has no worksheet.");
  const headerMap = new Map();
  sheet.getRow(1).eachCell((cell, column) => {
    headerMap.set(String(cell.value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " "), column);
  });
  const findColumn = (...names) => names.map((name) => headerMap.get(name)).find(Boolean);
  const titleColumn = findColumn("task", "title", "task title");
  if (!titleColumn) throw new Error("The sheet needs a Task or Title column.");
  const priorityColumn = findColumn("priority");
  const dueColumn = findColumn("due date", "due");
  const progressColumn = findColumn("progress", "progress percent");
  const typeColumn = findColumn("task type", "type");
  const assigneesColumn = findColumn("assignees", "assigned to", "users");
  const tasks = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const title = String(row.getCell(titleColumn).text ?? "").trim();
    if (!title) return;
    const cellText = (column) => column ? String(row.getCell(column).text ?? "") : "";
    const dueValue = dueColumn ? row.getCell(dueColumn).value : null;
    const dueDate = dueValue instanceof Date
      ? dueValue.toISOString().slice(0, 10)
      : typeof dueValue === "number"
        ? new Date((dueValue - 25569) * 86_400_000).toISOString().slice(0, 10)
      : String(cellText(dueColumn) || new Date().toISOString().slice(0, 10)).slice(0, 10);
    const priority = cellText(priorityColumn).toLowerCase();
    const rawProgress = progressColumn ? row.getCell(progressColumn).value : 0;
    const progress = typeof rawProgress === "number" && rawProgress > 0 && rawProgress <= 1
      ? rawProgress * 100
      : Number(cellText(progressColumn).replace("%", "")) || 0;
    tasks.push({
      title,
      priority: ["low", "medium", "high", "urgent"].includes(priority)
        ? priority
        : "medium",
      dueDate,
      progress: Math.max(0, Math.min(100, progress)),
      taskType: normalizeTaskType(cellText(typeColumn)),
      assignees: cellText(assigneesColumn).split(/[,;]/).map((item) => item.trim()).filter(Boolean)
    });
  });
  if (!tasks.length) throw new Error("No task rows were found in the sheet.");
  return tasks;
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

function chatDataFor(actor) {
  const departments = actor.role === "superadmin"
    ? db.prepare(`
        SELECT department FROM users WHERE department != 'Executive'
        UNION SELECT department FROM tasks WHERE department != 'Executive'
        ORDER BY department
      `).all().map((item) => item.department)
    : [actor.department];
  const groups = departments.length
    ? db.prepare(`
        SELECT id, name, department FROM chat_groups
        WHERE department IN (${departments.map(() => "?").join(",")})
        ORDER BY created_at ASC
      `).all(...departments)
    : [];
  const channels = [
    ...departments.map((department) => ({
      id: `department:${department}`,
      name: "Department Chat",
      department,
      isGroup: false
    })),
    ...groups.map((group) => ({
      id: `group:${group.id}`,
      name: group.name,
      department: group.department,
      isGroup: true
    }))
  ];
  const messages = departments.length
    ? db.prepare(`
        SELECT * FROM (
          SELECT id, channel_id, author_id, author_name, body, created_at
          FROM chat_messages
          WHERE department IN (${departments.map(() => "?").join(",")})
          ORDER BY created_at DESC LIMIT 300
        ) ORDER BY created_at ASC
      `).all(...departments).map((message) => ({
        id: message.id,
        channelId: message.channel_id,
        authorId: message.author_id,
        authorName: message.author_name,
        body: message.body,
        createdAt: formatDate(message.created_at)
      }))
    : [];
  return { chatChannels: channels, chatMessages: messages };
}

function canManage(user, task) {
  return user.role === "superadmin" || (user.role === "admin" && user.department === task.department);
}

function canView(user, task) {
  if (user.role === "superadmin") return true;
  if (user.department !== task.department) return false;
  if (user.role === "admin" || !task.project_id) return true;
  return Boolean(db.prepare("SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?").get(task.project_id, user.id));
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

function sendBinary(response, status, data, contentType, filename) {
  const originalFilename = basename(filename).replace(/["\r\n]/g, "_");
  const safeFilename = originalFilename.replace(/[^\x20-\x7E]/g, "_");
  response.writeHead(status, {
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Expose-Headers": "Content-Disposition",
    "Content-Disposition": `attachment; filename="${safeFilename}"; filename*=UTF-8''${encodeURIComponent(originalFilename)}`,
    "Content-Length": data.length,
    "Content-Type": contentType
  });
  response.end(data);
}

async function readBody(request) {
  let raw = "";
  for await (const chunk of request) {
    raw += chunk;
    if (Buffer.byteLength(raw) > 70 * 1024 * 1024) {
      const error = new Error("Request is too large.");
      error.status = 413;
      throw error;
    }
  }
  return raw ? JSON.parse(raw) : {};
}

function authenticatedUser(request) {
  const token = request.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const row = db.prepare(`
    SELECT users.*, sessions.last_active_at FROM sessions JOIN users ON users.id = sessions.user_id
    WHERE sessions.token = ?
  `).get(token);
  if (row?.last_active_at) {
    const lastActive = new Date(`${row.last_active_at.replace(" ", "T")}Z`).getTime();
    if (Date.now() - lastActive >= sessionIdleMinutes * 60 * 1000) {
      db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
      return null;
    }
  }
  return row ? publicUser(row) : null;
}

function touchSession(request) {
  const token = request.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (token) db.prepare("UPDATE sessions SET last_active_at = CURRENT_TIMESTAMP WHERE token = ?").run(token);
}

function saveTaskFiles(taskId, actor, files) {
  const incoming = Array.isArray(files) ? files.slice(0, maxFilesPerUpload) : [];
  if (Array.isArray(files) && files.length > maxFilesPerUpload) {
    const error = new Error(`You can upload up to ${maxFilesPerUpload} files at once.`);
    error.status = 400;
    throw error;
  }

  const prepared = incoming.map((file) => {
    const name = basename(String(file.name ?? "attachment")).slice(0, 180);
    const mimeType = String(file.mimeType ?? "application/octet-stream").slice(0, 120);
    const data = Buffer.from(String(file.data ?? ""), "base64");
    if (!name || !data.length) throw new Error("Each attachment must include a name and file content.");
    if (data.length > maxFileSize) throw new Error(`${name} exceeds the 10 MB file limit.`);
    return { data, mimeType, name, storageName: `${randomUUID()}${extname(name).slice(0, 12)}` };
  });

  const writtenFiles = [];
  db.exec("BEGIN");
  try {
    for (const file of prepared) {
      writeFileSync(join(attachmentsPath, file.storageName), file.data, { flag: "wx" });
      writtenFiles.push(file.storageName);
      db.prepare(`
        INSERT INTO task_files (id, task_id, name, uploaded_by, storage_name, mime_type, size)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(randomUUID(), taskId, file.name, actor.name, file.storageName, file.mimeType, file.data.length);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    for (const storageName of writtenFiles) {
      try { unlinkSync(join(attachmentsPath, storageName)); } catch { /* Best-effort cleanup. */ }
    }
    throw error;
  }
}

async function buildProductivityReport(user, month = "") {
  const monthFilter = /^\d{4}-\d{2}$/.test(month) ? month : "";
  const rows = db.prepare(`
    SELECT DISTINCT tasks.id, tasks.title, tasks.department, tasks.priority, tasks.status,
      tasks.due_date, tasks.progress, tasks.created_at, tasks.updated_at, tasks.completed_at,
      tasks.task_type, projects.name AS project_name
    FROM tasks
    JOIN task_assignees ON task_assignees.task_id = tasks.id
    LEFT JOIN projects ON projects.id = tasks.project_id
    WHERE task_assignees.user_id = ?
      AND (? = '' OR substr(tasks.created_at, 1, 7) = ? OR substr(tasks.completed_at, 1, 7) = ?)
    ORDER BY tasks.created_at DESC
  `).all(user.id, monthFilter, monthFilter, monthFilter);
  const today = new Date().toISOString().slice(0, 10);
  const completed = rows.filter((task) => task.status === "done");
  const overdue = rows.filter((task) => task.status !== "done" && task.due_date < today);
  const onTime = completed.filter((task) => task.completed_at?.slice(0, 10) <= task.due_date);
  const completionDurations = completed
    .map((task) => (new Date(`${task.completed_at.replace(" ", "T")}Z`).getTime() - new Date(`${task.created_at.replace(" ", "T")}Z`).getTime()) / 86_400_000)
    .filter((duration) => Number.isFinite(duration) && duration >= 0)
    .sort((a, b) => a - b);
  const averageCompletionDays = completionDurations.length
    ? completionDurations.reduce((sum, duration) => sum + duration, 0) / completionDurations.length
    : 0;
  const medianCompletionDays = completionDurations.length
    ? completionDurations.length % 2
      ? completionDurations[Math.floor(completionDurations.length / 2)]
      : (completionDurations[completionDurations.length / 2 - 1] + completionDurations[completionDurations.length / 2]) / 2
    : 0;
  const averageProgress = rows.length
    ? Math.round(rows.reduce((sum, task) => sum + task.progress, 0) / rows.length)
    : 0;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "MAB Task Allocator";
  workbook.created = new Date();
  const summary = workbook.addWorksheet("Summary", { views: [{ showGridLines: false }] });
  const tasks = workbook.addWorksheet("Task Details", { views: [{ state: "frozen", ySplit: 1, showGridLines: false }] });
  const titleFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1178B8" } };
  const paleFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF8FF" } };

  summary.mergeCells("A1:D1");
  summary.getCell("A1").value = "MAB Productivity Report";
  summary.getCell("A1").font = { bold: true, color: { argb: "FFFFFFFF" }, size: 18 };
  summary.getCell("A1").fill = titleFill;
  summary.getCell("A1").alignment = { vertical: "middle" };
  summary.getRow(1).height = 32;
  summary.getCell("A3").value = "Employee";
  summary.getCell("B3").value = user.name;
  summary.getCell("A4").value = "Department";
  summary.getCell("B4").value = user.department;
  summary.getCell("A5").value = "Generated";
  summary.getCell("B5").value = new Date();
  summary.getCell("B5").numFmt = "yyyy-mm-dd hh:mm";
  summary.getCell("A6").value = "Reporting Period";
  summary.getCell("B6").value = monthFilter || "All time";
  const metrics = [
    ["Assigned Tasks", rows.length],
    ["Completed Tasks", completed.length],
    ["Open Tasks", rows.length - completed.length],
    ["Overdue Tasks", overdue.length],
    ["Completed On Time", onTime.length],
    ["Completion Rate", rows.length ? completed.length / rows.length : 0],
    ["Average Progress", averageProgress / 100],
    ["Average Completion Time (days)", averageCompletionDays],
    ["Median Completion Time (days)", medianCompletionDays],
    ["Fastest Completion (days)", completionDurations[0] ?? 0],
    ["On-Time Completion Rate", completed.length ? onTime.length / completed.length : 0]
  ];
  summary.getCell("A7").value = "Productivity Summary";
  summary.getCell("A7").font = { bold: true, color: { argb: "FF0B456B" }, size: 13 };
  metrics.forEach(([label, value], index) => {
    const row = 8 + index;
    summary.getCell(row, 1).value = label;
    summary.getCell(row, 2).value = value;
    summary.getCell(row, 1).fill = paleFill;
    summary.getCell(row, 1).font = { bold: true };
  });
  summary.getCell("B13").numFmt = "0%";
  summary.getCell("B14").numFmt = "0%";
  summary.getCell("B15").numFmt = "0.0";
  summary.getCell("B16").numFmt = "0.0";
  summary.getCell("B17").numFmt = "0.0";
  summary.getCell("B18").numFmt = "0%";
  summary.columns = [{ width: 24 }, { width: 28 }, { width: 4 }, { width: 4 }];

  tasks.columns = [
    { header: "Task", key: "title", width: 38 },
    { header: "Project", key: "project", width: 24 },
    { header: "Task Type", key: "taskType", width: 18 },
    { header: "Department", key: "department", width: 38 },
    { header: "Priority", key: "priority", width: 12 },
    { header: "Status", key: "status", width: 18 },
    { header: "Progress", key: "progress", width: 12 },
    { header: "Created", key: "created", width: 14 },
    { header: "Due", key: "due", width: 14 },
    { header: "Completed", key: "completed", width: 18 },
    { header: "On Time", key: "onTime", width: 12 },
    { header: "Cycle Time (days)", key: "cycleTime", width: 18 }
  ];
  tasks.getRow(1).eachCell((cell) => {
    cell.fill = titleFill;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.alignment = { vertical: "middle" };
  });
  for (const task of rows) {
    const completedDate = task.completed_at ? new Date(`${task.completed_at.replace(" ", "T")}Z`) : null;
    tasks.addRow({
      title: task.title,
      project: task.project_name ?? "No project",
      taskType: task.task_type ?? "Technical",
      department: task.department,
      priority: task.priority,
      status: task.status.replaceAll("_", " "),
      progress: task.progress / 100,
      created: new Date(`${task.created_at.replace(" ", "T")}Z`),
      due: new Date(`${task.due_date}T00:00:00`),
      completed: completedDate,
      onTime: completedDate ? (task.completed_at.slice(0, 10) <= task.due_date ? "Yes" : "No") : "",
      cycleTime: completedDate
        ? (completedDate.getTime() - new Date(`${task.created_at.replace(" ", "T")}Z`).getTime()) / 86_400_000
        : null
    });
  }
  tasks.getColumn("progress").numFmt = "0%";
  tasks.getColumn("created").numFmt = "yyyy-mm-dd";
  tasks.getColumn("due").numFmt = "yyyy-mm-dd";
  tasks.getColumn("completed").numFmt = "yyyy-mm-dd hh:mm";
  tasks.getColumn("cycleTime").numFmt = "0.0";
  tasks.autoFilter = { from: "A1", to: "L1" };
  tasks.eachRow((row, rowNumber) => {
    if (rowNumber > 1 && rowNumber % 2 === 0) row.eachCell((cell) => { cell.fill = paleFill; });
  });
  return Buffer.from(await workbook.xlsx.writeBuffer());
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
      db.prepare("INSERT INTO sessions (token, user_id, last_active_at) VALUES (?, ?, CURRENT_TIMESTAMP)").run(token, row.id);
      return send(response, 200, { token, user: publicUser(row) });
    }

    const actor = authenticatedUser(request);
    if (!actor) return send(response, 401, { message: "Please log in again." });

    if (request.method === "POST" && path === "/api/auth/fork") {
      const token = randomBytes(32).toString("hex");
      db.prepare("INSERT INTO sessions (token, user_id, last_active_at) VALUES (?, ?, CURRENT_TIMESTAMP)")
        .run(token, actor.id);
      db.prepare("DELETE FROM sessions WHERE last_active_at < datetime('now', '-10 minutes')").run();
      return send(response, 201, { token });
    }

    if (request.method === "POST" && path === "/api/auth/activity") {
      touchSession(request);
      return send(response, 200, { ok: true });
    }

    if (request.method === "POST" && path === "/api/auth/logout") {
      const token = request.headers.authorization.replace(/^Bearer\s+/i, "");
      db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
      return send(response, 200, { ok: true });
    }

    const fileDownloadMatch = path.match(/^\/api\/files\/([^/]+)\/download$/);
    if (request.method === "GET" && fileDownloadMatch) {
      const file = db.prepare(`
        SELECT task_files.*, tasks.department, tasks.assignee_id, tasks.project_id
        FROM task_files JOIN tasks ON tasks.id = task_files.task_id
        WHERE task_files.id = ?
      `).get(fileDownloadMatch[1]);
      if (!file) return send(response, 404, { message: "File not found." });
      if (!canView(actor, file)) return send(response, 403, { message: "You cannot download this file." });
      if (!file.storage_name) return send(response, 410, { message: "This older file has no stored content." });
      try {
        const data = readFileSync(join(attachmentsPath, basename(file.storage_name)));
        return sendBinary(response, 200, data, file.mime_type || "application/octet-stream", file.name);
      } catch {
        return send(response, 404, { message: "The stored file could not be found." });
      }
    }

    const reportMatch = path.match(/^\/api\/reports\/productivity\/([^/]+)$/);
    if (request.method === "GET" && reportMatch) {
      requireManager(actor);
      const target = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'user'").get(reportMatch[1]);
      if (!target) return send(response, 404, { message: "Normal user not found." });
      if (actor.role === "admin" && target.department !== actor.department) {
        return send(response, 403, { message: "Admins can export reports for their own department only." });
      }
      touchSession(request);
      const month = url.searchParams.get("month") ?? "";
      const data = await buildProductivityReport(target, month);
      const reportSlug = target.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || target.id.slice(0, 8);
      const reportName = `productivity-${reportSlug}-${/^\d{4}-\d{2}$/.test(month) ? month : new Date().toISOString().slice(0, 10)}.xlsx`;
      return sendBinary(response, 200, data, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", reportName);
    }

    if (request.method === "GET" && path === "/api/bootstrap") {
      const users = db.prepare("SELECT * FROM users ORDER BY name").all().map(publicUser);
      const tasks = db.prepare(`
        SELECT tasks.*, projects.name AS project_name
        FROM tasks LEFT JOIN projects ON projects.id = tasks.project_id
        ORDER BY tasks.created_at DESC
      `).all().filter((task) => canView(actor, task)).map(serializeTask);
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
      return send(response, 200, { currentUser: actor, users, tasks, projects: projectsFor(actor), notifications, ...chatDataFor(actor) });
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
      db.exec(`
        UPDATE tasks SET assignee_id = (SELECT user_id FROM task_assignees WHERE task_id = tasks.id LIMIT 1)
        WHERE assignee_id IS NULL;
        UPDATE tasks SET status = 'new', progress = 0
        WHERE status != 'done' AND NOT EXISTS (SELECT 1 FROM task_assignees WHERE task_id = tasks.id);
      `);
      return send(response, 200, { ok: true });
    }

    if (request.method === "POST" && path === "/api/projects") {
      requireManager(actor);
      const department = actor.role === "admin" ? actor.department : String(body.department ?? "").trim();
      const name = String(body.name ?? "").trim().slice(0, 140);
      const description = String(body.description ?? "").trim().slice(0, 2000);
      if (!name || !department || department === "Executive") throw new Error("Project name and department are required.");
      const members = validTaskAssignees(body.memberIds, department);
      const id = randomUUID();
      db.exec("BEGIN");
      try {
        db.prepare("INSERT INTO projects (id, name, description, department, created_by_id) VALUES (?, ?, ?, ?, ?)")
          .run(id, name, description, department, actor.id);
        for (const member of members) {
          db.prepare("INSERT INTO project_members (project_id, user_id) VALUES (?, ?)").run(id, member.id);
        }
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
      return send(response, 201, { project: projectsFor(actor).find((project) => project.id === id) });
    }

    const projectImportMatch = path.match(/^\/api\/projects\/([^/]+)\/import$/);
    if (projectImportMatch && request.method === "POST") {
      requireManager(actor);
      const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(projectImportMatch[1]);
      if (!project) return send(response, 404, { message: "Project not found." });
      if (actor.role === "admin" && project.department !== actor.department) {
        return send(response, 403, { message: "You cannot import tasks into this project." });
      }
      const importedTasks = await parseTaskSheet(body.file);
      const members = db.prepare(`
        SELECT users.* FROM project_members JOIN users ON users.id = project_members.user_id
        WHERE project_members.project_id = ?
      `).all(project.id);
      const createdIds = [];
      db.exec("BEGIN");
      try {
        for (const imported of importedTasks) {
          const assigneeIds = members
            .filter((member) => imported.assignees.some((value) =>
              value.toLowerCase() === member.username.toLowerCase() || value.toLowerCase() === member.name.toLowerCase()))
            .map((member) => member.id);
          const id = randomUUID();
          const status = assigneeIds.length ? (imported.progress > 0 ? "in_progress" : "assigned") : "new";
          db.prepare(`
            INSERT INTO tasks (id, title, department, priority, status, assignee_id, project_id, task_type, due_date, progress, created_by_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(id, imported.title, project.department, imported.priority, status, assigneeIds[0] ?? null,
            project.id, imported.taskType, imported.dueDate, assigneeIds.length ? imported.progress : 0, actor.id);
          for (const userId of assigneeIds) {
            db.prepare("INSERT INTO task_assignees (task_id, user_id) VALUES (?, ?)").run(id, userId);
          }
          createdIds.push(id);
        }
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
      for (const id of createdIds) {
        for (const userId of taskAssigneeIds(id)) notify(userId, "assignment", "Imported project task", `A task was imported into ${project.name}.`, id);
      }
      touchSession(request);
      return send(response, 201, { imported: createdIds.length });
    }

    const projectMatch = path.match(/^\/api\/projects\/([^/]+)$/);
    if (projectMatch && request.method === "PUT") {
      requireManager(actor);
      const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(projectMatch[1]);
      if (!project) return send(response, 404, { message: "Project not found." });
      if (actor.role === "admin" && project.department !== actor.department) return send(response, 403, { message: "You cannot edit this project." });
      const members = validTaskAssignees(body.memberIds, project.department);
      db.exec("BEGIN");
      try {
        db.prepare("UPDATE projects SET name = ?, description = ? WHERE id = ?")
          .run(String(body.name ?? project.name).trim(), String(body.description ?? project.description).trim(), project.id);
        db.prepare("DELETE FROM project_members WHERE project_id = ?").run(project.id);
        for (const member of members) db.prepare("INSERT INTO project_members (project_id, user_id) VALUES (?, ?)").run(project.id, member.id);
        db.prepare(`
          DELETE FROM task_assignees
          WHERE task_id IN (SELECT id FROM tasks WHERE project_id = ?)
            AND user_id NOT IN (SELECT user_id FROM project_members WHERE project_id = ?)
        `).run(project.id, project.id);
        db.prepare(`
          UPDATE tasks SET assignee_id = (SELECT user_id FROM task_assignees WHERE task_id = tasks.id LIMIT 1)
          WHERE project_id = ?
        `).run(project.id);
        db.prepare(`
          UPDATE tasks SET status = 'new', progress = 0
          WHERE project_id = ? AND status != 'done'
            AND NOT EXISTS (SELECT 1 FROM task_assignees WHERE task_id = tasks.id)
        `).run(project.id);
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
      return send(response, 200, { project: projectsFor(actor).find((item) => item.id === project.id) });
    }

    if (projectMatch && request.method === "DELETE") {
      requireManager(actor);
      const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(projectMatch[1]);
      if (!project) return send(response, 404, { message: "Project not found." });
      if (actor.role === "admin" && project.department !== actor.department) return send(response, 403, { message: "You cannot delete this project." });
      db.prepare("UPDATE tasks SET project_id = NULL WHERE project_id = ?").run(project.id);
      db.prepare("DELETE FROM projects WHERE id = ?").run(project.id);
      return send(response, 200, { ok: true });
    }

    if (request.method === "POST" && path === "/api/tasks") {
      requireManager(actor);
      const project = body.projectId ? db.prepare("SELECT * FROM projects WHERE id = ?").get(body.projectId) : null;
      if (body.projectId && !project) return send(response, 404, { message: "Project not found." });
      const requestedIds = Array.isArray(body.assigneeIds) ? body.assigneeIds : body.assigneeId ? [body.assigneeId] : [];
      const firstRequested = requestedIds[0] ? db.prepare("SELECT * FROM users WHERE id = ? AND role = 'user'").get(requestedIds[0]) : null;
      const department = project?.department ?? firstRequested?.department ?? (actor.role === "admin" ? actor.department : body.department);
      if (actor.role === "admin" && department !== actor.department) return send(response, 403, { message: "Admins can create tasks in their department only." });
      const assignees = validTaskAssignees(requestedIds, department, project?.id ?? null);
      const task = {
        id: randomUUID(),
        title: String(body.title ?? "").trim(),
        department,
        priority: body.priority,
        status: assignees.length ? (Number(body.progress) > 0 ? "in_progress" : "assigned") : "new",
        assigneeIds: assignees.map((assignee) => assignee.id),
        dueDate: body.dueDate,
        progress: assignees.length ? Math.max(0, Math.min(100, Number(body.progress) || 0)) : 0,
        projectId: project?.id ?? null,
        taskType: normalizeTaskType(body.taskType)
      };
      if (!task.title) throw new Error("Task title is required.");
      db.prepare(`
        INSERT INTO tasks (id, title, department, priority, status, assignee_id, project_id, task_type, due_date, progress, created_by_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(task.id, task.title, task.department, task.priority, task.status, task.assigneeIds[0] ?? null,
        task.projectId, task.taskType, task.dueDate, task.progress, actor.id);
      setTaskAssignees(task.id, task.assigneeIds);
      try {
        saveTaskFiles(task.id, actor, body.files);
      } catch (error) {
        db.prepare("DELETE FROM tasks WHERE id = ?").run(task.id);
        throw error;
      }
      for (const userId of task.assigneeIds) notify(userId, "assignment", "New task allocated", `You were assigned: ${task.title}`, task.id);
      touchSession(request);
      return send(response, 201, { task: serializeTask(getTask(task.id)) });
    }

    const taskMatch = path.match(/^\/api\/tasks\/([^/]+)$/);
    if (taskMatch && request.method === "PUT") {
      const existing = getTask(taskMatch[1]);
      if (!existing) return send(response, 404, { message: "Task not found." });
      if (!canManage(actor, existing)) return send(response, 403, { message: "You cannot edit this task." });
      const project = body.projectId ? db.prepare("SELECT * FROM projects WHERE id = ?").get(body.projectId) : null;
      if (body.projectId && !project) return send(response, 404, { message: "Project not found." });
      const requestedIds = Array.isArray(body.assigneeIds) ? body.assigneeIds : body.assigneeId ? [body.assigneeId] : [];
      const department = project?.department ?? body.department ?? existing.department;
      if (actor.role === "admin" && department !== actor.department) return send(response, 403, { message: "Admins can edit tasks in their department only." });
      const assignees = validTaskAssignees(requestedIds, department, project?.id ?? null);
      const previousIds = taskAssigneeIds(existing.id);
      db.prepare(`
        UPDATE tasks SET title = ?, department = ?, priority = ?, status = ?, assignee_id = ?, project_id = ?, task_type = ?, due_date = ?, progress = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(String(body.title).trim(), department, body.priority, body.status, assignees[0]?.id ?? null,
        project?.id ?? null, normalizeTaskType(body.taskType), body.dueDate,
        Math.max(0, Math.min(100, Number(body.progress) || 0)), existing.id);
      setTaskAssignees(existing.id, assignees.map((assignee) => assignee.id));
      for (const assignee of assignees.filter((item) => !previousIds.includes(item.id))) {
        notify(assignee.id, "assignment", "Task allocated", `You were assigned: ${body.title}`, existing.id);
      }
      return send(response, 200, { task: serializeTask(getTask(existing.id)) });
    }

    if (taskMatch && request.method === "DELETE") {
      const task = getTask(taskMatch[1]);
      if (!task) return send(response, 404, { message: "Task not found." });
      if (!canManage(actor, task)) return send(response, 403, { message: "You cannot delete this task." });
      const files = db.prepare("SELECT storage_name FROM task_files WHERE task_id = ?").all(task.id);
      db.prepare("DELETE FROM tasks WHERE id = ?").run(task.id);
      for (const file of files) {
        if (!file.storage_name) continue;
        try { unlinkSync(join(attachmentsPath, basename(file.storage_name))); } catch { /* Already absent. */ }
      }
      return send(response, 200, { ok: true });
    }

    const actionMatch = path.match(/^\/api\/tasks\/([^/]+)\/(claim|submit|approve|reopen|messages|files)$/);
    if (actionMatch && request.method === "POST") {
      const task = getTask(actionMatch[1]);
      if (!task) return send(response, 404, { message: "Task not found." });
      const action = actionMatch[2];
      const assignedUserIds = taskAssigneeIds(task.id);

      if (action === "claim") {
        if (actor.role !== "user" || actor.department !== task.department || assignedUserIds.length || !canView(actor, task)) return send(response, 403, { message: "This task cannot be claimed." });
        db.prepare("UPDATE tasks SET assignee_id = ?, status = 'assigned', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(actor.id, task.id);
        db.prepare("INSERT INTO task_assignees (task_id, user_id) VALUES (?, ?)").run(task.id, actor.id);
        notifyTaskAudience(task, actor.id, "Free task claimed", `${actor.name} took: ${task.title}`);
      }
      if (action === "submit") {
        if (actor.role !== "user" || !assignedUserIds.includes(actor.id) || ["done", "under_review"].includes(task.status)) return send(response, 403, { message: "This task cannot be submitted." });
        db.prepare("UPDATE tasks SET status = 'under_review', progress = 100, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(task.id);
        notifyTaskAudience(task, actor.id, "Task ready for review", `${actor.name} submitted: ${task.title}`);
      }
      if (action === "approve") {
        if (!canManage(actor, task) || task.status !== "under_review") return send(response, 403, { message: "This task cannot be approved." });
        db.prepare("UPDATE tasks SET status = 'done', progress = 100, review_comment = 'Approved.', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(task.id);
        for (const userId of assignedUserIds) notify(userId, "approval", "Task approved", `${actor.name} approved: ${task.title}`, task.id);
      }
      if (action === "reopen") {
        const comment = String(body.comment ?? "").trim();
        if (!canManage(actor, task) || task.status !== "under_review" || !comment) return send(response, 403, { message: "A review comment is required." });
        db.prepare("UPDATE tasks SET status = 'in_progress', progress = MIN(progress, 90), review_comment = ?, completed_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(comment, task.id);
        for (const userId of assignedUserIds) notify(userId, "review", "Task reopened", `${actor.name}: ${comment}`, task.id);
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
        saveTaskFiles(task.id, actor, body.files);
      }
      touchSession(request);
      return send(response, 200, { task: serializeTask(getTask(task.id)) });
    }

    if (request.method === "POST" && path === "/api/notifications/read") {
      db.prepare("UPDATE notifications SET is_read = 1 WHERE user_id = ?").run(actor.id);
      return send(response, 200, { ok: true });
    }

    if (request.method === "POST" && path === "/api/chat/groups") {
      requireManager(actor);
      const name = String(body.name ?? "").trim().slice(0, 80);
      const department = actor.role === "admin" ? actor.department : String(body.department ?? "").trim();
      if (!name) throw new Error("Group name is required.");
      const departmentExists = db.prepare("SELECT id FROM users WHERE department = ? LIMIT 1").get(department);
      if (!departmentExists || department === "Executive") throw new Error("Choose a valid department.");
      const id = randomUUID();
      db.prepare("INSERT INTO chat_groups (id, name, department, created_by_id) VALUES (?, ?, ?, ?)")
        .run(id, name, department, actor.id);
      touchSession(request);
      return send(response, 201, { channel: { id: `group:${id}`, name, department, isGroup: true } });
    }

    if (request.method === "POST" && path === "/api/chat/messages") {
      const channelId = String(body.channelId ?? "");
      const message = String(body.body ?? "").trim().slice(0, 2000);
      if (!message) throw new Error("Message cannot be empty.");
      let department = "";
      if (channelId.startsWith("department:")) {
        department = channelId.slice("department:".length);
      } else if (channelId.startsWith("group:")) {
        const group = db.prepare("SELECT department FROM chat_groups WHERE id = ?").get(channelId.slice("group:".length));
        if (!group) return send(response, 404, { message: "Chat group not found." });
        department = group.department;
      }
      if (!department) return send(response, 404, { message: "Chat channel not found." });
      if (actor.role !== "superadmin" && actor.department !== department) {
        return send(response, 403, { message: "You can chat only inside your own department." });
      }
      db.prepare(`
        INSERT INTO chat_messages (id, channel_id, department, author_id, author_name, body)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(randomUUID(), channelId, department, actor.id, actor.name, message);
      touchSession(request);
      return send(response, 201, { ok: true });
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
