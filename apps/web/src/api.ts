import type { AppUser, DepartmentName, TaskPriority, TaskStatus, UserRole } from "@mab/shared";

export type TaskFile = {
  id: string;
  name: string;
  uploadedBy: string;
  uploadedAt: string;
};

export type TaskMessage = {
  id: string;
  authorName: string;
  body: string;
  createdAt: string;
};

export type ManagedTask = {
  id: string;
  title: string;
  department: DepartmentName;
  priority: TaskPriority;
  status: TaskStatus;
  assigneeId?: string;
  candidateName?: string;
  dueDate: string;
  progress: number;
  reviewComment?: string;
  completedAt?: string;
  files: TaskFile[];
  messages: TaskMessage[];
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

export type BootstrapData = {
  currentUser: AppUser;
  users: AppUser[];
  tasks: ManagedTask[];
  notifications: AppNotification[];
};

const tokenKey = "mab-task-allocator.session";

export function hasSession() {
  return Boolean(window.localStorage.getItem(tokenKey));
}

function setSession(token: string | null) {
  if (token) window.localStorage.setItem(tokenKey, token);
  else window.localStorage.removeItem(tokenKey);
}

async function request<T>(path: string, options: RequestInit = {}) {
  const token = window.localStorage.getItem(tokenKey);
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
  bootstrap: () => request<BootstrapData>("/api/bootstrap"),
  createUser: (user: { name: string; username: string; password: string; role: UserRole; department: DepartmentName }) =>
    request("/api/users", { method: "POST", body: JSON.stringify(user) }),
  updateUser: (user: AppUser & { password?: string }) =>
    request(`/api/users/${user.id}`, { method: "PUT", body: JSON.stringify(user) }),
  deleteUser: (userId: string) => request(`/api/users/${userId}`, { method: "DELETE" }),
  createTask: (task: Omit<ManagedTask, "id" | "files" | "messages" | "status">) =>
    request("/api/tasks", { method: "POST", body: JSON.stringify(task) }),
  updateTask: (task: ManagedTask) =>
    request(`/api/tasks/${task.id}`, { method: "PUT", body: JSON.stringify(task) }),
  deleteTask: (taskId: string) => request(`/api/tasks/${taskId}`, { method: "DELETE" }),
  taskAction: (taskId: string, action: "claim" | "submit" | "approve", body = {}) =>
    request(`/api/tasks/${taskId}/${action}`, { method: "POST", body: JSON.stringify(body) }),
  reopenTask: (taskId: string, comment: string) =>
    request(`/api/tasks/${taskId}/reopen`, { method: "POST", body: JSON.stringify({ comment }) }),
  addMessage: (taskId: string, body: string) =>
    request(`/api/tasks/${taskId}/messages`, { method: "POST", body: JSON.stringify({ body }) }),
  addFiles: (taskId: string, names: string[]) =>
    request(`/api/tasks/${taskId}/files`, { method: "POST", body: JSON.stringify({ names }) }),
  markNotificationsRead: () => request("/api/notifications/read", { method: "POST" })
};
