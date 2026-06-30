import type { AppUser, DepartmentName, TaskPriority, TaskStatus, TaskType, UserRole } from "@mab/shared";

export type TaskFile = {
  id: string;
  name: string;
  uploadedBy: string;
  uploadedAt: string;
  mimeType: string;
  size: number;
};

export type TaskMessage = {
  id: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
};

export type WorkerApproval = {
  id: string;
  name: string;
  approvedAt: string;
};

export type ManagedTask = {
  id: string;
  taskCode: string;
  title: string;
  department: DepartmentName;
  priority: TaskPriority;
  status: TaskStatus;
  assigneeId?: string;
  assigneeIds: string[];
  candidateName?: string;
  candidateNames: string[];
  workerApprovals: WorkerApproval[];
  pendingApprovalNames: string[];
  projectId?: string;
  projectName?: string;
  taskType: TaskType;
  dueDate: string;
  progress: number;
  reviewComment?: string;
  completedAt?: string;
  completedAtIso?: string;
  createdAt: string;
  updatedAt: string;
  files: TaskFile[];
  messages: TaskMessage[];
};

export type Project = {
  id: string;
  name: string;
  description: string;
  department: DepartmentName;
  createdAt: string;
  members: AppUser[];
  taskCount: number;
};

export type AppNotification = {
  id: string;
  kind: string;
  title: string;
  body: string;
  taskId?: string;
  isRead: boolean;
  createdAt: string;
};

export type ChatChannel = {
  id: string;
  name: string;
  department: DepartmentName;
  isGroup: boolean;
  taskId?: string;
};

export type ChatMessage = {
  id: string;
  channelId: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
};

export type TodoItem = {
  id: string;
  title: string;
  completed: boolean;
  taskId?: string;
  taskCode?: string;
  taskTitle?: string;
  createdAt: string;
  completedAt?: string;
};

export type BootstrapData = {
  currentUser: AppUser;
  departments: DepartmentName[];
  users: AppUser[];
  tasks: ManagedTask[];
  projects: Project[];
  notifications: AppNotification[];
  todos: TodoItem[];
  chatChannels: ChatChannel[];
  chatMessages: ChatMessage[];
};

const tokenKey = "mab-task-allocator.session";
const activityKey = "mab-task-allocator.last-activity";
export const inactivityLimitMs = 10 * 60 * 1000;

if (!window.sessionStorage.getItem(tokenKey)) {
  const legacyToken = window.localStorage.getItem(tokenKey);
  const legacyActivity = window.localStorage.getItem(activityKey);
  if (legacyToken) window.sessionStorage.setItem(tokenKey, legacyToken);
  if (legacyActivity) window.sessionStorage.setItem(activityKey, legacyActivity);
}
window.localStorage.removeItem(tokenKey);
window.localStorage.removeItem(activityKey);

export function hasSession() {
  return Boolean(window.sessionStorage.getItem(tokenKey));
}

function setSession(token: string | null) {
  if (token) {
    window.sessionStorage.setItem(tokenKey, token);
    markActivity();
  } else {
    window.sessionStorage.removeItem(tokenKey);
    window.sessionStorage.removeItem(activityKey);
  }
}

export function getLastActivity() {
  return Number(window.sessionStorage.getItem(activityKey) ?? 0);
}

export function markActivity() {
  const timestamp = Date.now();
  window.sessionStorage.setItem(activityKey, String(timestamp));
  return timestamp;
}

type UploadFile = { name: string; mimeType: string; data: string };

function encodeFile(file: File) {
  return new Promise<UploadFile>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.onload = () => resolve({
      name: file.name,
      mimeType: file.type || "application/octet-stream",
      data: String(reader.result).split(",")[1] ?? ""
    });
    reader.readAsDataURL(file);
  });
}

async function encodeFiles(files: File[]) {
  if (files.length > 5) throw new Error("You can upload up to 5 files at once.");
  const oversized = files.find((file) => file.size > 10 * 1024 * 1024);
  if (oversized) throw new Error(`${oversized.name} exceeds the 10 MB file limit.`);
  return Promise.all(files.map(encodeFile));
}

async function request<T>(path: string, options: RequestInit = {}) {
  const token = window.sessionStorage.getItem(tokenKey);
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers
    }
  });
  const data = (await response.json()) as T & { message?: string };

  if (!response.ok) {
    if (response.status === 401) setSession(null);
    throw new Error(data.message ?? "The server could not complete this request.");
  }
  return data;
}

