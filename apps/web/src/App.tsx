import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Edit3,
  Gauge,
  Hand,
  KeyRound,
  Lock,
  LogOut,
  MessageSquare,
  Paperclip,
  Plus,
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
  X
} from "lucide-react";
import type { AppUser, DepartmentName, TaskPriority, TaskStatus, UserRole } from "@mab/shared";
import { StatCard } from "./components/StatCard";

const mabLogo = "/mab-logo.jpeg";

type ManagedTask = {
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
  files: TaskFile[];
  messages: TaskMessage[];
};

type TaskFile = {
  id: string;
  name: string;
  uploadedBy: string;
  uploadedAt: string;
};

type TaskMessage = {
  id: string;
  authorName: string;
  body: string;
  createdAt: string;
};

const departments: DepartmentName[] = [
  "Mechanical Technical office engineer",
  "Electrical Technical office engineer"
];

const seededUsers: AppUser[] = [
  {
    id: "user-superadmin",
    name: "J. Chehade",
    username: "j.chehade@mabunited.com",
    password: "jadjadjad1",
    role: "superadmin",
    department: "Executive"
  }
];

const seededTasks: ManagedTask[] = [];

const storageKeys = {
  currentUsername: "mab-task-allocator.currentUsername",
  tasks: "mab-task-allocator.tasks",
  users: "mab-task-allocator.users"
};

const priorityLabels: Record<TaskPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent"
};

const statusLabels: Record<TaskStatus, string> = {
  new: "New",
  assigned: "Assigned",
  in_progress: "In Progress",
  blocked: "Blocked",
  under_review: "Under Review",
  done: "Done"
};

const roleLabels: Record<UserRole, string> = {
  superadmin: "Super Admin",
  admin: "Admin",
  user: "Normal User"
};

function clampProgress(progress: number) {
  return Math.min(100, Math.max(0, progress));
}

function getPriorityRank(priority: TaskPriority) {
  const ranks: Record<TaskPriority, number> = {
    urgent: 0,
    high: 1,
    medium: 2,
    low: 3
  };

  return ranks[priority];
}

function sortTasksByPriority(tasksToSort: ManagedTask[]) {
  return [...tasksToSort].sort((firstTask, secondTask) => {
    const priorityDifference =
      getPriorityRank(firstTask.priority) - getPriorityRank(secondTask.priority);

    if (priorityDifference !== 0) return priorityDifference;
    return firstTask.dueDate.localeCompare(secondTask.dueDate);
  });
}

function getTimestamp() {
  return new Date().toLocaleString([], {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short"
  });
}

