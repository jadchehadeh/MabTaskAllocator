import { createServer } from "node:http";
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { AsyncLocalStorage } from "node:async_hooks";
import pg from "pg";
import ExcelJS from "exceljs";

const { Pool } = pg;
const port = Number(process.env.PORT ?? 4000);
const appDirectory = dirname(fileURLToPath(import.meta.url));
const attachmentsPath = resolve(process.env.ATTACHMENTS_PATH ?? join(appDirectory, "data", "attachments"));
const sessionIdleMinutes = 10;
const maxFileSize = 10 * 1024 * 1024;
const maxFilesPerUpload = 5;
const taskTypes = ["Technical", "QS", "Shop Drawings", "BIM", "Variation"];
const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://mab_user:mab_password@localhost:5432/mab_task_allocator";

mkdirSync(attachmentsPath, { recursive: true });

const pool = new Pool({
  connectionString,
  max: Number(process.env.DATABASE_POOL_SIZE ?? 10),
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined
});
pool.on("error", (error) => console.error("Unexpected PostgreSQL pool error", error));

const schemaSql = readFileSync(new URL("../../infra/postgres/init.sql", import.meta.url), "utf8");
await pool.query(schemaSql);
const queryContext = new AsyncLocalStorage();

function executeQuery(text, values = []) {
  return (queryContext.getStore() ?? pool).query(text, values);
}

function translateSql(sql) {
  let text = String(sql);
  const ignoreConflicts = /INSERT\s+OR\s+IGNORE/i.test(text);
  text = text
    .replace(/INSERT\s+OR\s+IGNORE/gi, "INSERT")
    .replace(/\s+COLLATE\s+NOCASE/gi, "")
    .replace(/datetime\('now',\s*'-10 minutes'\)/gi, "(timezone('UTC', now() - interval '10 minutes')::text)")
    .replace(/CURRENT_TIMESTAMP/gi, "(timezone('UTC', now())::text)")
    .replace(/MIN\(progress,\s*90\)/gi, "LEAST(progress, 90)")
    .replace(/count\(\*\)\s+AS\s+count/gi, "count(*)::int AS count");

  let parameter = 0;
  text = text.replace(/\?/g, () => "$" + (++parameter));
  if (ignoreConflicts) text = text.trim().replace(/;$/, "") + " ON CONFLICT DO NOTHING";
  return text;
}

const db = {
  prepare(sql) {
    const text = translateSql(sql);
    return {
      async all(...values) {
        return (await executeQuery(text, values)).rows;
      },
      async get(...values) {
        return (await executeQuery(text, values)).rows[0];
      },
      async run(...values) {
        const result = await executeQuery(text, values);
        return { changes: result.rowCount ?? 0 };
      }
    };
  },
  exec(sql) {
    return executeQuery(translateSql(sql));
  },
  async transaction(work) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await queryContext.run(client, work);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
};
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

const superadminExists = await db.prepare("SELECT id FROM users WHERE role = 'superadmin' LIMIT 1").get();
if (!superadminExists) {
  await db.prepare(`
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

function sameDepartment(first, second) {
  return String(first ?? "").trim().toLocaleLowerCase() === String(second ?? "").trim().toLocaleLowerCase();
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

async function getTask(taskId) {
  return await db.prepare(`
    SELECT tasks.*, projects.name AS project_name
    FROM tasks LEFT JOIN projects ON projects.id = tasks.project_id
    WHERE tasks.id = ?
  `).get(taskId);
}

async function todosFor(userId) {
  return (await db.prepare(`
    SELECT todos.*, tasks.task_code, tasks.title AS task_title
    FROM todos LEFT JOIN tasks ON tasks.id = todos.task_id
    WHERE todos.user_id = ?
    ORDER BY todos.is_completed ASC, todos.created_at DESC
  `).all(userId)).map((todo) => ({
    id: todo.id,
    title: todo.title,
    completed: Boolean(todo.is_completed),
    taskId: todo.task_id ?? undefined,
    taskCode: todo.task_code ?? undefined,
    taskTitle: todo.task_title ?? undefined,
    createdAt: formatDate(todo.created_at),
    completedAt: formatDate(todo.completed_at)
  }));
}

async function serializeTask(row) {
  const messages = (await db.prepare(`
    SELECT id, author_id, author_name, body, created_at FROM task_messages
    WHERE task_id = ? ORDER BY created_at ASC
  `).all(row.id)).map((message) => ({
    id: message.id,
    authorId: message.author_id ?? "deleted-user",
    authorName: message.author_name,
    body: message.body,
    createdAt: formatDate(message.created_at)
  }));
  const assignees = await db.prepare(`
    SELECT users.id, users.name FROM task_assignees
    JOIN users ON users.id = task_assignees.user_id
    WHERE task_assignees.task_id = ? ORDER BY users.name
  `).all(row.id);
  const approvals = await db.prepare(`
    SELECT users.id, users.name, task_worker_approvals.approved_at
    FROM task_worker_approvals JOIN users ON users.id = task_worker_approvals.user_id
    WHERE task_worker_approvals.task_id = ? ORDER BY task_worker_approvals.approved_at
  `).all(row.id);
  const approvedIds = approvals.map((approval) => approval.id);
  const files = (await db.prepare(`
    SELECT id, name, uploaded_by, uploaded_at, mime_type, size FROM task_files
    WHERE task_id = ? ORDER BY uploaded_at ASC
  `).all(row.id)).map((file) => ({
    id: file.id,
    name: file.name,
    uploadedBy: file.uploaded_by,
    uploadedAt: formatDate(file.uploaded_at),
    mimeType: file.mime_type ?? "application/octet-stream",
    size: file.size ?? 0
  }));

  return {
    id: row.id,
    taskCode: row.task_code,
    title: row.title,
    department: row.department,
    priority: row.priority,
    status: row.status,
    assigneeId: assignees[0]?.id ?? row.assignee_id ?? undefined,
    assigneeIds: assignees.map((assignee) => assignee.id),
    candidateName: assignees.map((assignee) => assignee.name).join(", ") || "Unassigned",
    candidateNames: assignees.map((assignee) => assignee.name),
    workerApprovals: approvals.map((approval) => ({ id: approval.id, name: approval.name, approvedAt: isoDateTime(approval.approved_at) })),
    pendingApprovalNames: assignees.filter((assignee) => !approvedIds.includes(assignee.id)).map((assignee) => assignee.name),
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

async function projectsFor(actor) {
  const rows = actor.role === "superadmin"
    ? await db.prepare("SELECT * FROM projects ORDER BY created_at DESC").all()
    : actor.role === "admin"
      ? await db.prepare("SELECT * FROM projects WHERE department = ? ORDER BY created_at DESC").all(actor.department)
      : await db.prepare(`
          SELECT projects.* FROM projects JOIN project_members ON project_members.project_id = projects.id
          WHERE project_members.user_id = ? ORDER BY projects.created_at DESC
        `).all(actor.id);
  return Promise.all(rows.map(async (project) => {
    const members = (await db.prepare(`
      SELECT users.id, users.name, users.username, users.role, users.department
      FROM project_members JOIN users ON users.id = project_members.user_id
      WHERE project_members.project_id = ? ORDER BY users.name
    `).all(project.id)).map(publicUser);
    const taskCount = (await db.prepare("SELECT count(*) AS count FROM tasks WHERE project_id = ?").get(project.id)).count;
    return {
      id: project.id,
      name: project.name,
      description: project.description,
      department: project.department,
      createdAt: isoDateTime(project.created_at),
      members,
      taskCount
    };
  }));
}

function normalizeTaskType(value) {
  const requested = String(value ?? "Technical").trim().toLowerCase();
  if (requested === "varation") return "Variation";
  return taskTypes.find((type) => type.toLowerCase() === requested) ?? "Technical";
}

function codeInitials(value, fallback) {
  const initials = String(value ?? "").match(/[A-Za-z0-9]+/g)?.map((word) => word[0]).join("").toUpperCase();
  return (initials || fallback).slice(0, 5);
}

async function generateTaskCode(projectName, department) {
  const projectCode = codeInitials(projectName, "GEN");
  const departmentCode = String(department).startsWith("Electrical") ? "E"
    : String(department).startsWith("Mechanical") ? "M"
      : String(department).startsWith("Document") ? "D"
        : codeInitials(department, "D").slice(0, 2);
  const prefix = `${projectCode}${departmentCode}`;
  const result = await executeQuery(`
    INSERT INTO task_code_sequences (prefix, next_number)
    VALUES ($1, 2)
    ON CONFLICT (prefix) DO UPDATE
      SET next_number = task_code_sequences.next_number + 1
    RETURNING next_number - 1 AS number
  `, [prefix]);
  const number = result.rows[0].number;
  return `${prefix}-${String(number).padStart(2, "0")}`;
}

async function ensureTaskChatGroup(taskId) {
  const task = await db.prepare("SELECT id, task_code, department FROM tasks WHERE id = ?").get(taskId);
  if (!task || (await taskAssigneeIds(taskId)).length < 2) return;
  const existing = await db.prepare("SELECT id FROM chat_groups WHERE task_id = ?").get(taskId);
  if (existing) {
    await db.prepare("UPDATE chat_groups SET name = ? WHERE id = ?").run(`Task #${task.task_code}`, existing.id);
    return;
  }
  await db.prepare("INSERT INTO chat_groups (id, name, department, created_by_id, task_id) VALUES (?, ?, ?, NULL, ?)")
    .run(randomUUID(), `Task #${task.task_code}`, task.department, taskId);
}

