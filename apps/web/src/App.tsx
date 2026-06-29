import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Archive,
  Bell,
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
  ShieldCheck,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
  X
} from "lucide-react";
import type { AppUser, DepartmentName, TaskPriority, TaskStatus, UserRole } from "@mab/shared";
import { api, hasSession } from "./api";
import type { AppNotification, ManagedTask } from "./api";
import { StatCard } from "./components/StatCard";

const mabLogo = "/mab-logo.jpeg";

const departments: DepartmentName[] = [
  "Mechanical Technical office engineer",
  "Electrical Technical office engineer"
];

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
  const [users, setUsers] = useState<AppUser[]>([]);
  const [tasks, setTasks] = useState<ManagedTask[]>([]);
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [activeView, setActiveView] = useState<"dashboard" | "finished">("dashboard");
  const [showNotifications, setShowNotifications] = useState(false);
  const [appLoading, setAppLoading] = useState(hasSession());
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

  async function refreshData(silent = false) {
    try {
      const data = await api.bootstrap();
      setCurrentUser(data.currentUser);
      setUsers(data.users);
      setTasks(data.tasks);
      setNotifications(data.notifications);
      setLoginError("");
    } catch (error) {
      if (!silent) setLoginError(error instanceof Error ? error.message : "Could not connect to the server.");
      if (!hasSession()) setCurrentUser(null);
    } finally {
      if (!silent) setAppLoading(false);
    }
  }

  useEffect(() => {
    if (hasSession()) void refreshData();
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    const interval = window.setInterval(() => void refreshData(true), 4000);
    const syncSession = () => {
      if (hasSession()) void refreshData(true);
      else setCurrentUser(null);
    };
    window.addEventListener("storage", syncSession);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("storage", syncSession);
    };
  }, [currentUser?.id]);

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

  const activeTasks = useMemo(
    () => visibleTasks.filter((task) => task.status !== "done"),
    [visibleTasks]
  );

  const finishedTasks = useMemo(
    () => visibleTasks.filter((task) => task.status === "done"),
    [visibleTasks]
  );

  const myTasks = useMemo(() => {
    if (!currentUser || currentUser.role !== "user") return [];
    return sortTasksByPriority(
      tasks.filter((task) => task.assigneeId === currentUser.id && task.status !== "done")
    );
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

  const openTasks = activeTasks.length;
  const urgentTasks = activeTasks.filter((task) => task.priority === "urgent").length;
  const averageProgress = visibleTasks.length
    ? Math.round(visibleTasks.reduce((sum, task) => sum + task.progress, 0) / visibleTasks.length)
    : 0;
  const unreadNotifications = notifications.filter((notification) => !notification.isRead).length;

  async function handleLogout() {
    await api.logout();
    setCurrentUser(null);
    setUsers([]);
    setTasks([]);
    setNotifications([]);
  }

  async function openNotifications() {
    setShowNotifications((visible) => !visible);
    if (unreadNotifications) {
      await api.markNotificationsRead();
      setNotifications((items) => items.map((item) => ({ ...item, isRead: true })));
    }
  }

  async function handleLogin(username: string, password: string) {
    try {
      setAppLoading(true);
      await api.login(username, password);
      await refreshData();
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "Login failed.");
      setAppLoading(false);
    }
  }

  function getFormDepartment(formData: FormData): DepartmentName {
    if (currentUser?.role === "admin") return currentUser.department;
    return String(formData.get("department") ?? departments[0]) as DepartmentName;
  }

  function getFormRole(formData: FormData): UserRole {
    if (currentUser?.role === "admin") return "user";
    return String(formData.get("role") ?? "user") as UserRole;
  }

  async function handleCreatePerson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentUser || !canManagePeople) return;

    const form = event.currentTarget;
    const formData = new FormData(form);
    const name = String(formData.get("name") ?? "").trim();
    const username = String(formData.get("username") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    const role = getFormRole(formData);
    const department = getFormDepartment(formData);

    if (!name || !username || !password) {
      setPeopleMessage("Please fill name, username, and password.");
      return;
    }

    try {
      await api.createUser({ name, username, password, role, department });
      await refreshData(true);
      form.reset();
      setPeopleMessage(`${name} was created as ${roleLabels[role]} in ${department}.`);
    } catch (error) {
      setPeopleMessage(error instanceof Error ? error.message : "Could not create this user.");
    }
  }

  function startEditUser(user: AppUser) {
    setEditingUserId(user.id);
    setEditDraft({ ...user, password: "" });
  }

  async function saveEditUser() {
    if (!currentUser || !editDraft) return;

    const updatedUser = currentUser.role === "admin"
      ? { ...editDraft, department: currentUser.department, role: "user" as UserRole }
      : editDraft;
    try {
      await api.updateUser(updatedUser);
      await refreshData(true);
      setEditingUserId(null);
      setEditDraft(null);
      setPeopleMessage(`${updatedUser.name} was updated.`);
    } catch (error) {
      setPeopleMessage(error instanceof Error ? error.message : "Could not update this user.");
    }
  }

  async function deleteUser(userId: string) {
    const user = users.find((person) => person.id === userId);
    if (!user || user.id === currentUser?.id || user.role === "superadmin") return;

    try {
      await api.deleteUser(userId);
      await refreshData(true);
      setPeopleMessage(`${user.name} was deleted.`);
    } catch (error) {
      setPeopleMessage(error instanceof Error ? error.message : "Could not delete this user.");
    }
  }

  function canManageTask(task: ManagedTask) {
    if (!currentUser) return false;
    if (currentUser.role === "superadmin") return true;
    return currentUser.role === "admin" && task.department === currentUser.department;
  }

  async function handleAllocateTask(event: FormEvent<HTMLFormElement>) {
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

    try {
      await api.createTask({
        title,
        department,
        priority: taskDraft.priority,
        assigneeId: assignee?.id,
        candidateName: assignee?.name,
        dueDate: taskDraft.dueDate,
        progress: assignee ? clampProgress(taskDraft.progress) : 0,
        reviewComment: undefined,
        completedAt: undefined
      });
      await refreshData(true);
      setAllocationMessage(
        assignee
          ? `${currentUser.name} allocated "${title}" to ${assignee.name}.`
          : `${currentUser.name} added "${title}" as a free ${department} task.`
      );
    } catch (error) {
      setAllocationMessage(error instanceof Error ? error.message : "Could not allocate this task.");
    }
  }

  function startEditTask(task: ManagedTask) {
    if (!canManageTask(task)) return;
    setEditingTaskId(task.id);
    setTaskEditDraft({ ...task });
  }

  async function saveEditTask() {
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

    try {
      await api.updateTask(updatedTask);
      await refreshData(true);
      setEditingTaskId(null);
      setTaskEditDraft(null);
      setAllocationMessage(`"${title}" was updated.`);
    } catch (error) {
      setAllocationMessage(error instanceof Error ? error.message : "Could not update this task.");
    }
  }

  async function deleteTask(task: ManagedTask) {
    if (!canManageTask(task)) return;

    try {
      await api.deleteTask(task.id);
      await refreshData(true);
      setEditingTaskId((activeTaskId) => (activeTaskId === task.id ? null : activeTaskId));
      setTaskEditDraft((draft) => (draft?.id === task.id ? null : draft));
      setAllocationMessage(`"${task.title}" was deleted.`);
    } catch (error) {
      setAllocationMessage(error instanceof Error ? error.message : "Could not delete this task.");
    }
  }

  async function claimTask(task: ManagedTask) {
    if (!currentUser || currentUser.role !== "user") return;
    if (task.department !== currentUser.department || task.assigneeId) return;

    try {
      await api.taskAction(task.id, "claim");
      await refreshData(true);
      setAllocationMessage(`${currentUser.name} took "${task.title}".`);
    } catch (error) {
      setAllocationMessage(error instanceof Error ? error.message : "Could not claim this task.");
    }
  }

  async function submitTaskForReview(task: ManagedTask) {
    if (!currentUser || currentUser.role !== "user" || task.assigneeId !== currentUser.id) return;
    if (task.status === "done" || task.status === "under_review") return;

    try {
      await api.taskAction(task.id, "submit");
      await refreshData(true);
      setAllocationMessage(`"${task.title}" is under review.`);
    } catch (error) {
      setAllocationMessage(error instanceof Error ? error.message : "Could not submit this task.");
    }
  }

  async function approveTask(task: ManagedTask) {
    if (!currentUser || !canManageTask(task) || task.status !== "under_review") return;

    try {
      await api.taskAction(task.id, "approve");
      await refreshData(true);
      setAllocationMessage(`"${task.title}" was approved and moved to Finished Tasks.`);
    } catch (error) {
      setAllocationMessage(error instanceof Error ? error.message : "Could not approve this task.");
    }
  }

  async function reopenTask(task: ManagedTask) {
    if (!currentUser || !canManageTask(task) || task.status !== "under_review") return;

    const comment = reviewDrafts[task.id]?.trim();
    if (!comment) {
      setAllocationMessage("Add a review comment before reopening the task.");
      return;
    }

    try {
      await api.reopenTask(task.id, comment);
      await refreshData(true);
      setReviewDrafts((drafts) => ({ ...drafts, [task.id]: "" }));
      setAllocationMessage(`"${task.title}" was reopened with comments.`);
    } catch (error) {
      setAllocationMessage(error instanceof Error ? error.message : "Could not reopen this task.");
    }
  }

  async function addTaskMessage(task: ManagedTask) {
    if (!currentUser) return;

    const body = messageDrafts[task.id]?.trim();
    if (!body) return;

    try {
      await api.addMessage(task.id, body);
      await refreshData(true);
      setMessageDrafts((drafts) => ({ ...drafts, [task.id]: "" }));
    } catch (error) {
      setAllocationMessage(error instanceof Error ? error.message : "Could not send this message.");
    }
  }

  async function addTaskFiles(task: ManagedTask, fileList: FileList | null) {
    if (!currentUser || !fileList?.length) return;

    const names = Array.from(fileList).map((file) => file.name);
    try {
      await api.addFiles(task.id, names);
      await refreshData(true);
      setAllocationMessage(`${names.length} file(s) added to "${task.title}".`);
    } catch (error) {
      setAllocationMessage(error instanceof Error ? error.message : "Could not add these files.");
    }
  }

  function renderTaskCard(task: ManagedTask, view: "department" | "mine" = "department") {
    const isEditingTask = editingTaskId === task.id && taskEditDraft;
    const canDeleteTask = canManageTask(task);
    const canEditTask = canDeleteTask && task.status !== "done";
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

          {canEditTask || canDeleteTask || canClaimTask || canSubmitForReview ? (
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
                  {canDeleteTask ? (
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

        {task.status === "done" ? (
          <div className="finished-stamp">
            <CheckCircle2 aria-hidden="true" size={18} />
            <div>
              <strong>Approved and completed</strong>
              <span>{task.completedAt ? `Completed ${task.completedAt}` : "Completion recorded"}</span>
            </div>
          </div>
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

  if (appLoading) {
    return (
      <main className="app-loading">
        <img src={mabLogo} alt="MAB logo" />
        <strong>Loading your workspace...</strong>
      </main>
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
          <button
            type="button"
            className={`sidebar-nav-button ${activeView === "dashboard" ? "active" : ""}`}
            onClick={() => setActiveView("dashboard")}
          >
            <ClipboardList aria-hidden="true" size={17} />
            Active Tasks
            <span>{activeTasks.length}</span>
          </button>
          <button
            type="button"
            className={`sidebar-nav-button ${activeView === "finished" ? "active" : ""}`}
            onClick={() => setActiveView("finished")}
          >
            <Archive aria-hidden="true" size={17} />
            Finished Tasks
            <span>{finishedTasks.length}</span>
          </button>
          <a href="#people" onClick={() => setActiveView("dashboard")}>People</a>
          <a href="#team" onClick={() => setActiveView("dashboard")}>Team</a>
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
          <div className="topbar-actions">
            <div className="notification-center">
              <button
                type="button"
                className="notification-button"
                onClick={openNotifications}
                aria-label="Notifications"
                aria-expanded={showNotifications}
              >
                <Bell aria-hidden="true" size={19} />
                {unreadNotifications ? <span>{unreadNotifications}</span> : null}
              </button>
              {showNotifications ? (
                <div className="notification-popover">
                  <div className="notification-heading">
                    <strong>Notifications</strong>
                    <span>{notifications.length} recent</span>
                  </div>
                  <div className="notification-list">
                    {notifications.length ? notifications.map((notification) => (
                      <article key={notification.id} className={notification.isRead ? "" : "unread"}>
                        <strong>{notification.title}</strong>
                        <p>{notification.body}</p>
                        <span>{notification.createdAt}</span>
                      </article>
                    )) : <p className="empty-state">No notifications yet.</p>}
                  </div>
                </div>
              ) : null}
            </div>
            <button type="button" className="ghost-button" onClick={handleLogout}>
              <LogOut aria-hidden="true" size={18} />
              Logout
            </button>
          </div>
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

        {activeView === "dashboard" && (canManagePeople || canAllocateTasks) ? (
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

        {activeView === "dashboard" ? <section className="content-grid">
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
            </div>

            <div className="task-list">
              {activeTasks.length ? activeTasks.map((task) => renderTaskCard(task)) : (
                <p className="empty-state">No active tasks in this department.</p>
              )}
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
        </section> : (
          <section className="panel finished-panel" id="finished-tasks">
            <div className="panel-header">
              <div>
                <p>{currentUser.role === "superadmin" ? "All departments" : currentUser.department}</p>
                <h2>Finished Tasks</h2>
              </div>
              <Archive aria-hidden="true" />
            </div>
            <div className="task-list">
              {finishedTasks.length ? finishedTasks.map((task) => renderTaskCard(task)) : (
                <p className="empty-state">Approved tasks will appear here.</p>
              )}
            </div>
          </section>
        )}
      </section>
    </main>
  );
}