function readStoredValue<T>(key: string, fallback: T) {
  try {
    const storedValue = window.localStorage.getItem(key);
    return storedValue ? (JSON.parse(storedValue) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeStoredValue<T>(key: string, value: T) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

interface LoginPageProps {
  error: string;
  onLogin: (username: string, password: string) => void;
}

function LoginPage({ error, onLogin }: LoginPageProps) {
  const [username, setUsername] = useState("j.chehade@mabunited.com");
  const [password, setPassword] = useState("jadjadjad1");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onLogin(username, password);
  }

  return (
    <main className="login-shell">
      <section className="login-hero" aria-label="MAB Task Allocator login">
        <div className="cosmic-panel">
          <div className="orbital-logo">
            <span />
            <img src={mabLogo} alt="MAB logo" />
          </div>
          <p className="eyebrow">MAB United Operations</p>
          <h1>Command your technical office workload from one intelligent control room.</h1>
          <p className="hero-copy">
            Super admins manage every department. Admins create users and allocate tasks inside their own team.
          </p>
          <div className="hero-metrics" aria-label="Platform highlights">
            <span><strong>2</strong> Departments</span>
            <span><strong>3</strong> Roles</span>
            <span><strong>Live</strong> Progress</span>
          </div>
        </div>

        <form className="login-card" onSubmit={handleSubmit}>
          <div className="login-card-header">
            <img src={mabLogo} alt="MAB logo" />
            <div>
              <p>Secure access</p>
              <h2>Welcome back</h2>
            </div>
          </div>

          <label>
            Username
            <span>
              <KeyRound aria-hidden="true" size={18} />
              <input
                autoComplete="username"
                onChange={(event) => setUsername(event.target.value)}
                placeholder="name@mabunited.com"
                type="email"
                value={username}
              />
            </span>
          </label>

          <label>
            Password
            <span>
              <Lock aria-hidden="true" size={18} />
              <input
                autoComplete="current-password"
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter password"
                type="password"
                value={password}
              />
            </span>
          </label>

          {error ? <p className="form-error">{error}</p> : null}

          <button type="submit" className="login-button">
            <ShieldCheck aria-hidden="true" size={19} />
            Login to Dashboard
          </button>

          <div className="credential-note">
            <strong>Superadmin</strong>
            <span>j.chehade@mabunited.com / jadjadjad1</span>
          </div>
        </form>
      </section>
    </main>
  );
}

export function App() {
  const [users, setUsers] = useState<AppUser[]>(seededUsers);
  const [tasks, setTasks] = useState<ManagedTask[]>(seededTasks);
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [loginError, setLoginError] = useState("");
  const [peopleMessage, setPeopleMessage] = useState("");
  const [allocationMessage, setAllocationMessage] = useState("");
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<AppUser | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [taskEditDraft, setTaskEditDraft] = useState<ManagedTask | null>(null);
  const [messageDrafts, setMessageDrafts] = useState<Record<string, string>>({});
  const [reviewDrafts, setReviewDrafts] = useState<Record<string, string>>({});
  const [taskDraft, setTaskDraft] = useState({
    title: "Prepare client visit checklist",
    assigneeId: "user-ali",
    department: "Mechanical Technical office engineer" as DepartmentName,
    priority: "high" as TaskPriority,
    dueDate: "2026-07-05",
    progress: 0
  });

  const canManagePeople = currentUser?.role === "superadmin" || currentUser?.role === "admin";
  const canAllocateTasks = currentUser?.role === "superadmin" || currentUser?.role === "admin";

  const visibleUsers = useMemo(() => {
    if (!currentUser) return [];
    if (currentUser.role === "superadmin") return users;
    if (currentUser.role === "admin") {
      return users.filter((user) => user.department === currentUser.department && user.role !== "superadmin");
    }
    return users.filter((user) => user.id === currentUser.id);
  }, [currentUser, users]);

  const assignableUsers = useMemo(() => {
    if (!currentUser) return [];
    if (currentUser.role === "superadmin") return users.filter((user) => user.role === "user");
    if (currentUser.role === "admin") {
      return users.filter((user) => user.role === "user" && user.department === currentUser.department);
    }
    return [];
  }, [currentUser, users]);

  const visibleTasks = useMemo(() => {
    if (!currentUser) return [];
    const matchingTasks =
      currentUser.role === "superadmin"
        ? tasks
        : tasks.filter((task) => task.department === currentUser.department);

    return sortTasksByPriority(matchingTasks);
  }, [currentUser, tasks]);

  const myTasks = useMemo(() => {
    if (!currentUser || currentUser.role !== "user") return [];
    return sortTasksByPriority(tasks.filter((task) => task.assigneeId === currentUser.id));
  }, [currentUser, tasks]);

  useEffect(() => {
    if (!currentUser || !canAllocateTasks) return;
    if (!taskDraft.assigneeId) return;
    if (assignableUsers.some((user) => user.id === taskDraft.assigneeId)) return;

    setTaskDraft((draft) => ({
      ...draft,
      assigneeId: assignableUsers[0]?.id ?? "",
      department:
        currentUser.role === "admin"
          ? currentUser.department
          : assignableUsers[0]?.department ?? draft.department
    }));
  }, [assignableUsers, canAllocateTasks, currentUser, taskDraft.assigneeId]);

  const openTasks = visibleTasks.filter((task) => task.status !== "done").length;
  const urgentTasks = visibleTasks.filter((task) => task.priority === "urgent").length;
  const averageProgress = visibleTasks.length
    ? Math.round(visibleTasks.reduce((sum, task) => sum + task.progress, 0) / visibleTasks.length)
    : 0;

  function handleLogin(username: string, password: string) {
    const foundUser = users.find(
      (user) =>
        user.username.toLowerCase() === username.trim().toLowerCase() &&
        user.password === password
    );

    if (!foundUser) {
      setLoginError("Username or password is incorrect.");
      return;
    }

    setLoginError("");
    setCurrentUser(foundUser);
  }

  function getFormDepartment(formData: FormData): DepartmentName {
    if (currentUser?.role === "admin") return currentUser.department;
    return String(formData.get("department") ?? departments[0]) as DepartmentName;
  }

  function getFormRole(formData: FormData): UserRole {
    if (currentUser?.role === "admin") return "user";
    return String(formData.get("role") ?? "user") as UserRole;
  }

  function handleCreatePerson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentUser || !canManagePeople) return;

    const formData = new FormData(event.currentTarget);
    const name = String(formData.get("name") ?? "").trim();
    const username = String(formData.get("username") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    const role = getFormRole(formData);
    const department = getFormDepartment(formData);

    if (!name || !username || !password) {
      setPeopleMessage("Please fill name, username, and password.");
      return;
    }

    if (users.some((user) => user.username.toLowerCase() === username.toLowerCase())) {
      setPeopleMessage("This username already exists.");
      return;
    }

    setUsers((existingUsers) => [
      ...existingUsers,
      {
        id: `user-${Date.now()}`,
        name,
        username,
        password,
        role,
        department
      }
    ]);
    event.currentTarget.reset();
    setPeopleMessage(`${name} was created as ${roleLabels[role]} in ${department}.`);
  }

  function startEditUser(user: AppUser) {
    setEditingUserId(user.id);
    setEditDraft({ ...user });
  }

  function saveEditUser() {
    if (!currentUser || !editDraft) return;

    if (currentUser.role === "admin") {
      editDraft.department = currentUser.department;
      editDraft.role = "user";
    }

    setUsers((existingUsers) =>
      existingUsers.map((user) => (user.id === editDraft.id ? editDraft : user))
    );
    setCurrentUser((activeUser) => (activeUser?.id === editDraft.id ? editDraft : activeUser));
    setEditingUserId(null);
    setEditDraft(null);
    setPeopleMessage(`${editDraft.name} was updated.`);
  }

  function deleteUser(userId: string) {
    const user = users.find((person) => person.id === userId);
    if (!user || user.id === currentUser?.id || user.role === "superadmin") return;

    setUsers((existingUsers) => existingUsers.filter((person) => person.id !== userId));
    setTasks((existingTasks) =>
      existingTasks.map((task) =>
        task.assigneeId === userId
          ? { ...task, assigneeId: undefined, candidateName: "Unassigned", status: "new", progress: 0 }
          : task
      )
    );
    setPeopleMessage(`${user.name} was deleted.`);
  }

  function canManageTask(task: ManagedTask) {
    if (!currentUser) return false;
    if (currentUser.role === "superadmin") return true;
    return currentUser.role === "admin" && task.department === currentUser.department;
  }

  function handleAllocateTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentUser || !canAllocateTasks) return;

    const title = taskDraft.title.trim();
    const assignee = taskDraft.assigneeId
      ? users.find((user) => user.id === taskDraft.assigneeId && user.role === "user")
      : undefined;
    const department = assignee?.department ?? (
      currentUser.role === "admin" ? currentUser.department : taskDraft.department
    );

    if (!title) {
      setAllocationMessage("Please enter a task title.");
      return;
    }

    if (taskDraft.assigneeId && !assignee) {
      setAllocationMessage("Choose a valid normal user or leave the task free.");
      return;
    }

    if (currentUser.role === "admin" && department !== currentUser.department) {
      setAllocationMessage("Admins can allocate tasks only inside their own department.");
      return;
    }

    const newTask: ManagedTask = {
      id: `task-${Date.now()}`,
      title,
      department,
      priority: taskDraft.priority,
      status: assignee ? (taskDraft.progress > 0 ? "in_progress" : "assigned") : "new",
      assigneeId: assignee?.id,
      candidateName: assignee?.name ?? "Unassigned",
      dueDate: taskDraft.dueDate,
      progress: assignee ? clampProgress(taskDraft.progress) : 0,
      files: [],
      messages: []
    };

    setTasks((existingTasks) => [newTask, ...existingTasks]);
    setAllocationMessage(
      assignee
        ? `${currentUser.name} allocated "${title}" to ${assignee.name}.`
        : `${currentUser.name} added "${title}" as a free ${department} task.`
    );
  }

  function startEditTask(task: ManagedTask) {
    if (!canManageTask(task)) return;
    setEditingTaskId(task.id);
    setTaskEditDraft({ ...task });
  }

  function saveEditTask() {
    if (!currentUser || !taskEditDraft || !canManageTask(taskEditDraft)) return;

    const title = taskEditDraft.title.trim();
    if (!title) {
      setAllocationMessage("Please enter a task title before saving.");
      return;
    }

    const assignee = taskEditDraft.assigneeId
      ? users.find((user) => user.id === taskEditDraft.assigneeId && user.role === "user")
      : undefined;

    if (taskEditDraft.assigneeId && !assignee) {
      setAllocationMessage("Choose a valid normal user.");
      return;
    }

    if (currentUser.role === "admin" && taskEditDraft.department !== currentUser.department) {
      setAllocationMessage("Admins can edit tasks only inside their own department.");
      return;
    }

    if (currentUser.role === "admin" && assignee?.department !== currentUser.department) {
      setAllocationMessage("Admins can assign tasks only to normal users in their own department.");
      return;
    }

    const department = assignee?.department ?? taskEditDraft.department;
    const candidateName = assignee?.name ?? "Unassigned";
    const progress = clampProgress(taskEditDraft.progress);

    const updatedTask: ManagedTask = {
      ...taskEditDraft,
      title,
      department,
      assigneeId: assignee?.id,
      candidateName,
      progress
    };

    setTasks((existingTasks) =>
      existingTasks.map((task) => (task.id === updatedTask.id ? updatedTask : task))
    );
    setEditingTaskId(null);
    setTaskEditDraft(null);
    setAllocationMessage(`"${title}" was updated.`);
  }

  function deleteTask(task: ManagedTask) {
    if (!canManageTask(task)) return;

    setTasks((existingTasks) => existingTasks.filter((existingTask) => existingTask.id !== task.id));
    setEditingTaskId((activeTaskId) => (activeTaskId === task.id ? null : activeTaskId));
    setTaskEditDraft((draft) => (draft?.id === task.id ? null : draft));
    setAllocationMessage(`"${task.title}" was deleted.`);
  }

  function claimTask(task: ManagedTask) {
    if (!currentUser || currentUser.role !== "user") return;
    if (task.department !== currentUser.department || task.assigneeId) return;

    setTasks((existingTasks) =>
      existingTasks.map((existingTask) =>
        existingTask.id === task.id
          ? {
              ...existingTask,
              assigneeId: currentUser.id,
              candidateName: currentUser.name,
              status: "assigned",
              messages: [
                ...existingTask.messages,
                {
                  id: `msg-${Date.now()}`,
                  authorName: currentUser.name,
                  body: "I took this free task.",
                  createdAt: getTimestamp()
                }
              ]
            }
          : existingTask
      )
    );
    setAllocationMessage(`${currentUser.name} took "${task.title}".`);
  }

  function submitTaskForReview(task: ManagedTask) {
    if (!currentUser || currentUser.role !== "user" || task.assigneeId !== currentUser.id) return;
    if (task.status === "done" || task.status === "under_review") return;

    setTasks((existingTasks) =>
      existingTasks.map((existingTask) =>
        existingTask.id === task.id
          ? {
              ...existingTask,
              status: "under_review",
              progress: 100,
              messages: [
                ...existingTask.messages,
                {
                  id: `msg-${Date.now()}`,
                  authorName: currentUser.name,
                  body: "Task finished and submitted for review.",
                  createdAt: getTimestamp()
                }
              ]
            }
          : existingTask
      )
    );
    setAllocationMessage(`"${task.title}" is under review.`);
  }

  function approveTask(task: ManagedTask) {
    if (!currentUser || !canManageTask(task) || task.status !== "under_review") return;

    setTasks((existingTasks) =>
      existingTasks.map((existingTask) =>
        existingTask.id === task.id
          ? {
              ...existingTask,
              status: "done",
              progress: 100,
              reviewComment: "Approved.",
              messages: [
                ...existingTask.messages,
                {
                  id: `msg-${Date.now()}`,
                  authorName: currentUser.name,
                  body: "Approved. Task is complete.",
                  createdAt: getTimestamp()
                }
              ]
            }
          : existingTask
      )
    );
    setAllocationMessage(`"${task.title}" was approved.`);
  }

  function reopenTask(task: ManagedTask) {
    if (!currentUser || !canManageTask(task) || task.status !== "under_review") return;

    const comment = reviewDrafts[task.id]?.trim();
    if (!comment) {
      setAllocationMessage("Add a review comment before reopening the task.");
      return;
    }

    setTasks((existingTasks) =>
      existingTasks.map((existingTask) =>
        existingTask.id === task.id
          ? {
              ...existingTask,
              status: "in_progress",
              progress: Math.min(existingTask.progress, 90),
              reviewComment: comment,
              messages: [
                ...existingTask.messages,
                {
                  id: `msg-${Date.now()}`,
                  authorName: currentUser.name,
                  body: `Reopened: ${comment}`,
                  createdAt: getTimestamp()
                }
              ]
            }
          : existingTask
      )
    );
    setReviewDrafts((drafts) => ({ ...drafts, [task.id]: "" }));
    setAllocationMessage(`"${task.title}" was reopened with comments.`);
  }

  function addTaskMessage(task: ManagedTask) {
    if (!currentUser) return;

    const body = messageDrafts[task.id]?.trim();
    if (!body) return;

    setTasks((existingTasks) =>
      existingTasks.map((existingTask) =>
        existingTask.id === task.id
          ? {
              ...existingTask,
              messages: [
                ...existingTask.messages,
                {
                  id: `msg-${Date.now()}`,
                  authorName: currentUser.name,
                  body,
                  createdAt: getTimestamp()
                }
              ]
            }
          : existingTask
      )
    );
    setMessageDrafts((drafts) => ({ ...drafts, [task.id]: "" }));
  }

  function addTaskFiles(task: ManagedTask, fileList: FileList | null) {
    if (!currentUser || !fileList?.length) return;

    const uploadedAt = getTimestamp();
    const newFiles = Array.from(fileList).map((file, index) => ({
      id: `file-${Date.now()}-${index}`,
      name: file.name,
      uploadedBy: currentUser.name,
      uploadedAt
    }));

    setTasks((existingTasks) =>
      existingTasks.map((existingTask) =>
        existingTask.id === task.id
          ? {
              ...existingTask,
              files: [...existingTask.files, ...newFiles]
            }
          : existingTask
      )
    );
    setAllocationMessage(`${newFiles.length} file(s) added to "${task.title}".`);
  }

  function renderTaskCard(task: ManagedTask, view: "department" | "mine" = "department") {
    const isEditingTask = editingTaskId === task.id && taskEditDraft;
    const canEditTask = canManageTask(task);
    const canClaimTask =
      currentUser?.role === "user" &&
      task.department === currentUser.department &&
      !task.assigneeId &&
      task.status === "new";
    const canSubmitForReview =
      currentUser?.role === "user" &&
      task.assigneeId === currentUser.id &&
      task.status !== "done" &&
      task.status !== "under_review";
    const canReviewTask = canEditTask && task.status === "under_review";
    const taskAssignableUsers =
      currentUser?.role === "admin"
        ? assignableUsers
        : users.filter(
            (user) =>
              user.role === "user" &&
              user.department === (taskEditDraft?.department ?? task.department)
          );

    return (
      <article className="task-card" key={`${view}-${task.id}`}>
        <div className="task-row task-row-progress">
          {isEditingTask ? (
            <div className="edit-task-grid">
              <input
                onChange={(event) =>
                  setTaskEditDraft({ ...taskEditDraft, title: event.target.value })
                }
                value={taskEditDraft.title}
              />
              {currentUser?.role === "superadmin" ? (
                <select
                  onChange={(event) => {
                    const department = event.target.value as DepartmentName;
                    const firstUser = users.find(
                      (user) => user.role === "user" && user.department === department
                    );

                    setTaskEditDraft({
                      ...taskEditDraft,
                      department,
                      assigneeId: firstUser?.id,
                      candidateName: firstUser?.name ?? "Unassigned"
                    });
                  }}
                  value={taskEditDraft.department}
                >
                  {departments.map((department) => (
                    <option key={department} value={department}>{department}</option>
                  ))}
                </select>
              ) : null}
              <select
                onChange={(event) => {
                  const assigneeId = event.target.value || undefined;
                  const assignee = users.find((user) => user.id === assigneeId);

                  setTaskEditDraft({
                    ...taskEditDraft,
                    assigneeId,
                    candidateName: assignee?.name ?? "Unassigned",
                    department: assignee?.department ?? taskEditDraft.department
                  });
                }}
                value={taskEditDraft.assigneeId ?? ""}
              >
                <option value="">Free task - no assignee</option>
                {taskAssignableUsers.map((user) => (
                  <option key={user.id} value={user.id}>{user.name}</option>
                ))}
              </select>
              <select
                onChange={(event) =>
                  setTaskEditDraft({
                    ...taskEditDraft,
                    priority: event.target.value as TaskPriority
                  })
                }
                value={taskEditDraft.priority}
              >
                <option value="low">Low priority</option>
                <option value="medium">Medium priority</option>
                <option value="high">High priority</option>
                <option value="urgent">Urgent priority</option>
              </select>
              <select
                onChange={(event) =>
                  setTaskEditDraft({
                    ...taskEditDraft,
                    status: event.target.value as TaskStatus
                  })
                }
                value={taskEditDraft.status}
              >
                <option value="new">New</option>
                <option value="assigned">Assigned</option>
                <option value="in_progress">In Progress</option>
                <option value="blocked">Blocked</option>
                <option value="under_review">Under Review</option>
                <option value="done">Done</option>
              </select>
              <input
                onChange={(event) =>
                  setTaskEditDraft({ ...taskEditDraft, dueDate: event.target.value })
                }
                type="date"
                value={taskEditDraft.dueDate}
              />
              <input
                max="100"
                min="0"
                onChange={(event) =>
                  setTaskEditDraft({
                    ...taskEditDraft,
                    progress: clampProgress(Number(event.target.value))
                  })
                }
                type="number"
                value={taskEditDraft.progress}
              />
            </div>
          ) : (
            <>
              <div>
                <strong>{task.title}</strong>
                <p>{task.department} - Due {task.dueDate}</p>
                {task.reviewComment ? <p className="review-note">Review: {task.reviewComment}</p> : null}
                <div className="task-progress">
                  <span style={{ width: `${task.progress}%` }} />
                </div>
              </div>
              <div className="task-meta">
                <span className={`priority priority-${task.priority}`}>
                  {priorityLabels[task.priority]}
                </span>
                <span>{statusLabels[task.status]}</span>
                <span>Candidate: {task.candidateName ?? "Unassigned"}</span>
                <span>{task.progress}%</span>
              </div>
            </>
          )}

          {canEditTask || canClaimTask || canSubmitForReview ? (
            <div className="row-actions task-actions">
              {isEditingTask ? (
                <>
                  <button type="button" className="icon-button" onClick={saveEditTask} aria-label="Save task">
                    <Save aria-hidden="true" size={16} />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => {
                      setEditingTaskId(null);
                      setTaskEditDraft(null);
                    }}
                    aria-label="Cancel task edit"
                  >
                    <X aria-hidden="true" size={16} />
                  </button>
                </>
              ) : (
                <>
                  {canClaimTask ? (
                    <button type="button" className="task-action-button" onClick={() => claimTask(task)}>
                      <Hand aria-hidden="true" size={16} />
                      Take
                    </button>
                  ) : null}
                  {canSubmitForReview ? (
                    <button type="button" className="task-action-button" onClick={() => submitTaskForReview(task)}>
                      <CheckCircle2 aria-hidden="true" size={16} />
                      Finished
                    </button>
                  ) : null}
                  {canEditTask ? (
                    <button type="button" className="icon-button" onClick={() => startEditTask(task)} aria-label="Edit task">
                      <Edit3 aria-hidden="true" size={16} />
                    </button>
                  ) : null}
                  {currentUser?.role === "superadmin" ? (
                    <button type="button" className="icon-button danger" onClick={() => deleteTask(task)} aria-label="Delete task">
                      <Trash2 aria-hidden="true" size={16} />
                    </button>
                  ) : null}
                </>
              )}
            </div>
          ) : null}
        </div>

        {task.status === "under_review" && task.assigneeId === currentUser?.id ? (
          <p className="review-note">Submitted and waiting for admin review.</p>
        ) : null}

        {canReviewTask ? (
          <div className="review-box">
            <input
              onChange={(event) =>
                setReviewDrafts((drafts) => ({ ...drafts, [task.id]: event.target.value }))
              }
              placeholder="Add comments if this needs changes"
              value={reviewDrafts[task.id] ?? ""}
            />
            <button type="button" className="task-action-button" onClick={() => approveTask(task)}>
              <CheckCircle2 aria-hidden="true" size={16} />
              Approve
            </button>
            <button type="button" className="task-action-button secondary" onClick={() => reopenTask(task)}>
              <RotateCcw aria-hidden="true" size={16} />
              Reopen
            </button>
          </div>
        ) : null}

        <div className="task-collab">
          <div className="task-thread">
            <div className="collab-heading">
              <MessageSquare aria-hidden="true" size={16} />
              <strong>Clarifications</strong>
            </div>
            {task.messages.length ? (
              task.messages.slice(-3).map((message) => (
                <p key={message.id}>
                  <strong>{message.authorName}</strong> {message.body}
                  <span>{message.createdAt}</span>
                </p>
              ))
            ) : (
              <p>No clarifications yet.</p>
            )}
            <div className="chat-form">
              <input
                onChange={(event) =>
                  setMessageDrafts((drafts) => ({ ...drafts, [task.id]: event.target.value }))
                }
                placeholder="Ask or reply"
                value={messageDrafts[task.id] ?? ""}
              />
              <button type="button" className="icon-button" onClick={() => addTaskMessage(task)} aria-label="Send clarification">
                <Plus aria-hidden="true" size={16} />
              </button>
            </div>
          </div>

          <div className="task-files">
            <div className="collab-heading">
              <Paperclip aria-hidden="true" size={16} />
              <strong>Files</strong>
            </div>
            {task.files.length ? (
              task.files.slice(-3).map((file) => (
                <p key={file.id}>
                  {file.name}
                  <span>{file.uploadedBy} - {file.uploadedAt}</span>
                </p>
              ))
            ) : (
              <p>No files added.</p>
            )}
            <label className="file-upload">
              <Paperclip aria-hidden="true" size={16} />
              Add Files
              <input
                multiple
                onChange={(event) => {
                  addTaskFiles(task, event.target.files);
                  event.target.value = "";
                }}
                type="file"
              />
            </label>
          </div>
        </div>
      </article>
    );
  }

  if (!currentUser) {
    return <LoginPage error={loginError} onLogin={handleLogin} />;
  }

  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="Main navigation">
        <div className="brand">
          <img src={mabLogo} alt="MAB logo" />
          <div>
            <strong>Task Allocator</strong>
            <span>{roleLabels[currentUser.role]}</span>
          </div>
        </div>
        <nav>
          <a href="#dashboard" className="active">Dashboard</a>
          <a href="#people">People</a>
          <a href="#tasks">Tasks</a>
          <a href="#team">Team</a>
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="topbar-title">
            <img src={mabLogo} alt="" aria-hidden="true" />
            <div>
              <p>{currentUser.department}</p>
              <h1>{roleLabels[currentUser.role]} Dashboard</h1>
            </div>
          </div>
          <button type="button" className="ghost-button" onClick={() => setCurrentUser(null)}>
            <LogOut aria-hidden="true" size={18} />
            Logout
          </button>
        </header>

        <section className="brand-strip" id="dashboard">
          <div>
            <img src={mabLogo} alt="MAB logo" />
            <div>
              <p>MAB command center</p>
              <strong>
                {currentUser.role === "superadmin"
                  ? "Manage every department, user, and task from one superadmin control page."
                  : currentUser.role === "admin"
                    ? "Create normal users, edit your team, and allocate tasks inside your department."
                    : "Track the tasks assigned within your technical office department."}
              </strong>
            </div>
          </div>
          <div className="search-pill">
            <Sparkles aria-hidden="true" size={18} />
            <span>{currentUser.name}</span>
          </div>
        </section>

        <section className="stats-grid" aria-label="Task allocation metrics">
          <StatCard label="Open Tasks" value={String(openTasks)} icon={ClipboardList} tone="blue" />
          <StatCard label="Urgent Tasks" value={String(urgentTasks)} icon={AlertTriangle} tone="red" />
          <StatCard label="Visible People" value={String(visibleUsers.length)} icon={Users} tone="green" />
          <StatCard label="Avg Progress" value={`${averageProgress}%`} icon={Gauge} tone="amber" />
        </section>

        {canManagePeople || canAllocateTasks ? (
          <section className="admin-grid" id="people">
            {canManagePeople ? (
              <section className="panel command-panel">
                <div className="panel-header">
                  <div>
                    <p>{currentUser.role === "superadmin" ? "Superadmin people control" : "Department people control"}</p>
                    <h2>Create User</h2>
                  </div>
                  <UserPlus aria-hidden="true" />
                </div>
                <form className="person-form" onSubmit={handleCreatePerson}>
                  <input name="name" placeholder="Full name" />
                  <input name="username" placeholder="username@mabunited.com" type="email" />
                  <input name="password" placeholder="Temporary password" type="password" />
                  {currentUser.role === "superadmin" ? (
                    <>
                      <select name="department" defaultValue={departments[0]}>
                        {departments.map((department) => (
                          <option key={department} value={department}>{department}</option>
                        ))}
                      </select>
                      <select name="role" defaultValue="user">
                        <option value="user">Normal User</option>
                        <option value="admin">Admin</option>
                        <option value="superadmin">Super Admin</option>
                      </select>
                    </>
                  ) : (
                    <input value={`${currentUser.department} - Normal User`} readOnly />
                  )}
                  <button type="submit" className="primary-button">
                    <Plus aria-hidden="true" size={18} />
                    Create User
                  </button>
                </form>
                {peopleMessage ? <p className="success-message">{peopleMessage}</p> : null}
              </section>
            ) : null}

            {canAllocateTasks ? (
              <section className="panel command-panel">
                <div className="panel-header">
                  <div>
                    <p>Department allocation</p>
                    <h2>Assign Task</h2>
                  </div>
                  <ClipboardList aria-hidden="true" />
                </div>
                <form className="person-form" onSubmit={handleAllocateTask}>
                  <input
                    onChange={(event) => setTaskDraft((draft) => ({ ...draft, title: event.target.value }))}
                    placeholder="Task title"
                    value={taskDraft.title}
                  />
                  <select
                    onChange={(event) => {
                      const assigneeId = event.target.value;
                      const assignee = users.find((user) => user.id === assigneeId);

                      setTaskDraft((draft) => ({
                        ...draft,
                        assigneeId,
                        department: assignee?.department ?? draft.department
                      }));
                    }}
                    value={taskDraft.assigneeId}
                  >
                    <option value="">Free task - no assignee</option>
                    {assignableUsers.map((user) => (
                      <option key={user.id} value={user.id}>{user.name} - {user.department}</option>
                    ))}
                  </select>
                  {currentUser.role === "superadmin" && !taskDraft.assigneeId ? (
                    <select
                      onChange={(event) =>
                        setTaskDraft((draft) => ({
                          ...draft,
                          department: event.target.value as DepartmentName
                        }))
                      }
                      value={taskDraft.department}
                    >
                      {departments.map((department) => (
                        <option key={department} value={department}>{department}</option>
                      ))}
                    </select>
                  ) : null}
                  <select
                    onChange={(event) =>
                      setTaskDraft((draft) => ({ ...draft, priority: event.target.value as TaskPriority }))
                    }
                    value={taskDraft.priority}
                  >
                    <option value="low">Low priority</option>
                    <option value="medium">Medium priority</option>
                    <option value="high">High priority</option>
                    <option value="urgent">Urgent priority</option>
                  </select>
                  <input
                    onChange={(event) => setTaskDraft((draft) => ({ ...draft, dueDate: event.target.value }))}
                    type="date"
                    value={taskDraft.dueDate}
                  />
                  <input
                    max="100"
                    min="0"
                    onChange={(event) =>
                      setTaskDraft((draft) => ({ ...draft, progress: Number(event.target.value) }))
                    }
                    type="number"
                    value={taskDraft.progress}
                  />
                  <button type="submit" className="primary-button">
                    <Plus aria-hidden="true" size={18} />
                    Allocate Task
                  </button>
                </form>
                {allocationMessage ? <p className="success-message">{allocationMessage}</p> : null}
              </section>
            ) : null}
          </section>
        ) : null}

        <section className="content-grid">
          {currentUser.role === "user" ? (
            <section className="panel" id="my-tasks">
              <div className="panel-header">
                <div>
                  <p>Allocated to {currentUser.name}</p>
                  <h2>My Tasks</h2>
                </div>
              </div>

              <div className="task-list">
                {myTasks.length ? (
                  myTasks.map((task) => renderTaskCard(task, "mine"))
                ) : (
                  <p className="empty-state">No tasks allocated to you yet.</p>
                )}
              </div>
            </section>
          ) : null}

          <section className="panel" id="tasks">
            <div className="panel-header">
              <div>
                <p>{currentUser.role === "superadmin" ? "All departments" : currentUser.department}</p>
                <h2>Department Tasks</h2>
              </div>
              <button type="button" className="ghost-button">
                <Search aria-hidden="true" size={16} />
                Filter
              </button>
            </div>

            <div className="task-list">
              {visibleTasks.map((task) => renderTaskCard(task))}
            </div>
          </section>

          <section className="panel" id="team">
            <div className="panel-header">
              <div>
                <p>{currentUser.role === "superadmin" ? "All users" : "Department users"}</p>
                <h2>People Directory</h2>
              </div>
            </div>

            <div className="member-list">
              {visibleUsers.map((user) => {
                const isEditing = editingUserId === user.id && editDraft;
                const canEditRow =
                  currentUser.role === "superadmin" ||
                  (currentUser.role === "admin" && user.role === "user" && user.department === currentUser.department);
                const canDeleteRow = canEditRow && user.id !== currentUser.id && user.role !== "superadmin";

                return (
                  <article className="member-row managed-user-row" key={user.id}>
                    {isEditing ? (
                      <div className="edit-user-grid">
                        <input
                          onChange={(event) => setEditDraft({ ...editDraft, name: event.target.value })}
                          value={editDraft.name}
                        />
                        <input
                          onChange={(event) => setEditDraft({ ...editDraft, username: event.target.value })}
                          type="email"
                          value={editDraft.username}
                        />
                        <input
                          onChange={(event) => setEditDraft({ ...editDraft, password: event.target.value })}
                          type="password"
                          value={editDraft.password}
                        />
                        {currentUser.role === "superadmin" ? (
                          <>
                            <select
                              onChange={(event) =>
                                setEditDraft({ ...editDraft, department: event.target.value as DepartmentName })
                              }
                              value={editDraft.department}
                            >
                              <option value="Executive">Executive</option>
                              {departments.map((department) => (
                                <option key={department} value={department}>{department}</option>
                              ))}
                            </select>
                            <select
                              onChange={(event) =>
                                setEditDraft({ ...editDraft, role: event.target.value as UserRole })
                              }
                              value={editDraft.role}
                            >
                              <option value="user">Normal User</option>
                              <option value="admin">Admin</option>
                              <option value="superadmin">Super Admin</option>
                            </select>
                          </>
                        ) : null}
                      </div>
                    ) : (
                      <>
                        <div className="member-heading">
                          <div>
                            <strong>{user.name}</strong>
                            <p>{user.username}</p>
                          </div>
                          <span>{roleLabels[user.role]}</span>
                        </div>
                        <div className="user-line">
                          <span>{user.department}</span>
                          <span>{user.role === "user" ? "Receives tasks" : "Can manage"}</span>
                        </div>
                      </>
                    )}

                    {canEditRow ? (
                      <div className="row-actions">
                        {isEditing ? (
                          <>
                            <button type="button" className="icon-button" onClick={saveEditUser} aria-label="Save user">
                              <Save aria-hidden="true" size={16} />
                            </button>
                            <button
                              type="button"
                              className="icon-button"
                              onClick={() => {
                                setEditingUserId(null);
                                setEditDraft(null);
                              }}
                              aria-label="Cancel edit"
                            >
                              <X aria-hidden="true" size={16} />
                            </button>
                          </>
                        ) : (
                          <>
                            <button type="button" className="icon-button" onClick={() => startEditUser(user)} aria-label="Edit user">
                              <Edit3 aria-hidden="true" size={16} />
                            </button>
                            {canDeleteRow ? (
                              <button type="button" className="icon-button danger" onClick={() => deleteUser(user.id)} aria-label="Delete user">
                                <Trash2 aria-hidden="true" size={16} />
                              </button>
                            ) : null}
                          </>
                        )}
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </section>
        </section>
      </section>
    </main>
  );
}