async function deleteTaskChatGroup(taskId) {
  const group = await db.prepare("SELECT id FROM chat_groups WHERE task_id = ?").get(taskId);
  if (!group) return;
  await db.prepare("DELETE FROM chat_messages WHERE channel_id = ?").run(`group:${group.id}`);
  await db.prepare("DELETE FROM chat_groups WHERE id = ?").run(group.id);
}

async function taskAssigneeIds(taskId) {
  return (await db.prepare("SELECT user_id FROM task_assignees WHERE task_id = ?").all(taskId)).map((item) => item.user_id);
}

async function setTaskAssignees(taskId, assigneeIds) {
  await db.prepare("DELETE FROM task_assignees WHERE task_id = ?").run(taskId);
  for (const userId of assigneeIds) {
    await db.prepare("INSERT INTO task_assignees (task_id, user_id) VALUES (?, ?)").run(taskId, userId);
  }
  await db.prepare("UPDATE tasks SET assignee_id = ? WHERE id = ?").run(assigneeIds[0] ?? null, taskId);
  if (assigneeIds.length) {
    await db.prepare(`
      DELETE FROM task_worker_approvals WHERE task_id = ?
        AND user_id NOT IN (${assigneeIds.map(() => "?").join(",")})
    `).run(taskId, ...assigneeIds);
  } else {
    await db.prepare("DELETE FROM task_worker_approvals WHERE task_id = ?").run(taskId);
  }
  await ensureTaskChatGroup(taskId);
}