async function download(path: string, fallbackName: string) {
  const token = window.sessionStorage.getItem(tokenKey);
  const response = await fetch(path, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({ message: "The download failed." }));
    if (response.status === 401) setSession(null);
    throw new Error(data.message ?? "The download failed.");
  }
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const filename = disposition.match(/filename="([^"]+)"/)?.[1] ?? fallbackName;
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const api = {
  async login(username: string, password: string) {
    const result = await request<{ token: string; user: AppUser }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password })
    });
    setSession(result.token);
    return result.user;
  },
  async logout() {
    try {
      await request("/api/auth/logout", { method: "POST" });
    } finally {
      setSession(null);
    }
  },
  async forkSession() {
    const result = await request<{ token: string }>("/api/auth/fork", { method: "POST" });
    setSession(result.token);
  },
  touchSession: () => request<{ ok: boolean }>("/api/auth/activity", { method: "POST" }),
  bootstrap: () => request<BootstrapData>("/api/bootstrap"),
  createDepartment: (name: string) =>
    request<{ department: DepartmentName }>("/api/departments", {
      method: "POST",
      body: JSON.stringify({ name })
    }),
  createTodo: (todo: { title: string; taskId?: string }) =>
    request<{ todo: TodoItem }>("/api/todos", { method: "POST", body: JSON.stringify(todo) }),
  updateTodo: (todo: TodoItem) =>
    request<{ todo: TodoItem }>(`/api/todos/${todo.id}`, { method: "PUT", body: JSON.stringify(todo) }),
  deleteTodo: (todoId: string) => request(`/api/todos/${todoId}`, { method: "DELETE" }),
  loadChat: () => request<{ chatChannels: ChatChannel[]; chatMessages: ChatMessage[] }>("/api/chat"),
  createUser: (user: { name: string; username: string; password: string; role: UserRole; department: DepartmentName }) =>
    request("/api/users", { method: "POST", body: JSON.stringify(user) }),
  updateUser: (user: AppUser & { password?: string }) =>
    request(`/api/users/${user.id}`, { method: "PUT", body: JSON.stringify(user) }),
  deleteUser: (userId: string) => request(`/api/users/${userId}`, { method: "DELETE" }),
  async createTask(
    task: Omit<ManagedTask, "id" | "taskCode" | "files" | "messages" | "status" | "createdAt" | "updatedAt" | "completedAtIso" | "workerApprovals" | "pendingApprovalNames">,
    files: File[] = []
  ) {
    return request("/api/tasks", {
      method: "POST",
      body: JSON.stringify({ ...task, files: await encodeFiles(files) })
    });
  },
  updateTask: (task: ManagedTask) =>
    request(`/api/tasks/${task.id}`, { method: "PUT", body: JSON.stringify(task) }),
  deleteTask: (taskId: string) => request(`/api/tasks/${taskId}`, { method: "DELETE" }),
  taskAction: (taskId: string, action: "claim" | "submit" | "approve", body = {}) =>
    request(`/api/tasks/${taskId}/${action}`, { method: "POST", body: JSON.stringify(body) }),
  reopenTask: (taskId: string, comment: string) =>
    request(`/api/tasks/${taskId}/reopen`, { method: "POST", body: JSON.stringify({ comment }) }),
  addMessage: (taskId: string, body: string) =>
    request(`/api/tasks/${taskId}/messages`, { method: "POST", body: JSON.stringify({ body }) }),
  async addFiles(taskId: string, files: File[]) {
    return request(`/api/tasks/${taskId}/files`, {
      method: "POST",
      body: JSON.stringify({ files: await encodeFiles(files) })
    });
  },
  downloadFile: (file: TaskFile) => download(`/api/files/${file.id}/download`, file.name),
  downloadProductivityReport: (userId: string) =>
    download(`/api/reports/productivity/${userId}`, "productivity-report.xlsx"),
  downloadMonthlyProductivityReport: (userId: string, month: string) =>
    download(`/api/reports/productivity/${userId}?month=${encodeURIComponent(month)}`, `productivity-${month}.xlsx`),
  createProject: (project: { name: string; description: string; department: DepartmentName; memberIds: string[] }) =>
    request("/api/projects", { method: "POST", body: JSON.stringify(project) }),
  updateProject: (projectId: string, project: { name: string; description: string; memberIds: string[] }) =>
    request(`/api/projects/${projectId}`, { method: "PUT", body: JSON.stringify(project) }),
  deleteProject: (projectId: string) => request(`/api/projects/${projectId}`, { method: "DELETE" }),
  downloadProjectTaskTemplate: (projectId: string, projectName: string) =>
    download(`/api/projects/${projectId}/task-sheet-template`, `${projectName}-task-sheet.xlsx`),
  async importProjectTasks(projectId: string, file: File) {
    return request<{ imported: number }>(`/api/projects/${projectId}/import`, {
      method: "POST",
      body: JSON.stringify({ file: await encodeFile(file) })
    });
  },
  createChatGroup: (name: string, department: DepartmentName) =>
    request<{ channel: ChatChannel }>("/api/chat/groups", {
      method: "POST",
      body: JSON.stringify({ name, department })
    }),
  updateChatGroup: (channelId: string, name: string) =>
    request<{ channel: ChatChannel }>(`/api/chat/groups/${channelId.replace(/^group:/, "")}`, {
      method: "PUT",
      body: JSON.stringify({ name })
    }),
  deleteChatGroup: (channelId: string) =>
    request(`/api/chat/groups/${channelId.replace(/^group:/, "")}`, { method: "DELETE" }),
  sendChatMessage: (channelId: string, body: string) =>
    request("/api/chat/messages", { method: "POST", body: JSON.stringify({ channelId, body }) }),
  markNotificationsRead: () => request("/api/notifications/read", { method: "POST" })
};