async function validTaskAssignees(ids, department, projectId = null) {
  const uniqueIds = [...new Set(Array.isArray(ids) ? ids.map(String) : [])];
  if (!uniqueIds.length) return [];
  const users = await db.prepare(`
    SELECT * FROM users WHERE id IN (${uniqueIds.map(() => "?").join(",")})
      AND role = 'user' AND lower(trim(department)) = lower(trim(?))
  `).all(...uniqueIds, department);
  if (users.length !== uniqueIds.length) throw new Error("Every assignee must be a normal user in the task department.");
  if (projectId) {
    const memberCount = (await db.prepare(`
      SELECT count(*) AS count FROM project_members
      WHERE project_id = ? AND user_id IN (${uniqueIds.map(() => "?").join(",")})
    `).get(projectId, ...uniqueIds)).count;
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

async function notify(userId, kind, title, body, taskId) {
  if (!userId) return;
  await db.prepare(`
    INSERT INTO notifications (id, user_id, kind, title, body, task_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(randomUUID(), userId, kind, title, body, taskId ?? null);
}

async function notifyTaskAudience(task, actorId, title, body) {
  const audience = await db.prepare(`
    SELECT id FROM users
    WHERE id != ? AND (role = 'superadmin' OR department = ?)
  `).all(actorId, task.department);
  await Promise.all(audience.map((user) => notify(user.id, "message", title, body, task.id)));
}

async function chatDataFor(actor) {
  const departments = actor.role === "superadmin"
    ? (await db.prepare(`
        SELECT department FROM users WHERE department != 'Executive'
        UNION SELECT department FROM tasks WHERE department != 'Executive'
        ORDER BY department
      `).all()).map((item) => item.department)
    : [actor.department];
  const departmentGroups = departments.length
    ? await db.prepare(`
        SELECT id, name, department, task_id FROM chat_groups
        WHERE department IN (${departments.map(() => "?").join(",")})
        ORDER BY created_at ASC
      `).all(...departments)
    : [];
  const groups = [];
  for (const group of departmentGroups) {
    if (!group.task_id || actor.role === "superadmin" || actor.role === "admin" || (await taskAssigneeIds(group.task_id)).includes(actor.id)) {
      groups.push(group);
    }
  }
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
      isGroup: true,
      taskId: group.task_id ?? undefined
    }))
  ];
  const channelIds = channels.map((channel) => channel.id);
  const messages = channelIds.length
    ? (await db.prepare(`
        SELECT * FROM (
          SELECT id, channel_id, author_id, author_name, body, created_at
          FROM chat_messages
          WHERE channel_id IN (${channelIds.map(() => "?").join(",")})
          ORDER BY created_at DESC LIMIT 300
        ) ORDER BY created_at ASC
      `).all(...channelIds)).map((message) => ({
        id: message.id,
        channelId: message.channel_id,
        authorId: message.author_id ?? "deleted-user",
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

async function canView(user, task) {
  if (user.role === "superadmin") return true;
  if (user.department !== task.department) return false;
  if (user.role === "admin" || !task.project_id) return true;
  return Boolean(await db.prepare("SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?").get(task.project_id, user.id));
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

async function authenticatedUser(request) {
  const token = request.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const row = await db.prepare(`
    SELECT users.*, sessions.last_active_at FROM sessions JOIN users ON users.id = sessions.user_id
    WHERE sessions.token = ?
  `).get(token);
  if (row?.last_active_at) {
    const lastActive = new Date(`${row.last_active_at.replace(" ", "T")}Z`).getTime();
    if (Date.now() - lastActive >= sessionIdleMinutes * 60 * 1000) {
      await db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
      return null;
    }
  }
  return row ? publicUser(row) : null;
}

async function touchSession(request) {
  const token = request.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (token) await db.prepare("UPDATE sessions SET last_active_at = CURRENT_TIMESTAMP WHERE token = ?").run(token);
}

async function saveTaskFiles(taskId, actor, files) {
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
  try {
    await db.transaction(async () => {
      for (const file of prepared) {
        writeFileSync(join(attachmentsPath, file.storageName), file.data, { flag: "wx" });
        writtenFiles.push(file.storageName);
        await db.prepare(`
          INSERT INTO task_files (id, task_id, name, uploaded_by, storage_name, mime_type, size)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(randomUUID(), taskId, file.name, actor.name, file.storageName, file.mimeType, file.data.length);
      }
    });
  } catch (error) {
    for (const storageName of writtenFiles) {
      try { unlinkSync(join(attachmentsPath, storageName)); } catch { /* Best-effort cleanup. */ }
    }
    throw error;
  }
}

for (const task of await db.prepare(`
  SELECT tasks.id, tasks.department, projects.name AS project_name
  FROM tasks LEFT JOIN projects ON projects.id = tasks.project_id
  WHERE tasks.task_code IS NULL OR tasks.task_code = ''
  ORDER BY tasks.created_at
`).all()) {
  await db.prepare("UPDATE tasks SET task_code = ? WHERE id = ?")
    .run(await generateTaskCode(task.project_name, task.department), task.id);
}
await db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_code ON tasks(task_code)");
for (const task of await db.prepare("SELECT id FROM tasks").all()) await ensureTaskChatGroup(task.id);

async function buildProductivityReport(user, month = "") {
  const monthFilter = /^\d{4}-\d{2}$/.test(month) ? month : "";
  const rows = await db.prepare(`
    SELECT DISTINCT tasks.id, tasks.task_code, tasks.title, tasks.department, tasks.priority, tasks.status,
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
    { header: "Task ID", key: "taskCode", width: 16 },
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
      taskCode: task.task_code,
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
  tasks.autoFilter = { from: "A1", to: "M1" };
  tasks.eachRow((row, rowNumber) => {
    if (rowNumber > 1 && rowNumber % 2 === 0) row.eachCell((cell) => { cell.fill = paleFill; });
  });
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

async function buildProjectTaskTemplate(project) {
  const members = await db.prepare(`
    SELECT users.name, users.username FROM project_members
    JOIN users ON users.id = project_members.user_id
    WHERE project_members.project_id = ? ORDER BY users.name
  `).all(project.id);
  const usernames = members.map((member) => member.username);
  const firstUser = usernames[0] ?? "user@mabunited.com";
  const secondUser = usernames[1] ?? firstUser;
  const due = (days) => {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + days);
    return date;
  };
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "MAB Task Allocator";
  workbook.created = new Date();
  const tasks = workbook.addWorksheet("Tasks", { views: [{ state: "frozen", ySplit: 1, showGridLines: false }] });
  const instructions = workbook.addWorksheet("Instructions", { views: [{ showGridLines: false }] });
  const headerFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1178B8" } };
  const paleFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF8FF" } };
  tasks.columns = [
    { header: "Task", key: "task", width: 42 },
    { header: "Priority", key: "priority", width: 14 },
    { header: "Due Date", key: "dueDate", width: 16 },
    { header: "Progress", key: "progress", width: 14 },
    { header: "Task Type", key: "taskType", width: 20 },
    { header: "Assignees", key: "assignees", width: 48 }
  ];
  tasks.addRows([
    { task: "Prepare technical submittal package", priority: "high", dueDate: due(7), progress: 0, taskType: "Technical", assignees: firstUser },
    { task: "Review quantity takeoff and measurements", priority: "medium", dueDate: due(12), progress: 25, taskType: "QS", assignees: secondUser },
    { task: "Coordinate BIM model and shop drawings", priority: "urgent", dueDate: due(18), progress: 0, taskType: "BIM", assignees: `${firstUser};${secondUser}` }
  ]);
  tasks.getRow(1).height = 28;
  tasks.getRow(1).eachCell((cell) => {
    cell.fill = headerFill;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.alignment = { vertical: "middle" };
  });
  tasks.getColumn("dueDate").numFmt = "yyyy-mm-dd";
  tasks.getColumn("progress").numFmt = "0";
  tasks.autoFilter = { from: "A1", to: "F1" };
  for (let row = 2; row <= 250; row += 1) {
    tasks.getCell(`B${row}`).dataValidation = { type: "list", allowBlank: false, formulae: ['"low,medium,high,urgent"'] };
    tasks.getCell(`D${row}`).dataValidation = { type: "whole", operator: "between", allowBlank: true, formulae: [0, 100] };
    tasks.getCell(`E${row}`).dataValidation = { type: "list", allowBlank: false, formulae: ['"Technical,QS,Shop Drawings,BIM,Variation"'] };
  }
  tasks.eachRow((row, rowNumber) => {
    if (rowNumber > 1 && rowNumber % 2 === 0) row.eachCell((cell) => { cell.fill = paleFill; });
  });

  instructions.mergeCells("A1:F1");
  instructions.getCell("A1").value = `${project.name} - Project Task Sheet`;
  instructions.getCell("A1").fill = headerFill;
  instructions.getCell("A1").font = { bold: true, color: { argb: "FFFFFFFF" }, size: 17 };
  instructions.getRow(1).height = 32;
  instructions.getCell("A3").value = "Department";
  instructions.getCell("B3").value = project.department;
  instructions.getCell("A4").value = "How to use";
  instructions.getCell("B4").value = "Edit or replace the dummy rows on the Tasks sheet, keep the header names unchanged, then import the completed workbook into this project.";
  instructions.getCell("A6").value = "Assignees";
  instructions.getCell("B6").value = "Use a project member name or username. Separate multiple assignees with a semicolon (;).";
  instructions.getCell("A8").value = "Project members";
  instructions.getCell("B8").value = members.map((member) => `${member.name} (${member.username})`).join("; ") || "Add project members before importing assignments.";
  instructions.getColumn("A").width = 22;
  instructions.getColumn("B").width = 90;
  instructions.getColumn("B").alignment = { wrapText: true, vertical: "top" };
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
  if (actor.role === "admin" && (target.role !== "user" || !sameDepartment(target.department, actor.department))) {
    const error = new Error("Admins can manage normal users in their own department only.");
    error.status = 403;
    throw error;
  }
}

async function requireDepartment(name) {
  const department = await db.prepare("SELECT name FROM departments WHERE lower(name) = lower(?)")
    .get(String(name ?? "").trim());
  if (!department) {
    const error = new Error("Choose a valid department.");
    error.status = 400;
    throw error;
  }
  return department.name;
}

const server = createServer(async (request, response) => {
  if (request.method === "OPTIONS") return send(response, 204, {});

  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const path = url.pathname;
    const body = request.method === "GET" ? {} : await readBody(request);

    if (request.method === "GET" && path === "/api/health") {
      const health = await executeQuery("SELECT current_database() AS database, now() AS time");
      return send(response, 200, { ok: true, database: health.rows[0].database, time: health.rows[0].time });
    }

    if (request.method === "POST" && path === "/api/auth/login") {
      const row = await db.prepare("SELECT * FROM users WHERE lower(username) = lower(?)").get(String(body.username ?? "").trim());
      if (!row || !passwordMatches(String(body.password ?? ""), row.password_hash)) {
        return send(response, 401, { message: "Username or password is incorrect." });
      }
      const token = randomBytes(32).toString("hex");
      await db.prepare("INSERT INTO sessions (token, user_id, last_active_at) VALUES (?, ?, CURRENT_TIMESTAMP)").run(token, row.id);
      return send(response, 200, { token, user: publicUser(row) });
    }

    const actor = await authenticatedUser(request);
    if (!actor) return send(response, 401, { message: "Please log in again." });

    if (request.method === "POST" && path === "/api/auth/fork") {
      const token = randomBytes(32).toString("hex");
      await db.prepare("INSERT INTO sessions (token, user_id, last_active_at) VALUES (?, ?, CURRENT_TIMESTAMP)")
        .run(token, actor.id);
      await db.prepare("DELETE FROM sessions WHERE last_active_at < datetime('now', '-10 minutes')").run();
      return send(response, 201, { token });
    }

    if (request.method === "POST" && path === "/api/auth/activity") {
      await touchSession(request);
      return send(response, 200, { ok: true });
    }

    if (request.method === "POST" && path === "/api/auth/logout") {
      const token = request.headers.authorization.replace(/^Bearer\s+/i, "");
      await db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
      return send(response, 200, { ok: true });
    }

    if (request.method === "GET" && path === "/api/chat") {
      return send(response, 200, await chatDataFor(actor));
    }

    const fileDownloadMatch = path.match(/^\/api\/files\/([^/]+)\/download$/);
    if (request.method === "GET" && fileDownloadMatch) {
      const file = await db.prepare(`
        SELECT task_files.*, tasks.department, tasks.assignee_id, tasks.project_id
        FROM task_files JOIN tasks ON tasks.id = task_files.task_id
        WHERE task_files.id = ?
      `).get(fileDownloadMatch[1]);
      if (!file) return send(response, 404, { message: "File not found." });
      if (!await canView(actor, file)) return send(response, 403, { message: "You cannot download this file." });
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
      const target = await db.prepare("SELECT * FROM users WHERE id = ? AND role = 'user'").get(reportMatch[1]);
      if (!target) return send(response, 404, { message: "Normal user not found." });
      if (actor.role === "admin" && !sameDepartment(target.department, actor.department)) {
        return send(response, 403, { message: "Admins can export reports for their own department only." });
      }
      await touchSession(request);
      const month = url.searchParams.get("month") ?? "";
      const data = await buildProductivityReport(target, month);
      const reportSlug = target.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || target.id.slice(0, 8);
      const reportName = `productivity-${reportSlug}-${/^\d{4}-\d{2}$/.test(month) ? month : new Date().toISOString().slice(0, 10)}.xlsx`;
      return sendBinary(response, 200, data, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", reportName);
    }

    if (request.method === "GET" && path === "/api/bootstrap") {
      const users = (await db.prepare("SELECT * FROM users ORDER BY name").all()).map(publicUser);
      const departments = (await db.prepare("SELECT name FROM departments ORDER BY name").all())
        .map((item) => item.name);
      const taskRows = await db.prepare(`
        SELECT tasks.*, projects.name AS project_name
        FROM tasks LEFT JOIN projects ON projects.id = tasks.project_id
        ORDER BY tasks.created_at DESC
      `).all();
      const visibleTaskRows = [];
      for (const task of taskRows) {
        if (await canView(actor, task)) visibleTaskRows.push(task);
      }
      const tasks = await Promise.all(visibleTaskRows.map(serializeTask));
      const notifications = (await db.prepare(`
        SELECT id, kind, title, body, task_id, is_read, created_at
        FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 30
      `).all(actor.id)).map((item) => ({
        id: item.id,
        kind: item.kind,
        title: item.title,
        body: item.body,
        taskId: item.task_id ?? undefined,
        isRead: Boolean(item.is_read),
        createdAt: formatDate(item.created_at)
      }));
      return send(response, 200, {
        currentUser: actor,
        departments,
        users,
        tasks,
        projects: await projectsFor(actor),
        notifications,
        todos: await todosFor(actor.id),
        ...(await chatDataFor(actor))
      });
    }

    if (request.method === "POST" && path === "/api/departments") {
      if (actor.role !== "superadmin") {
        return send(response, 403, { message: "Only Super Admin can create departments." });
      }
      const name = String(body.name ?? "").trim().replace(/\s+/g, " ").slice(0, 120);
      if (name.length < 2) throw new Error("Enter a department name.");
      const existing = await db.prepare("SELECT id FROM departments WHERE lower(name) = lower(?)").get(name);
      if (existing) return send(response, 409, { message: "This department already exists." });
      await db.prepare("INSERT INTO departments (id, name, created_by_id) VALUES (?, ?, ?)")
        .run(`department-${randomUUID()}`, name, actor.id);
      return send(response, 201, { department: name });
    }

    if (request.method === "POST" && path === "/api/todos") {
      const title = String(body.title ?? "").trim().slice(0, 240);
      const taskId = String(body.taskId ?? "").trim() || null;
      if (!title) throw new Error("TODO title is required.");
      if (taskId) {
        const task = await getTask(taskId);
        if (!task) return send(response, 404, { message: "Linked task not found." });
        if (!await canView(actor, task)) return send(response, 403, { message: "You cannot link a TODO to this task." });
      }
      const id = randomUUID();
      await db.prepare("INSERT INTO todos (id, user_id, task_id, title) VALUES (?, ?, ?, ?)")
        .run(id, actor.id, taskId, title);
      await touchSession(request);
      return send(response, 201, { todo: (await todosFor(actor.id)).find((todo) => todo.id === id) });
    }

    const todoMatch = path.match(/^\/api\/todos\/([^/]+)$/);
    if (todoMatch && request.method === "PUT") {
      const existing = await db.prepare("SELECT * FROM todos WHERE id = ? AND user_id = ?").get(todoMatch[1], actor.id);
      if (!existing) return send(response, 404, { message: "TODO item not found." });
      const title = String(body.title ?? existing.title).trim().slice(0, 240);
      const completed = Boolean(body.completed);
      const taskId = body.taskId === undefined ? existing.task_id : String(body.taskId ?? "").trim() || null;
      if (!title) throw new Error("TODO title is required.");
      if (taskId) {
        const task = await getTask(taskId);
        if (!task) return send(response, 404, { message: "Linked task not found." });
        if (!await canView(actor, task)) return send(response, 403, { message: "You cannot link a TODO to this task." });
      }
      await db.prepare(`
        UPDATE todos
        SET title = ?, task_id = ?, is_completed = ?,
            completed_at = CASE WHEN ? = 1 THEN COALESCE(completed_at, CURRENT_TIMESTAMP) ELSE NULL END,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND user_id = ?
      `).run(title, taskId, completed ? 1 : 0, completed ? 1 : 0, existing.id, actor.id);
      await touchSession(request);
      return send(response, 200, { todo: (await todosFor(actor.id)).find((todo) => todo.id === existing.id) });
    }

    if (todoMatch && request.method === "DELETE") {
      const result = await db.prepare("DELETE FROM todos WHERE id = ? AND user_id = ?").run(todoMatch[1], actor.id);
      if (!result.changes) return send(response, 404, { message: "TODO item not found." });
      await touchSession(request);
      return send(response, 200, { ok: true });
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
      target.department = await requireDepartment(target.department);
      if (!target.name || !target.username || !target.password) throw new Error("Name, username, and password are required.");
      await db.prepare(`
        INSERT INTO users (id, name, username, password_hash, role, department)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(target.id, target.name, target.username, hashPassword(target.password), target.role, target.department);
      return send(response, 201, { user: publicUser(target) });
    }

    const userMatch = path.match(/^\/api\/users\/([^/]+)$/);
    if (userMatch && request.method === "PUT") {
      const existing = await db.prepare("SELECT * FROM users WHERE id = ?").get(userMatch[1]);
      if (!existing) return send(response, 404, { message: "User not found." });
      const target = {
        ...existing,
        name: String(body.name ?? existing.name).trim(),
        username: String(body.username ?? existing.username).trim(),
        role: actor.role === "admin" ? "user" : body.role,
        department: actor.role === "admin" ? actor.department : body.department
      };
      validateUserScope(actor, target);
      target.department = await requireDepartment(target.department);
      await db.prepare("UPDATE users SET name = ?, username = ?, role = ?, department = ? WHERE id = ?")
        .run(target.name, target.username, target.role, target.department, target.id);
      if (body.password) await db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashPassword(body.password), target.id);
      return send(response, 200, { user: publicUser(target) });
    }

    if (userMatch && request.method === "DELETE") {
      const target = await db.prepare("SELECT * FROM users WHERE id = ?").get(userMatch[1]);
      if (!target) return send(response, 404, { message: "User not found." });
      validateUserScope(actor, target);
      if (target.id === actor.id || target.role === "superadmin") return send(response, 403, { message: "This user cannot be deleted." });
      await db.prepare("DELETE FROM users WHERE id = ?").run(target.id);
      await db.exec(`
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
      await requireDepartment(department);
      const members = await validTaskAssignees(body.memberIds, department);
      const id = randomUUID();
      await db.transaction(async () => {
        await db.prepare("INSERT INTO projects (id, name, description, department, created_by_id) VALUES (?, ?, ?, ?, ?)")
          .run(id, name, description, department, actor.id);
        for (const member of members) {
          await db.prepare("INSERT INTO project_members (project_id, user_id) VALUES (?, ?)").run(id, member.id);
        }
      });
      return send(response, 201, { project: (await projectsFor(actor)).find((project) => project.id === id) });
    }

    const projectTemplateMatch = path.match(/^\/api\/projects\/([^/]+)\/task-sheet-template$/);
    if (projectTemplateMatch && request.method === "GET") {
      requireManager(actor);
      const project = await db.prepare("SELECT * FROM projects WHERE id = ?").get(projectTemplateMatch[1]);
      if (!project) return send(response, 404, { message: "Project not found." });
      if (actor.role === "admin" && !sameDepartment(project.department, actor.department)) {
        return send(response, 403, { message: "You cannot export this project task sheet." });
      }
      const data = await buildProjectTaskTemplate(project);
      const slug = project.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "project";
      return sendBinary(response, 200, data, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", `${slug}-task-sheet.xlsx`);
    }

    const projectImportMatch = path.match(/^\/api\/projects\/([^/]+)\/import$/);
    if (projectImportMatch && request.method === "POST") {
      requireManager(actor);
      const project = await db.prepare("SELECT * FROM projects WHERE id = ?").get(projectImportMatch[1]);
      if (!project) return send(response, 404, { message: "Project not found." });
      if (actor.role === "admin" && !sameDepartment(project.department, actor.department)) {
        return send(response, 403, { message: "You cannot import tasks into this project." });
      }
      const importedTasks = await parseTaskSheet(body.file);
      const members = await db.prepare(`
        SELECT users.* FROM project_members JOIN users ON users.id = project_members.user_id
        WHERE project_members.project_id = ?
      `).all(project.id);
      const createdIds = [];
      await db.transaction(async () => {
        for (const imported of importedTasks) {
          const assigneeIds = members
            .filter((member) => imported.assignees.some((value) =>
              value.toLowerCase() === member.username.toLowerCase() || value.toLowerCase() === member.name.toLowerCase()))
            .map((member) => member.id);
          const id = randomUUID();
          const taskCode = await generateTaskCode(project.name, project.department);
          const status = assigneeIds.length ? (imported.progress > 0 ? "in_progress" : "assigned") : "new";
          await db.prepare(`
            INSERT INTO tasks (id, task_code, title, department, priority, status, assignee_id, project_id, task_type, due_date, progress, created_by_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(id, taskCode, imported.title, project.department, imported.priority, status, assigneeIds[0] ?? null,
            project.id, imported.taskType, imported.dueDate, assigneeIds.length ? imported.progress : 0, actor.id);
          for (const userId of assigneeIds) {
            await db.prepare("INSERT INTO task_assignees (task_id, user_id) VALUES (?, ?)").run(id, userId);
          }
          createdIds.push(id);
        }
      });
      for (const id of createdIds) {
        await ensureTaskChatGroup(id);
        for (const userId of await taskAssigneeIds(id)) await notify(userId, "assignment", "Imported project task", `A task was imported into ${project.name}.`, id);
      }
      await touchSession(request);
      return send(response, 201, { imported: createdIds.length });
    }

    const projectMatch = path.match(/^\/api\/projects\/([^/]+)$/);
    if (projectMatch && request.method === "PUT") {
      requireManager(actor);
      const project = await db.prepare("SELECT * FROM projects WHERE id = ?").get(projectMatch[1]);
      if (!project) return send(response, 404, { message: "Project not found." });
      if (actor.role === "admin" && !sameDepartment(project.department, actor.department)) return send(response, 403, { message: "You cannot edit this project." });
      const members = await validTaskAssignees(body.memberIds, project.department);
      await db.transaction(async () => {
        await db.prepare("UPDATE projects SET name = ?, description = ? WHERE id = ?")
          .run(String(body.name ?? project.name).trim(), String(body.description ?? project.description).trim(), project.id);
        await db.prepare("DELETE FROM project_members WHERE project_id = ?").run(project.id);
        for (const member of members) await db.prepare("INSERT INTO project_members (project_id, user_id) VALUES (?, ?)").run(project.id, member.id);
        await db.prepare(`
          DELETE FROM task_assignees
          WHERE task_id IN (SELECT id FROM tasks WHERE project_id = ?)
            AND user_id NOT IN (SELECT user_id FROM project_members WHERE project_id = ?)
        `).run(project.id, project.id);
        await db.prepare(`
          UPDATE tasks SET assignee_id = (SELECT user_id FROM task_assignees WHERE task_id = tasks.id LIMIT 1)
          WHERE project_id = ?
        `).run(project.id);
        await db.prepare(`
          UPDATE tasks SET status = 'new', progress = 0
          WHERE project_id = ? AND status != 'done'
            AND NOT EXISTS (SELECT 1 FROM task_assignees WHERE task_id = tasks.id)
        `).run(project.id);
      });
      return send(response, 200, { project: (await projectsFor(actor)).find((item) => item.id === project.id) });
    }

    if (projectMatch && request.method === "DELETE") {
      requireManager(actor);
      const project = await db.prepare("SELECT * FROM projects WHERE id = ?").get(projectMatch[1]);
      if (!project) return send(response, 404, { message: "Project not found." });
      if (actor.role === "admin" && !sameDepartment(project.department, actor.department)) return send(response, 403, { message: "You cannot delete this project." });
      await db.prepare("UPDATE tasks SET project_id = NULL WHERE project_id = ?").run(project.id);
      await db.prepare("DELETE FROM projects WHERE id = ?").run(project.id);
      return send(response, 200, { ok: true });
    }

    if (request.method === "POST" && path === "/api/tasks") {
      requireManager(actor);
      const project = body.projectId ? await db.prepare("SELECT * FROM projects WHERE id = ?").get(body.projectId) : null;
      if (body.projectId && !project) return send(response, 404, { message: "Project not found." });
      const requestedIds = Array.isArray(body.assigneeIds) ? body.assigneeIds : body.assigneeId ? [body.assigneeId] : [];
      const firstRequested = requestedIds[0] ? await db.prepare("SELECT * FROM users WHERE id = ? AND role = 'user'").get(requestedIds[0]) : null;
      const department = project?.department ?? firstRequested?.department ?? (actor.role === "admin" ? actor.department : body.department);
      await requireDepartment(department);
      if (actor.role === "admin" && !sameDepartment(department, actor.department)) return send(response, 403, { message: "Admins can create tasks in their department only." });
      const assignees = await validTaskAssignees(requestedIds, department, project?.id ?? null);
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
      task.taskCode = await generateTaskCode(project?.name, department);
      if (!task.title) throw new Error("Task title is required.");
      await db.prepare(`
        INSERT INTO tasks (id, task_code, title, department, priority, status, assignee_id, project_id, task_type, due_date, progress, created_by_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(task.id, task.taskCode, task.title, task.department, task.priority, task.status, task.assigneeIds[0] ?? null,
        task.projectId, task.taskType, task.dueDate, task.progress, actor.id);
      await setTaskAssignees(task.id, task.assigneeIds);
      try {
        await saveTaskFiles(task.id, actor, body.files);
      } catch (error) {
        await db.prepare("DELETE FROM tasks WHERE id = ?").run(task.id);
        throw error;
      }
      for (const userId of task.assigneeIds) await notify(userId, "assignment", "New task allocated", `You were assigned: ${task.title}`, task.id);
      await touchSession(request);
      return send(response, 201, { task: await serializeTask(await getTask(task.id)) });
    }

    const taskMatch = path.match(/^\/api\/tasks\/([^/]+)$/);
    if (taskMatch && request.method === "PUT") {
      const existing = await getTask(taskMatch[1]);
      if (!existing) return send(response, 404, { message: "Task not found." });
      if (!canManage(actor, existing)) return send(response, 403, { message: "You cannot edit this task." });
      const project = body.projectId ? await db.prepare("SELECT * FROM projects WHERE id = ?").get(body.projectId) : null;
      if (body.projectId && !project) return send(response, 404, { message: "Project not found." });
      const requestedIds = Array.isArray(body.assigneeIds) ? body.assigneeIds : body.assigneeId ? [body.assigneeId] : [];
      const department = project?.department ?? body.department ?? existing.department;
      await requireDepartment(department);
      if (actor.role === "admin" && !sameDepartment(department, actor.department)) return send(response, 403, { message: "Admins can edit tasks in their department only." });
      const assignees = await validTaskAssignees(requestedIds, department, project?.id ?? null);
      const previousIds = await taskAssigneeIds(existing.id);
      await db.prepare(`
        UPDATE tasks SET title = ?, department = ?, priority = ?, status = ?, assignee_id = ?, project_id = ?, task_type = ?, due_date = ?, progress = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(String(body.title).trim(), department, body.priority, body.status, assignees[0]?.id ?? null,
        project?.id ?? null, normalizeTaskType(body.taskType), body.dueDate,
        Math.max(0, Math.min(100, Number(body.progress) || 0)), existing.id);
      await setTaskAssignees(existing.id, assignees.map((assignee) => assignee.id));
      if (body.status === "done") await deleteTaskChatGroup(existing.id);
      for (const assignee of assignees.filter((item) => !previousIds.includes(item.id))) {
        await notify(assignee.id, "assignment", "Task allocated", `You were assigned: ${body.title}`, existing.id);
      }
      return send(response, 200, { task: await serializeTask(await getTask(existing.id)) });
    }

    if (taskMatch && request.method === "DELETE") {
      const task = await getTask(taskMatch[1]);
      if (!task) return send(response, 404, { message: "Task not found." });
      if (!canManage(actor, task)) return send(response, 403, { message: "You cannot delete this task." });
      const files = await db.prepare("SELECT storage_name FROM task_files WHERE task_id = ?").all(task.id);
      await deleteTaskChatGroup(task.id);
      await db.prepare("DELETE FROM tasks WHERE id = ?").run(task.id);
      for (const file of files) {
        if (!file.storage_name) continue;
        try { unlinkSync(join(attachmentsPath, basename(file.storage_name))); } catch { /* Already absent. */ }
      }
      return send(response, 200, { ok: true });
    }

    const taskMessageMatch = path.match(/^\/api\/tasks\/([^/]+)\/messages\/([^/]+)$/);
    if (taskMessageMatch && ["PUT", "DELETE"].includes(request.method)) {
      const task = await getTask(taskMessageMatch[1]);
      if (!task || !await canView(actor, task)) return send(response, 404, { message: "Task comment not found." });
      const message = await db.prepare("SELECT * FROM task_messages WHERE id = ? AND task_id = ?")
        .get(taskMessageMatch[2], task.id);
      if (!message) return send(response, 404, { message: "Task comment not found." });
      if (message.author_id !== actor.id) return send(response, 403, { message: "You can change only your own comments." });
      if (request.method === "PUT") {
        const nextBody = String(body.body ?? "").trim().slice(0, 2000);
        if (!nextBody) throw new Error("Comment cannot be empty.");
        await db.prepare("UPDATE task_messages SET body = ? WHERE id = ?").run(nextBody, message.id);
      } else {
        await db.prepare("DELETE FROM task_messages WHERE id = ?").run(message.id);
      }
      await touchSession(request);
      return send(response, 200, { task: await serializeTask(task) });
    }

    const actionMatch = path.match(/^\/api\/tasks\/([^/]+)\/(claim|submit|approve|reopen|messages|files)$/);
    if (actionMatch && request.method === "POST") {
      const task = await getTask(actionMatch[1]);
      if (!task) return send(response, 404, { message: "Task not found." });
      const action = actionMatch[2];
      const assignedUserIds = await taskAssigneeIds(task.id);

      if (action === "claim") {
        if (actor.role !== "user" || actor.department !== task.department || assignedUserIds.length || !await canView(actor, task)) return send(response, 403, { message: "This task cannot be claimed." });
        await db.prepare("UPDATE tasks SET assignee_id = ?, status = 'assigned', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(actor.id, task.id);
        await db.prepare("INSERT INTO task_assignees (task_id, user_id) VALUES (?, ?)").run(task.id, actor.id);
        await notifyTaskAudience(task, actor.id, "Free task claimed", `${actor.name} took: ${task.title}`);
      }
      if (action === "submit") {
        if (actor.role !== "user" || !assignedUserIds.includes(actor.id) || ["done", "under_review"].includes(task.status)) return send(response, 403, { message: "This task cannot be submitted." });
        await db.prepare("INSERT OR IGNORE INTO task_worker_approvals (task_id, user_id) VALUES (?, ?)").run(task.id, actor.id);
        const approvedIds = (await db.prepare("SELECT user_id FROM task_worker_approvals WHERE task_id = ?").all(task.id)).map((item) => item.user_id);
        const remainingIds = assignedUserIds.filter((userId) => !approvedIds.includes(userId));
        if (remainingIds.length) {
          await db.prepare("UPDATE tasks SET status = 'in_progress', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(task.id);
          for (const userId of remainingIds) await notify(userId, "approval", "Worker approval needed", `${actor.name} approved ${task.task_code}. Your approval is still required.`, task.id);
        } else {
          await db.prepare("UPDATE tasks SET status = 'under_review', progress = 100, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(task.id);
          await notifyTaskAudience(task, actor.id, "Task ready for admin review", `All workers approved ${task.task_code}: ${task.title}`);
        }
      }
      if (action === "approve") {
        if (!canManage(actor, task) || task.status !== "under_review") return send(response, 403, { message: "This task cannot be approved." });
        await db.prepare("UPDATE tasks SET status = 'done', progress = 100, review_comment = 'Approved.', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(task.id);
        await deleteTaskChatGroup(task.id);
        for (const userId of assignedUserIds) await notify(userId, "approval", "Task approved", `${actor.name} approved: ${task.title}`, task.id);
      }
      if (action === "reopen") {
        const comment = String(body.comment ?? "").trim();
        if (!canManage(actor, task) || task.status !== "under_review" || !comment) return send(response, 403, { message: "A review comment is required." });
        await db.prepare("UPDATE tasks SET status = 'in_progress', progress = MIN(progress, 90), review_comment = ?, completed_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(comment, task.id);
        await db.prepare("DELETE FROM task_worker_approvals WHERE task_id = ?").run(task.id);
        for (const userId of assignedUserIds) await notify(userId, "review", "Task reopened", `${actor.name}: ${comment}`, task.id);
      }
      if (action === "messages") {
        if (!await canView(actor, task)) return send(response, 403, { message: "You cannot view this task." });
        if (task.status === "done") return send(response, 409, { message: "Approved tasks are read-only. Existing comments remain available." });
        const message = String(body.body ?? "").trim();
        if (!message) throw new Error("Message cannot be empty.");
        await db.prepare("INSERT INTO task_messages (id, task_id, author_id, author_name, body) VALUES (?, ?, ?, ?, ?)")
          .run(randomUUID(), task.id, actor.id, actor.name, message);
        await notifyTaskAudience(task, actor.id, `New chat on ${task.title}`, `${actor.name}: ${message}`);
      }
      if (action === "files") {
        if (!await canView(actor, task)) return send(response, 403, { message: "You cannot view this task." });
        if (task.status === "done") return send(response, 409, { message: "Approved tasks are locked. Existing documents remain available for download." });
        await saveTaskFiles(task.id, actor, body.files);
      }
      await touchSession(request);
      return send(response, 200, { task: await serializeTask(await getTask(task.id)) });
    }

    if (request.method === "POST" && path === "/api/notifications/read") {
      await db.prepare("UPDATE notifications SET is_read = 1 WHERE user_id = ?").run(actor.id);
      return send(response, 200, { ok: true });
    }

    if (request.method === "POST" && path === "/api/chat/groups") {
      requireManager(actor);
      const name = String(body.name ?? "").trim().slice(0, 80);
      const department = actor.role === "admin" ? actor.department : String(body.department ?? "").trim();
      if (!name) throw new Error("Group name is required.");
      const departmentExists = await db.prepare("SELECT id FROM departments WHERE lower(name) = lower(?) LIMIT 1").get(department);
      if (!departmentExists || department === "Executive") throw new Error("Choose a valid department.");
      const id = randomUUID();
      await db.prepare("INSERT INTO chat_groups (id, name, department, created_by_id) VALUES (?, ?, ?, ?)")
        .run(id, name, department, actor.id);
      await touchSession(request);
      return send(response, 201, { channel: { id: `group:${id}`, name, department, isGroup: true } });
    }

    const chatGroupMatch = path.match(/^\/api\/chat\/groups\/([^/]+)$/);
    if (chatGroupMatch && request.method === "PUT") {
      if (actor.role !== "superadmin") return send(response, 403, { message: "Only Super Admin can edit group chats." });
      const group = await db.prepare("SELECT * FROM chat_groups WHERE id = ?").get(chatGroupMatch[1]);
      if (!group) return send(response, 404, { message: "Chat group not found." });
      const name = String(body.name ?? "").trim().slice(0, 80);
      if (!name) throw new Error("Group name is required.");
      await db.prepare("UPDATE chat_groups SET name = ? WHERE id = ?").run(name, group.id);
      await touchSession(request);
      return send(response, 200, {
        channel: { id: `group:${group.id}`, name, department: group.department, isGroup: true, taskId: group.task_id ?? undefined }
      });
    }

    if (chatGroupMatch && request.method === "DELETE") {
      requireManager(actor);
      const group = await db.prepare("SELECT * FROM chat_groups WHERE id = ?").get(chatGroupMatch[1]);
      if (!group) return send(response, 404, { message: "Chat group not found." });
      if (actor.role === "admin" && !sameDepartment(group.department, actor.department)) {
        return send(response, 403, { message: "Admins can delete group chats in their own department only." });
      }
      const channelId = `group:${group.id}`;
      await db.transaction(async () => {
        await db.prepare("DELETE FROM chat_messages WHERE channel_id = ?").run(channelId);
        await db.prepare("DELETE FROM chat_groups WHERE id = ?").run(group.id);
      });
      await touchSession(request);
      return send(response, 200, { ok: true });
    }

    if (request.method === "POST" && path === "/api/chat/messages") {
      const channelId = String(body.channelId ?? "");
      const message = String(body.body ?? "").trim().slice(0, 2000);
      if (!message) throw new Error("Message cannot be empty.");
      let department = "";
      if (channelId.startsWith("department:")) {
        department = channelId.slice("department:".length);
      } else if (channelId.startsWith("group:")) {
        const group = await db.prepare("SELECT department, task_id FROM chat_groups WHERE id = ?").get(channelId.slice("group:".length));
        if (!group) return send(response, 404, { message: "Chat group not found." });
        department = group.department;
        if (group.task_id && actor.role === "user" && !(await taskAssigneeIds(group.task_id)).includes(actor.id)) {
          return send(response, 403, { message: "This task chat is limited to its assigned workers." });
        }
      }
      if (!department) return send(response, 404, { message: "Chat channel not found." });
      if (actor.role !== "superadmin" && actor.department !== department) {
        return send(response, 403, { message: "You can chat only inside your own department." });
      }
      await db.prepare(`
        INSERT INTO chat_messages (id, channel_id, department, author_id, author_name, body)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(randomUUID(), channelId, department, actor.id, actor.name, message);
      await touchSession(request);
      return send(response, 201, { ok: true });
    }

    const chatMessageMatch = path.match(/^\/api\/chat\/messages\/([^/]+)$/);
    if (chatMessageMatch && ["PUT", "DELETE"].includes(request.method)) {
      const message = await db.prepare("SELECT * FROM chat_messages WHERE id = ?").get(chatMessageMatch[1]);
      if (!message) return send(response, 404, { message: "Chat message not found." });
      if (message.author_id !== actor.id) return send(response, 403, { message: "You can change only your own messages." });
      if (request.method === "PUT") {
        const nextBody = String(body.body ?? "").trim().slice(0, 2000);
        if (!nextBody) throw new Error("Message cannot be empty.");
        await db.prepare("UPDATE chat_messages SET body = ? WHERE id = ?").run(nextBody, message.id);
      } else {
        await db.prepare("DELETE FROM chat_messages WHERE id = ?").run(message.id);
      }
      await touchSession(request);
      return send(response, 200, { ok: true });
    }

    return send(response, 404, { message: "Route not found." });
  } catch (error) {
    console.error(error);
    const status = error.status ?? (error.code === "23505" ? 409 : 400);
    const message = error.code === "23505" ? "This value already exists." : error.message;
    return send(response, status, { message: message || "Unexpected server error." });
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`MAB API listening on http://localhost:${port}`);
  console.log("Database: PostgreSQL");
});

async function shutdown() {
  server.close();
  await pool.end();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
