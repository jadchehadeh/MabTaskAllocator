import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Archive,
  Bell,
  Building2,
  CheckCircle2,
  ClipboardList,
  Download,
  Edit3,
  FileSpreadsheet,
  FolderKanban,
  Gauge,
  Hand,
  KeyRound,
  ListTodo,
  Lock,
  LogOut,
  MessageSquare,
  Moon,
  Paperclip,
  Plus,
  RotateCcw,
  Save,
  ShieldCheck,
  Sparkles,
  Sun,
  Trash2,
  Upload,
  UserPlus,
  Users,
  X
} from "lucide-react";
import type { AppUser, DepartmentName, TaskPriority, TaskStatus, TaskType, UserRole } from "@mab/shared";
import { api, getLastActivity, hasSession, inactivityLimitMs, markActivity } from "./api";
import type { AppNotification, ChatChannel, ChatMessage, ManagedTask, Project, TodoItem } from "./api";
import { StatCard } from "./components/StatCard";

const mabLogo = "/mab-logo.jpeg";

const defaultDepartments: DepartmentName[] = [
  "Mechanical Technical office engineer",
  "Electrical Technical office engineer",
  "Document Controller"
];

const taskTypes: TaskType[] = ["Technical", "QS", "Shop Drawings", "BIM", "Variation"];
const themeKeyPrefix = "mab-task-allocator.theme.";

function storedDarkMode(ownerId: string) {
  const savedTheme = window.localStorage.getItem(`${themeKeyPrefix}${ownerId}`);
  if (savedTheme) return savedTheme === "dark";
  return false;
}
const quickEmojis = ["👍", "✅", "👀", "🙏", "📌", "🚧", "🎉", "😊"];

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

function formatFileSize(size: number) {
  if (!size) return "Stored file";
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function completionDays(task: ManagedTask) {
  if (!task.completedAtIso) return null;
  const duration = (new Date(task.completedAtIso).getTime() - new Date(task.createdAt).getTime()) / 86_400_000;
  return Number.isFinite(duration) && duration >= 0 ? duration : null;
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function identityColor(id?: string | null, currentUserId?: string) {
  const safeId = id || "unknown-user";
  if (safeId === currentUserId) return "#1178b8";
  const colors = ["#7c3aed", "#c2410c", "#047857", "#be185d", "#0369a1", "#a16207"];
  const hash = [...safeId].reduce((total, character) => total + character.charCodeAt(0), 0);
  return colors[hash % colors.length];
}

interface LoginPageProps {
  darkMode: boolean;
  error: string;
  onLogin: (username: string, password: string) => void;
  onToggleTheme: () => void;
}

function LoginPage({ darkMode, error, onLogin, onToggleTheme }: LoginPageProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onLogin(username, password);
  }

  return (
    <main className="login-shell">
      <button
        aria-label={`Switch to ${darkMode ? "light" : "dark"} mode`}
        aria-pressed={darkMode}
        className="theme-toggle login-theme-toggle"
        onClick={onToggleTheme}
        type="button"
      >
        {darkMode ? <Sun aria-hidden="true" size={18} /> : <Moon aria-hidden="true" size={18} />}
        {darkMode ? "Light mode" : "Dark mode"}
      </button>
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

        </form>
      </section>
    </main>
  );
}

export function App() {
  const [themePreference, setThemePreference] = useState(() => ({
    darkMode: storedDarkMode("login"),
    ownerId: "login"
  }));
  const [users, setUsers] = useState<AppUser[]>([]);
  const [departments, setDepartments] = useState<DepartmentName[]>(defaultDepartments);
  const [tasks, setTasks] = useState<ManagedTask[]>([]);
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [chatChannels, setChatChannels] = useState<ChatChannel[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState("");
  const [chatDraft, setChatDraft] = useState("");
  const [chatStatus, setChatStatus] = useState("");
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [groupDraft, setGroupDraft] = useState({ name: "", department: defaultDepartments[0] });
  const [editingChatGroupId, setEditingChatGroupId] = useState("");
  const [chatGroupNameDraft, setChatGroupNameDraft] = useState("");
  const [activeView, setActiveView] = useState<
    "dashboard" | "projects" | "tasks" | "todos" | "finished" | "people" | "team" | "productivity" | "chat"
  >("dashboard");
  const [showNotifications, setShowNotifications] = useState(false);
  const [appLoading, setAppLoading] = useState(hasSession());
  const [loginError, setLoginError] = useState("");
  const [peopleMessage, setPeopleMessage] = useState("");
  const [departmentDraft, setDepartmentDraft] = useState("");
  const [departmentMessage, setDepartmentMessage] = useState("");
  const [allocationMessage, setAllocationMessage] = useState("");
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<AppUser | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [taskEditDraft, setTaskEditDraft] = useState<ManagedTask | null>(null);
  const [messageDrafts, setMessageDrafts] = useState<Record<string, string>>({});
  const [reviewDrafts, setReviewDrafts] = useState<Record<string, string>>({});
  const [taskFiles, setTaskFiles] = useState<File[]>([]);
  const [reportUserId, setReportUserId] = useState("");
  const [archiveFilters, setArchiveFilters] = useState({
    from: "",
    to: "",
    assigneeId: "",
    priority: "" as "" | TaskPriority,
    status: "done" as "" | TaskStatus
  });

  const themeOwnerId = currentUser?.id ?? "login";
  const darkMode = themePreference.darkMode;

  useEffect(() => {
    setThemePreference({
      darkMode: storedDarkMode(themeOwnerId),
      ownerId: themeOwnerId
    });
  }, [themeOwnerId]);

  useEffect(() => {
    if (themePreference.ownerId !== themeOwnerId) return;
    const theme = themePreference.darkMode ? "dark" : "light";
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    window.localStorage.setItem(`${themeKeyPrefix}${themeOwnerId}`, theme);
  }, [themeOwnerId, themePreference]);

  useEffect(() => {
    function syncTheme(event: StorageEvent) {
      if (event.key === `${themeKeyPrefix}${themeOwnerId}` && event.newValue) {
        setThemePreference({ darkMode: event.newValue === "dark", ownerId: themeOwnerId });
      }
    }

    window.addEventListener("storage", syncTheme);
    return () => window.removeEventListener("storage", syncTheme);
  }, [themeOwnerId]);

  function toggleTheme() {
    setThemePreference((preference) => ({
      darkMode: !(preference.ownerId === themeOwnerId
        ? preference.darkMode
        : storedDarkMode(themeOwnerId)),
      ownerId: themeOwnerId
    }));
  }
  const [teamDepartment, setTeamDepartment] = useState("");
  const [teamMonth, setTeamMonth] = useState(new Date().toISOString().slice(0, 7));
  const [productivityMonth, setProductivityMonth] = useState("");
  const [todoDraft, setTodoDraft] = useState({ title: "", taskId: "" });
  const [todoFilter, setTodoFilter] = useState<"all" | "open" | "completed">("all");
  const [todoMessage, setTodoMessage] = useState("");
  const [taskDraft, setTaskDraft] = useState({
    title: "Prepare client visit checklist",
    assigneeIds: [] as string[],
    department: "Mechanical Technical office engineer" as DepartmentName,
    priority: "high" as TaskPriority,
    taskType: "Technical" as TaskType,
    projectId: "",
    dueDate: "2026-07-05",
    progress: 0
  });
  const [projectDraft, setProjectDraft] = useState({
    name: "",
    description: "",
    department: defaultDepartments[0],
    memberIds: [] as string[]
  });
  const [projectMessage, setProjectMessage] = useState("");
  const [projectMemberDrafts, setProjectMemberDrafts] = useState<Record<string, string[]>>({});
  const [confirmation, setConfirmation] = useState<{
    message: string;
    onConfirm: () => Promise<void> | void;
  } | null>(null);

  const canManagePeople = currentUser?.role === "superadmin" || currentUser?.role === "admin";
  const canAllocateTasks = currentUser?.role === "superadmin" || currentUser?.role === "admin";

  function requestConfirmation(message: string, onConfirm: () => Promise<void> | void) {
    setConfirmation({ message, onConfirm });
  }

  async function refreshData(silent = false) {
    try {
      const data = await api.bootstrap();
      setCurrentUser(data.currentUser);
      setDepartments(data.departments?.length ? data.departments : defaultDepartments);
      setUsers(data.users);
      setTasks(data.tasks);
      setTodos(data.todos);
      setProjects(data.projects);
      setNotifications(data.notifications);
      setChatChannels(data.chatChannels);
      setChatMessages(data.chatMessages);
      setLoginError("");
    } catch (error) {
      if (!silent) setLoginError(error instanceof Error ? error.message : "Could not connect to the server.");
      if (!hasSession()) {
        setCurrentUser(null);
        setLoginError("Your session expired after 10 minutes of inactivity. Please log in again.");
      }
    } finally {
      if (!silent) setAppLoading(false);
    }
  }

  useEffect(() => {
    if (!hasSession()) return;
    const restoreIndependentTabSession = async () => {
      try {
        await api.forkSession();
        await refreshData();
      } catch (error) {
        setLoginError(error instanceof Error ? error.message : "Please log in again.");
        setAppLoading(false);
      }
    };
    void restoreIndependentTabSession();
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    const interval = window.setInterval(() => void refreshData(true), 4000);
    return () => {
      window.clearInterval(interval);
    };
  }, [currentUser?.id]);

  useEffect(() => {
    if (!currentUser) return;
    let idleTimer = 0;
    let lastServerTouch = getLastActivity();
    let lastRecordedActivity = lastServerTouch;

    const expire = () => void handleSessionExpired();
    const scheduleExpiry = () => {
      window.clearTimeout(idleTimer);
      const remaining = inactivityLimitMs - (Date.now() - getLastActivity());
      if (remaining <= 0) expire();
      else idleTimer = window.setTimeout(expire, remaining);
    };
    const recordActivity = () => {
      const previousActivity = getLastActivity();
      if (previousActivity && Date.now() - previousActivity >= inactivityLimitMs) {
        expire();
        return;
      }
      if (Date.now() - lastRecordedActivity < 15_000) return;
      const now = markActivity();
      lastRecordedActivity = now;
      if (now - lastServerTouch >= 60_000) {
        lastServerTouch = now;
        void api.touchSession().catch(() => undefined);
      }
      scheduleExpiry();
    };
    const events: (keyof WindowEventMap)[] = ["mousedown", "mousemove", "keydown", "scroll", "touchstart"];
    events.forEach((eventName) => window.addEventListener(eventName, recordActivity, { passive: true }));
    if (!getLastActivity()) markActivity();
    scheduleExpiry();

    return () => {
      window.clearTimeout(idleTimer);
      events.forEach((eventName) => window.removeEventListener(eventName, recordActivity));
    };
  }, [currentUser?.id]);

  useEffect(() => {
    if (chatChannels.some((channel) => channel.id === selectedChannelId)) return;
    setSelectedChannelId(chatChannels[0]?.id ?? "");
  }, [chatChannels, selectedChannelId]);

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

  useEffect(() => {
    if (assignableUsers.some((user) => user.id === reportUserId)) return;
    setReportUserId(assignableUsers[0]?.id ?? "");
  }, [assignableUsers, reportUserId]);

  const visibleTasks = useMemo(() => {
    if (!currentUser) return [];
    const matchingTasks =
      currentUser.role === "superadmin"
        ? tasks
        : tasks.filter((task) =>
            task.department === currentUser.department &&
            (currentUser.role === "admin" || !task.projectId || projects.some((project) => project.id === task.projectId))
          );

    return sortTasksByPriority(matchingTasks);
  }, [currentUser, projects, tasks]);

  const activeTasks = useMemo(
    () => visibleTasks.filter((task) => task.status !== "done"),
    [visibleTasks]
  );

  const todoLinkableTasks = useMemo(() => activeTasks.filter((task) =>
    currentUser?.role !== "user" || task.assigneeIds.includes(currentUser.id)
  ), [activeTasks, currentUser]);

  const openTodos = todos.filter((todo) => !todo.completed);
  const completedTodos = todos.filter((todo) => todo.completed);
  const filteredTodos = todos.filter((todo) =>
    todoFilter === "all" || (todoFilter === "completed" ? todo.completed : !todo.completed)
  );
  const todoProgress = todos.length ? Math.round((completedTodos.length / todos.length) * 100) : 0;

  const finishedTasks = useMemo(
    () => visibleTasks.filter((task) => task.status === "done"),
    [visibleTasks]
  );

  const filteredArchiveTasks = useMemo(() => visibleTasks.filter((task) => {
    if (archiveFilters.status && task.status !== archiveFilters.status) return false;
    if (archiveFilters.priority && task.priority !== archiveFilters.priority) return false;
    if (archiveFilters.assigneeId && !task.assigneeIds.includes(archiveFilters.assigneeId)) return false;
    const referenceDate = (task.completedAtIso ?? task.createdAt).slice(0, 10);
    if (archiveFilters.from && referenceDate < archiveFilters.from) return false;
    if (archiveFilters.to && referenceDate > archiveFilters.to) return false;
    return true;
  }), [archiveFilters, visibleTasks]);

  const teamCandidates = useMemo(() => {
    const normalUsers = visibleUsers.filter((user) => user.role === "user");
    if (currentUser?.role === "superadmin" && teamDepartment) {
      return normalUsers.filter((user) => user.department === teamDepartment);
    }
    return normalUsers;
  }, [currentUser?.role, teamDepartment, visibleUsers]);

  const productivityCandidates = useMemo(
    () => visibleUsers.filter((user) => user.role === "user"),
    [visibleUsers]
  );

  const myTasks = useMemo(() => {
    if (!currentUser || currentUser.role !== "user") return [];
    return sortTasksByPriority(
      tasks.filter((task) => task.assigneeIds.includes(currentUser.id) && task.status !== "done")
    );
  }, [currentUser, tasks]);

  const selectedDraftProject = projects.find((project) => project.id === taskDraft.projectId);
  const taskDraftAssignableUsers = assignableUsers.filter((user) =>
    selectedDraftProject
      ? selectedDraftProject.members.some((member) => member.id === user.id)
      : user.department === taskDraft.department
  );

  useEffect(() => {
    if (!currentUser || !canAllocateTasks) return;
    setTaskDraft((draft) => ({
      ...draft,
      assigneeIds: draft.assigneeIds.filter((id) => taskDraftAssignableUsers.some((user) => user.id === id)),
      department: selectedDraftProject?.department ?? (currentUser.role === "admin" ? currentUser.department : draft.department)
    }));
  }, [canAllocateTasks, currentUser?.id, selectedDraftProject?.id, taskDraftAssignableUsers.map((user) => user.id).join(",")]);

  const openTasks = activeTasks.length;
  const urgentTasks = activeTasks.filter((task) => task.priority === "urgent").length;
  const averageProgress = visibleTasks.length
    ? Math.round(visibleTasks.reduce((sum, task) => sum + task.progress, 0) / visibleTasks.length)
    : 0;
  const unreadNotifications = notifications.filter((notification) => !notification.isRead).length;
  const selectedChatChannel = chatChannels.find((channel) => channel.id === selectedChannelId);
  const selectedChatMessages = chatMessages.filter((message) => message.channelId === selectedChannelId);
  const canDeleteSelectedChatGroup = Boolean(selectedChatChannel?.isGroup && (
    currentUser?.role === "superadmin" ||
    (currentUser?.role === "admin" && selectedChatChannel.department === currentUser.department)
  ));

  function userMetrics(userId: string, month = "") {
    const assigned = tasks.filter((task) => task.assigneeIds.includes(userId));
    const inPeriod = month
      ? assigned.filter((task) => task.createdAt.startsWith(month) || task.completedAtIso?.startsWith(month))
      : assigned;
    const completed = inPeriod.filter((task) => task.status === "done");
    const durations = completed.map(completionDays).filter((value): value is number => value !== null);
    const onTime = completed.filter((task) => task.completedAtIso && task.completedAtIso.slice(0, 10) <= task.dueDate);
    const overdue = inPeriod.filter((task) => task.status !== "done" && task.dueDate < new Date().toISOString().slice(0, 10));
    return {
      assigned: inPeriod.length,
      active: assigned.filter((task) => task.status !== "done").length,
      completed: completed.length,
      completedInMonth: assigned.filter((task) => task.completedAtIso?.startsWith(teamMonth)).length,
      overdue: overdue.length,
      averageProgress: Math.round(average(inPeriod.map((task) => task.progress))),
      averageCompletionDays: average(durations),
      completionRate: inPeriod.length ? completed.length / inPeriod.length : 0,
      onTimeRate: completed.length ? onTime.length / completed.length : 0
    };
  }

  async function handleLogout() {
    try {
      await api.logout();
    } finally {
      setCurrentUser(null);
      setUsers([]);
      setTasks([]);
      setTodos([]);
      setProjects([]);
      setNotifications([]);
      setChatChannels([]);
      setChatMessages([]);
    }
  }

  async function handleSessionExpired() {
    try {
      await api.logout();
    } finally {
      setCurrentUser(null);
      setUsers([]);
      setTasks([]);
      setTodos([]);
      setProjects([]);
      setNotifications([]);
      setChatChannels([]);
      setChatMessages([]);
      setLoginError("Your session expired after 10 minutes of inactivity. Please log in again.");
    }
  }

  async function openNotifications() {
    setShowNotifications((visible) => !visible);
    if (unreadNotifications) {
      await api.markNotificationsRead();
      setNotifications((items) => items.map((item) => ({ ...item, isRead: true })));
    }
  }

  async function openDepartmentChat() {
    setActiveView("chat");
    setChatStatus("");
    try {
      const data = await api.loadChat();
      setChatChannels(data.chatChannels);
      setChatMessages(data.chatMessages);
      const departmentChannel = data.chatChannels.find((channel) =>
        !channel.isGroup && (currentUser?.role === "superadmin" || channel.department === currentUser?.department));
      setSelectedChannelId(departmentChannel?.id ?? data.chatChannels[0]?.id ?? "");
    } catch (error) {
      setChatStatus(error instanceof Error ? error.message : "Could not open Department Chat.");
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

  async function createTodo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = todoDraft.title.trim();
    if (!title) {
      setTodoMessage("Write a TODO item first.");
      return;
    }
    try {
      const { todo } = await api.createTodo({ title, taskId: todoDraft.taskId || undefined });
      setTodos((items) => [todo, ...items]);
      setTodoDraft({ title: "", taskId: "" });
      setTodoMessage("TODO item added.");
    } catch (error) {
      setTodoMessage(error instanceof Error ? error.message : "Could not add the TODO item.");
    }
  }

  async function toggleTodo(todo: TodoItem) {
    try {
      const result = await api.updateTodo({ ...todo, completed: !todo.completed });
      setTodos((items) => items.map((item) => item.id === todo.id ? result.todo : item));
      setTodoMessage(result.todo.completed ? "TODO item completed." : "TODO item reopened.");
    } catch (error) {
      setTodoMessage(error instanceof Error ? error.message : "Could not update the TODO item.");
    }
  }

  function deleteTodo(todo: TodoItem) {
    requestConfirmation(`Delete the TODO item “${todo.title}”?`, async () => {
      try {
        await api.deleteTodo(todo.id);
        setTodos((items) => items.filter((item) => item.id !== todo.id));
        setTodoMessage("TODO item deleted.");
      } catch (error) {
        setTodoMessage(error instanceof Error ? error.message : "Could not delete the TODO item.");
      }
    });
  }

  function getFormDepartment(formData: FormData): DepartmentName {
    if (currentUser?.role === "admin") return currentUser.department;
    return String(formData.get("department") ?? departments[0]) as DepartmentName;
  }

  function getFormRole(formData: FormData): UserRole {
    if (currentUser?.role === "admin") return "user";
    return String(formData.get("role") ?? "user") as UserRole;
  }

  async function handleCreateDepartment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (currentUser?.role !== "superadmin") return;
    const name = departmentDraft.trim();
    if (!name) {
      setDepartmentMessage("Enter a department name.");
      return;
    }
    try {
      const result = await api.createDepartment(name);
      await refreshData(true);
      setDepartmentDraft("");
      setDepartmentMessage(`${result.department} was created.`);
    } catch (error) {
      setDepartmentMessage(error instanceof Error ? error.message : "Could not create this department.");
    }
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

  function deleteUser(userId: string) {
    const user = users.find((person) => person.id === userId);
    if (!user || user.id === currentUser?.id || user.role === "superadmin") return;
    requestConfirmation(`Are you sure you want to delete ${user.name}? This cannot be undone.`, async () => {
      try {
        await api.deleteUser(userId);
        await refreshData(true);
        setPeopleMessage(`${user.name} was deleted.`);
      } catch (error) {
        setPeopleMessage(error instanceof Error ? error.message : "Could not delete this user.");
      }
    });
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
    const assignees = taskDraftAssignableUsers.filter((user) => taskDraft.assigneeIds.includes(user.id));
    const department = selectedDraftProject?.department ?? (
      currentUser.role === "admin" ? currentUser.department : taskDraft.department
    );

    if (!title) {
      setAllocationMessage("Please enter a task title.");
      return;
    }

    if (assignees.length !== taskDraft.assigneeIds.length) {
      setAllocationMessage("Every assignee must be a valid project member in this department.");
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
        assigneeId: assignees[0]?.id,
        assigneeIds: assignees.map((assignee) => assignee.id),
        candidateName: assignees.map((assignee) => assignee.name).join(", ") || "Unassigned",
        candidateNames: assignees.map((assignee) => assignee.name),
        projectId: selectedDraftProject?.id,
        projectName: selectedDraftProject?.name,
        taskType: taskDraft.taskType,
        dueDate: taskDraft.dueDate,
        progress: assignees.length ? clampProgress(taskDraft.progress) : 0,
        reviewComment: undefined,
        completedAt: undefined
      }, taskFiles);
      await refreshData(true);
      setTaskFiles([]);
      setAllocationMessage(
        assignees.length
          ? `${currentUser.name} allocated "${title}" to ${assignees.map((assignee) => assignee.name).join(", ")}.`
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

    const project = projects.find((item) => item.id === taskEditDraft.projectId);
    const allowedUsers = assignableUsers.filter((user) => project
      ? project.members.some((member) => member.id === user.id)
      : user.department === taskEditDraft.department);
    const assignees = allowedUsers.filter((user) => taskEditDraft.assigneeIds.includes(user.id));
    if (assignees.length !== taskEditDraft.assigneeIds.length) {
      setAllocationMessage("Every assignee must be a valid project member in this department.");
      return;
    }

    if (currentUser.role === "admin" && taskEditDraft.department !== currentUser.department) {
      setAllocationMessage("Admins can edit tasks only inside their own department.");
      return;
    }

    if (currentUser.role === "admin" && assignees.some((assignee) => assignee.department !== currentUser.department)) {
      setAllocationMessage("Admins can assign tasks only to normal users in their own department.");
      return;
    }

    const department = project?.department ?? taskEditDraft.department;
    const progress = clampProgress(taskEditDraft.progress);

    const updatedTask: ManagedTask = {
      ...taskEditDraft,
      title,
      department,
      assigneeId: assignees[0]?.id,
      assigneeIds: assignees.map((assignee) => assignee.id),
      candidateName: assignees.map((assignee) => assignee.name).join(", ") || "Unassigned",
      candidateNames: assignees.map((assignee) => assignee.name),
      projectId: project?.id,
      projectName: project?.name,
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

  function deleteTask(task: ManagedTask) {
    if (!canManageTask(task)) return;
    requestConfirmation(`Are you sure you want to delete Task #${task.taskCode} "${task.title}"? Its chat and documents will also be deleted.`, async () => {
      try {
        await api.deleteTask(task.id);
        await refreshData(true);
        setEditingTaskId((activeTaskId) => (activeTaskId === task.id ? null : activeTaskId));
        setTaskEditDraft((draft) => (draft?.id === task.id ? null : draft));
        setAllocationMessage(`"${task.title}" was deleted.`);
      } catch (error) {
        setAllocationMessage(error instanceof Error ? error.message : "Could not delete this task.");
      }
    });
  }

  async function claimTask(task: ManagedTask) {
    if (!currentUser || currentUser.role !== "user") return;
    if (task.department !== currentUser.department || task.assigneeIds.length) return;

    try {
      await api.taskAction(task.id, "claim");
      await refreshData(true);
      setAllocationMessage(`${currentUser.name} took "${task.title}".`);
    } catch (error) {
      setAllocationMessage(error instanceof Error ? error.message : "Could not claim this task.");
    }
  }

  async function submitTaskForReview(task: ManagedTask) {
    if (!currentUser || currentUser.role !== "user" || !task.assigneeIds.includes(currentUser.id)) return;
    if (task.status === "done" || task.status === "under_review") return;

    try {
      await api.taskAction(task.id, "submit");
      await refreshData(true);
      setAllocationMessage(`Your approval for Task #${task.taskCode} was recorded.`);
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

    const files = Array.from(fileList);
    try {
      await api.addFiles(task.id, files);
      await refreshData(true);
      setAllocationMessage(`${files.length} file(s) added to "${task.title}".`);
    } catch (error) {
      setAllocationMessage(error instanceof Error ? error.message : "Could not add these files.");
    }
  }

  async function downloadTaskFile(file: ManagedTask["files"][number]) {
    try {
      await api.downloadFile(file);
    } catch (error) {
      setAllocationMessage(error instanceof Error ? error.message : "Could not download this file.");
    }
  }

  async function downloadProductivityReport(userId = reportUserId, month = "") {
    if (!userId) {
      setPeopleMessage("Select a normal user first.");
      return;
    }
    try {
      if (month) await api.downloadMonthlyProductivityReport(userId, month);
      else await api.downloadProductivityReport(userId);
      const user = assignableUsers.find((person) => person.id === userId);
      setPeopleMessage(`${month || "All-time"} productivity report downloaded for ${user?.name ?? "the selected user"}.`);
    } catch (error) {
      setPeopleMessage(error instanceof Error ? error.message : "Could not create the productivity report.");
    }
  }

  async function sendDepartmentMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = chatDraft.trim();
    if (!selectedChannelId || !message) return;
    try {
      await api.sendChatMessage(selectedChannelId, message);
      setChatDraft("");
      setChatStatus("");
      await refreshData(true);
    } catch (error) {
      setChatStatus(error instanceof Error ? error.message : "Could not send this message.");
    }
  }

  async function createChatGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentUser || !canManagePeople) return;
    const name = groupDraft.name.trim();
    const department = currentUser.role === "admin" ? currentUser.department : groupDraft.department;
    if (!name) {
      setChatStatus("Enter a group name.");
      return;
    }
    try {
      const result = await api.createChatGroup(name, department);
      setGroupDraft((draft) => ({ ...draft, name: "" }));
      setShowGroupForm(false);
      setChatStatus(`Created ${name} for ${department}.`);
      await refreshData(true);
      setSelectedChannelId(result.channel.id);
    } catch (error) {
      setChatStatus(error instanceof Error ? error.message : "Could not create this group.");
    }
  }

  async function saveChatGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (currentUser?.role !== "superadmin" || !editingChatGroupId) return;
    const name = chatGroupNameDraft.trim();
    if (!name) {
      setChatStatus("Enter a group name.");
      return;
    }
    try {
      const { channel } = await api.updateChatGroup(editingChatGroupId, name);
      setChatChannels((channels) => channels.map((item) => item.id === channel.id ? channel : item));
      setEditingChatGroupId("");
      setChatGroupNameDraft("");
      setChatStatus(`Renamed the group to ${name}.`);
    } catch (error) {
      setChatStatus(error instanceof Error ? error.message : "Could not edit this group.");
    }
  }

  function deleteChatGroup(channel: ChatChannel) {
    const canDelete = channel.isGroup && currentUser && (
      currentUser.role === "superadmin" ||
      (currentUser.role === "admin" && channel.department === currentUser.department)
    );
    if (!canDelete) return;
    requestConfirmation(`Delete the group chat “${channel.name}” and all messages inside it?`, async () => {
      try {
        await api.deleteChatGroup(channel.id);
        setChatChannels((channels) => channels.filter((item) => item.id !== channel.id));
        setChatMessages((messages) => messages.filter((message) => message.channelId !== channel.id));
        if (selectedChannelId === channel.id) setSelectedChannelId("");
        if (editingChatGroupId === channel.id) {
          setEditingChatGroupId("");
          setChatGroupNameDraft("");
        }
        setChatStatus(`Deleted ${channel.name}.`);
      } catch (error) {
        setChatStatus(error instanceof Error ? error.message : "Could not delete this group.");
      }
    });
  }

  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentUser || !canManagePeople || !projectDraft.name.trim()) return;
    const department = currentUser.role === "admin" ? currentUser.department : projectDraft.department;
    try {
      await api.createProject({ ...projectDraft, name: projectDraft.name.trim(), department });
      setProjectDraft({ name: "", description: "", department, memberIds: [] });
      setProjectMessage("Project created successfully.");
      await refreshData(true);
    } catch (error) {
      setProjectMessage(error instanceof Error ? error.message : "Could not create this project.");
    }
  }

  async function saveProjectMembers(project: Project) {
    const memberIds = projectMemberDrafts[project.id] ?? project.members.map((member) => member.id);
    try {
      await api.updateProject(project.id, { name: project.name, description: project.description, memberIds });
      setProjectMessage(`Updated members for ${project.name}.`);
      await refreshData(true);
    } catch (error) {
      setProjectMessage(error instanceof Error ? error.message : "Could not update project members.");
    }
  }

  async function importProjectSheet(project: Project, file: File | undefined) {
    if (!file) return;
    try {
      const result = await api.importProjectTasks(project.id, file);
      setProjectMessage(`Imported ${result.imported} task(s) into ${project.name}.`);
      await refreshData(true);
    } catch (error) {
      setProjectMessage(error instanceof Error ? error.message : "Could not import this task sheet.");
    }
  }

  async function exportProjectSheet(project: Project) {
    try {
      await api.downloadProjectTaskTemplate(project.id, project.name);
      setProjectMessage(`Editable task-sheet template downloaded for ${project.name}.`);
    } catch (error) {
      setProjectMessage(error instanceof Error ? error.message : "Could not export this task sheet.");
    }
  }

  function deleteProject(project: Project) {
    requestConfirmation(`Are you sure you want to delete project "${project.name}"? Its tasks will remain without a project.`, async () => {
      try {
        await api.deleteProject(project.id);
        setProjectMessage(`${project.name} was deleted.`);
        await refreshData(true);
      } catch (error) {
        setProjectMessage(error instanceof Error ? error.message : "Could not delete this project.");
      }
    });
  }

  function renderTaskCard(task: ManagedTask, view: "department" | "mine" = "department") {
    const isEditingTask = editingTaskId === task.id && taskEditDraft;
    const canDeleteTask = canManageTask(task);
    const canEditTask = canDeleteTask && task.status !== "done";
    const canClaimTask =
      currentUser?.role === "user" &&
      task.department === currentUser.department &&
      !task.assigneeIds.length &&
      task.status === "new";
    const canSubmitForReview =
      currentUser?.role === "user" &&
      task.assigneeIds.includes(currentUser.id) &&
      !task.workerApprovals.some((approval) => approval.id === currentUser.id) &&
      task.status !== "done" &&
      task.status !== "under_review";
    const canReviewTask = canEditTask && task.status === "under_review";
    const taskEditProject = projects.find((project) => project.id === taskEditDraft?.projectId);
    const taskAssignableUsers = assignableUsers.filter((user) => taskEditProject
      ? taskEditProject.members.some((member) => member.id === user.id)
      : user.department === (taskEditDraft?.department ?? task.department));

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
              <select
                onChange={(event) => {
                  const project = projects.find((item) => item.id === event.target.value);
                  setTaskEditDraft({
                    ...taskEditDraft,
                    projectId: project?.id,
                    projectName: project?.name,
                    department: project?.department ?? taskEditDraft.department,
                    assigneeId: undefined,
                    assigneeIds: [],
                    candidateName: "Unassigned",
                    candidateNames: []
                  });
                }}
                value={taskEditDraft.projectId ?? ""}
              >
                <option value="">No project</option>
                {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
              </select>
              {currentUser?.role === "superadmin" ? (
                <select
                  disabled={Boolean(taskEditDraft.projectId)}
                  onChange={(event) => {
                    const department = event.target.value as DepartmentName;

                    setTaskEditDraft({
                      ...taskEditDraft,
                      department,
                      assigneeId: undefined,
                      assigneeIds: [],
                      candidateName: "Unassigned",
                      candidateNames: []
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
                multiple
                onChange={(event) => {
                  const assigneeIds = Array.from(event.target.selectedOptions).map((option) => option.value);
                  const assignees = users.filter((user) => assigneeIds.includes(user.id));

                  setTaskEditDraft({
                    ...taskEditDraft,
                    assigneeId: assigneeIds[0],
                    assigneeIds,
                    candidateName: assignees.map((assignee) => assignee.name).join(", ") || "Unassigned",
                    candidateNames: assignees.map((assignee) => assignee.name)
                  });
                }}
                size={Math.min(5, Math.max(2, taskAssignableUsers.length))}
                value={taskEditDraft.assigneeIds}
              >
                {taskAssignableUsers.map((user) => (
                  <option key={user.id} value={user.id}>{user.name}</option>
                ))}
              </select>
              <select onChange={(event) => setTaskEditDraft({ ...taskEditDraft, taskType: event.target.value as TaskType })} value={taskEditDraft.taskType}>
                {taskTypes.map((type) => <option key={type} value={type}>{type}</option>)}
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
                <div className="task-title-line"><span className="task-code">Task #{task.taskCode}</span><strong>{task.title}</strong></div>
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
                <span>{task.taskType}</span>
                {task.projectName ? <span>Project: {task.projectName}</span> : null}
                <span>Assigned: {task.candidateName ?? "Unassigned"}</span>
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
                      Approve Work
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

        {task.status === "under_review" && currentUser && task.assigneeIds.includes(currentUser.id) ? (
          <p className="review-note">All assigned workers approved. Waiting for admin approval.</p>
        ) : null}

        {task.status !== "done" && task.status !== "under_review" && task.workerApprovals.length ? (
          <p className="worker-approval-note">
            {currentUser && task.workerApprovals.some((approval) => approval.id === currentUser.id)
              ? `You approved this task. Waiting for ${task.pendingApprovalNames.join(", ")}.`
              : `${task.workerApprovals.map((approval) => approval.name).join(", ")} approved. Waiting for ${task.pendingApprovalNames.join(", ")}.`}
          </p>
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
              <strong>Task Chat</strong>
            </div>
            <div className="task-message-list" tabIndex={0} aria-label={`Comments for Task ${task.taskCode}`}>
              {task.messages.length ? task.messages.map((message) => (
                  <p key={message.id}>
                    <strong style={{ color: identityColor(message.authorId, currentUser?.id) }}>{message.authorName}</strong> {message.body}
                    <span>{message.createdAt}</span>
                  </p>
                )) : <p>No comments yet.</p>}
            </div>
            {task.status !== "done" ? (
              <>
                <div className="emoji-picker" aria-label="Quick emojis">
                  {quickEmojis.map((emoji) => (
                    <button key={emoji} type="button" onClick={() => setMessageDrafts((drafts) => ({ ...drafts, [task.id]: `${drafts[task.id] ?? ""}${emoji}` }))} aria-label={`Add ${emoji}`}>{emoji}</button>
                  ))}
                </div>
                <div className="chat-form">
                  <input
                    className={messageDrafts[task.id] ? "typing-input" : ""}
                    onChange={(event) =>
                      setMessageDrafts((drafts) => ({ ...drafts, [task.id]: event.target.value }))
                    }
                    placeholder="Add a comment"
                    value={messageDrafts[task.id] ?? ""}
                  />
                  <button type="button" className="icon-button" onClick={() => addTaskMessage(task)} aria-label="Send comment">
                    <Plus aria-hidden="true" size={16} />
                  </button>
                </div>
              </>
            ) : <small className="locked-note">Approved task: comments are read-only.</small>}
          </div>

          <div className="task-files">
            <div className="collab-heading">
              <Paperclip aria-hidden="true" size={16} />
              <strong>Task Documents</strong>
            </div>
            {task.files.length ? (
              task.files.map((file) => (
                <button
                  className="file-download"
                  key={file.id}
                  onClick={() => downloadTaskFile(file)}
                  title={`Download ${file.name}`}
                  type="button"
                >
                  <span>
                    <strong>{file.name}</strong>
                    <small>{file.uploadedBy} - {file.uploadedAt} - {formatFileSize(file.size)}</small>
                  </span>
                  <Download aria-hidden="true" size={16} />
                </button>
              ))
            ) : (
              <p>No files added.</p>
            )}
            {task.status !== "done" ? (
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
            ) : <small className="locked-note">Approved task: documents are download-only.</small>}
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
    return (
      <LoginPage
        darkMode={darkMode}
        error={loginError}
        onLogin={handleLogin}
        onToggleTheme={toggleTheme}
      />
    );
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
            <Gauge aria-hidden="true" size={17} />
            Dashboard
          </button>
          <button
            type="button"
            className={`sidebar-nav-button ${activeView === "tasks" ? "active" : ""}`}
            onClick={() => setActiveView("tasks")}
          >
            <ClipboardList aria-hidden="true" size={17} />
            Active Tasks
            <span>{activeTasks.length}</span>
          </button>
          <button
            type="button"
            className={`sidebar-nav-button ${activeView === "todos" ? "active" : ""}`}
            onClick={() => setActiveView("todos")}
          >
            <ListTodo aria-hidden="true" size={17} />
            My TODOs
            <span>{openTodos.length}</span>
          </button>
          <button
            type="button"
            className={`sidebar-nav-button ${activeView === "projects" ? "active" : ""}`}
            onClick={() => setActiveView("projects")}
          >
            <FolderKanban aria-hidden="true" size={17} />
            Projects
            <span>{projects.length}</span>
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
          <button
            type="button"
            className={`sidebar-nav-button ${activeView === "chat" ? "active" : ""}`}
            onClick={() => void openDepartmentChat()}
          >
            <MessageSquare aria-hidden="true" size={17} />
            Department Chat
            <span>{chatChannels.length}</span>
          </button>
          <button
            type="button"
            className={`sidebar-nav-button ${activeView === "people" ? "active" : ""}`}
            onClick={() => setActiveView("people")}
          >
            <Users aria-hidden="true" size={17} />
            People
            <span>{visibleUsers.length}</span>
          </button>
          <button
            type="button"
            className={`sidebar-nav-button ${activeView === "team" ? "active" : ""}`}
            onClick={() => setActiveView("team")}
          >
            <Users aria-hidden="true" size={17} />
            Team
            <span>{teamCandidates.length}</span>
          </button>
          {canManagePeople ? (
            <button
              type="button"
              className={`sidebar-nav-button ${activeView === "productivity" ? "active" : ""}`}
              onClick={() => setActiveView("productivity")}
            >
              <FileSpreadsheet aria-hidden="true" size={17} />
              Productivity
            </button>
          ) : null}
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
            <button
              aria-label={`Switch to ${darkMode ? "light" : "dark"} mode`}
              aria-pressed={darkMode}
              className="theme-toggle"
              onClick={toggleTheme}
              type="button"
            >
              {darkMode ? <Sun aria-hidden="true" size={18} /> : <Moon aria-hidden="true" size={18} />}
              <span>{darkMode ? "Light mode" : "Dark mode"}</span>
            </button>
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
            {currentUser.role === "superadmin" ? (
              <section className="panel command-panel department-panel">
                <div className="panel-header">
                  <div>
                    <p>Organization structure</p>
                    <h2>Create Department</h2>
                  </div>
                  <Building2 aria-hidden="true" />
                </div>
                <form className="person-form" onSubmit={handleCreateDepartment}>
                  <label>
                    Department name
                    <input
                      aria-label="Department name"
                      onChange={(event) => setDepartmentDraft(event.target.value)}
                      value={departmentDraft}
                    />
                  </label>
                  <button type="submit" className="primary-button">
                    <Plus aria-hidden="true" size={18} />
                    Create Department
                  </button>
                </form>
                <div className="department-list" aria-label="Available departments">
                  {departments.map((department) => <span key={department}>{department}</span>)}
                </div>
                {departmentMessage ? <p className="success-message">{departmentMessage}</p> : null}
              </section>
            ) : null}

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
                      const project = projects.find((item) => item.id === event.target.value);
                      setTaskDraft((draft) => ({
                        ...draft,
                        projectId: project?.id ?? "",
                        department: project?.department ?? draft.department,
                        assigneeIds: []
                      }));
                    }}
                    value={taskDraft.projectId}
                  >
                    <option value="">No project</option>
                    {projects.map((project) => <option key={project.id} value={project.id}>{project.name} - {project.department}</option>)}
                  </select>
                  {currentUser.role === "superadmin" && !taskDraft.projectId ? (
                    <select
                      onChange={(event) =>
                        setTaskDraft((draft) => ({
                          ...draft,
                          department: event.target.value as DepartmentName,
                          assigneeIds: []
                        }))
                      }
                      value={taskDraft.department}
                    >
                      {departments.map((department) => (
                        <option key={department} value={department}>{department}</option>
                      ))}
                    </select>
                  ) : null}
                  <label className="multi-select-field">
                    Assign one or more people
                    <select
                      multiple
                      onChange={(event) => setTaskDraft((draft) => ({
                        ...draft,
                        assigneeIds: Array.from(event.target.selectedOptions).map((option) => option.value)
                      }))}
                      size={Math.min(6, Math.max(2, taskDraftAssignableUsers.length))}
                      value={taskDraft.assigneeIds}
                    >
                      {taskDraftAssignableUsers.map((user) => (
                        <option key={user.id} value={user.id}>{user.name} - {user.department}</option>
                      ))}
                    </select>
                  </label>
                  <select onChange={(event) => setTaskDraft((draft) => ({ ...draft, taskType: event.target.value as TaskType }))} value={taskDraft.taskType}>
                    {taskTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                  </select>
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
                  <label className="file-upload task-create-files">
                    <Paperclip aria-hidden="true" size={16} />
                    Add task documents
                    <input
                      multiple
                      onChange={(event) => setTaskFiles(Array.from(event.target.files ?? []))}
                      type="file"
                    />
                  </label>
                  {taskFiles.length ? (
                    <p className="selected-files">
                      {taskFiles.map((file) => file.name).join(", ")}
                    </p>
                  ) : null}
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

            {canManagePeople ? (
              <div className="report-controls">
                <div>
                  <FileSpreadsheet aria-hidden="true" size={20} />
                  <span>
                    <strong>Productivity report</strong>
                    <small>Download an Excel report for a selected normal user.</small>
                  </span>
                </div>
                <select onChange={(event) => setReportUserId(event.target.value)} value={reportUserId}>
                  {assignableUsers.length ? assignableUsers.map((user) => (
                    <option key={user.id} value={user.id}>{user.name} - {user.department}</option>
                  )) : <option value="">No normal users available</option>}
                </select>
                <button
                  className="primary-button"
                  disabled={!reportUserId}
                  onClick={() => downloadProductivityReport()}
                  type="button"
                >
                  <Download aria-hidden="true" size={17} />
                  Download Excel
                </button>
              </div>
            ) : null}

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
        </section> : activeView === "todos" ? (
          <section className="panel page-panel todo-page" id="todos-page">
            <div className="panel-header">
              <div><p>Personal checklist for {currentUser.name}</p><h2>My TODO List</h2></div>
              <strong className="result-count">{openTodos.length} open</strong>
            </div>

            <div className="todo-summary">
              <div>
                <span>{todoProgress}% complete</span>
                <small>{completedTodos.length} of {todos.length} items finished</small>
              </div>
              <div className="task-progress" aria-label={`${todoProgress}% of TODO items complete`}>
                <span style={{ width: `${todoProgress}%` }} />
              </div>
            </div>

            <form className="todo-create-form" onSubmit={createTodo}>
              <input
                aria-label="TODO item"
                maxLength={240}
                onChange={(event) => setTodoDraft((draft) => ({ ...draft, title: event.target.value }))}
                placeholder="What needs to be done?"
                value={todoDraft.title}
              />
              <select
                aria-label="Link TODO to a task"
                onChange={(event) => setTodoDraft((draft) => ({ ...draft, taskId: event.target.value }))}
                value={todoDraft.taskId}
              >
                <option value="">No linked task</option>
                {todoLinkableTasks.map((task) => (
                  <option key={task.id} value={task.id}>{task.taskCode} — {task.title}</option>
                ))}
              </select>
              <button className="primary-button" type="submit"><Plus aria-hidden="true" size={17} />Add TODO</button>
            </form>
            {todoMessage ? <p className="success-message">{todoMessage}</p> : null}

            <div className="todo-toolbar" aria-label="Filter TODO items">
              {(["all", "open", "completed"] as const).map((filter) => (
                <button
                  className={todoFilter === filter ? "active" : ""}
                  key={filter}
                  onClick={() => setTodoFilter(filter)}
                  type="button"
                >
                  {filter === "all" ? `All (${todos.length})` : filter === "open" ? `Open (${openTodos.length})` : `Completed (${completedTodos.length})`}
                </button>
              ))}
            </div>

            <div className="todo-list">
              {filteredTodos.length ? filteredTodos.map((todo) => (
                <article className={`todo-item ${todo.completed ? "completed" : ""}`} key={todo.id}>
                  <button
                    aria-label={todo.completed ? `Reopen ${todo.title}` : `Complete ${todo.title}`}
                    aria-pressed={todo.completed}
                    className="todo-check"
                    onClick={() => void toggleTodo(todo)}
                    type="button"
                  >
                    {todo.completed ? <CheckCircle2 aria-hidden="true" size={21} /> : <span />}
                  </button>
                  <div>
                    <strong>{todo.title}</strong>
                    <small>{todo.completedAt ? `Completed ${todo.completedAt}` : `Added ${todo.createdAt}`}</small>
                    {todo.taskId ? (
                      <button className="todo-task-link" onClick={() => setActiveView("tasks")} type="button">
                        <ClipboardList aria-hidden="true" size={14} />
                        {todo.taskCode ?? "Task"}: {todo.taskTitle ?? "Linked task"}
                      </button>
                    ) : null}
                  </div>
                  <button className="icon-button danger" onClick={() => deleteTodo(todo)} type="button" aria-label={`Delete ${todo.title}`}>
                    <Trash2 aria-hidden="true" size={16} />
                  </button>
                </article>
              )) : <p className="empty-state">No TODO items match this filter.</p>}
            </div>
          </section>
        ) : activeView === "projects" ? (
          <section className="panel page-panel" id="projects-page">
            <div className="panel-header">
              <div><p>Project teams and task-sheet intake</p><h2>Projects</h2></div>
              <strong className="result-count">{projects.length} projects</strong>
            </div>
            {canManagePeople ? (
              <form className="project-create-form" onSubmit={createProject}>
                <input placeholder="Project name" value={projectDraft.name} onChange={(event) => setProjectDraft((draft) => ({ ...draft, name: event.target.value }))} />
                <input placeholder="Short description" value={projectDraft.description} onChange={(event) => setProjectDraft((draft) => ({ ...draft, description: event.target.value }))} />
                {currentUser.role === "superadmin" ? (
                  <select value={projectDraft.department} onChange={(event) => setProjectDraft((draft) => ({ ...draft, department: event.target.value as DepartmentName, memberIds: [] }))}>
                    {departments.map((department) => <option key={department} value={department}>{department}</option>)}
                  </select>
                ) : <input readOnly value={currentUser.department} />}
                <label className="multi-select-field">Project members
                  <select multiple size={4} value={projectDraft.memberIds} onChange={(event) => setProjectDraft((draft) => ({ ...draft, memberIds: Array.from(event.target.selectedOptions).map((option) => option.value) }))}>
                    {assignableUsers.filter((user) => user.department === (currentUser.role === "admin" ? currentUser.department : projectDraft.department)).map((user) => (
                      <option key={user.id} value={user.id}>{user.name}</option>
                    ))}
                  </select>
                </label>
                <button className="primary-button" type="submit"><Plus aria-hidden="true" size={17} />Create Project</button>
              </form>
            ) : null}
            {projectMessage ? <p className="success-message">{projectMessage}</p> : null}
            <div className="projects-grid">
              {projects.length ? projects.map((project) => {
                const eligibleMembers = assignableUsers.filter((user) => user.department === project.department);
                const memberIds = projectMemberDrafts[project.id] ?? project.members.map((member) => member.id);
                return (
                  <article className="project-card" key={project.id}>
                    <div className="member-heading"><div><strong>{project.name}</strong><p>{project.department}</p></div><span>{project.taskCount} tasks</span></div>
                    <p>{project.description || "No description."}</p>
                    <div className="project-members"><strong>Members</strong><span>{project.members.map((member) => member.name).join(", ") || "No members yet"}</span></div>
                    {canManagePeople ? (
                      <>
                        <label className="multi-select-field">Manage members
                          <select multiple size={Math.min(6, Math.max(2, eligibleMembers.length))} value={memberIds} onChange={(event) => setProjectMemberDrafts((drafts) => ({ ...drafts, [project.id]: Array.from(event.target.selectedOptions).map((option) => option.value) }))}>
                            {eligibleMembers.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
                          </select>
                        </label>
                        <div className="project-actions">
                          <button className="ghost-button" type="button" onClick={() => saveProjectMembers(project)}><Save aria-hidden="true" size={16} />Save Members</button>
                          <button className="ghost-button" type="button" onClick={() => exportProjectSheet(project)}><Download aria-hidden="true" size={16} />Export Task Sheet</button>
                          <label className="file-upload"><Upload aria-hidden="true" size={16} />Import Task Sheet
                            <input accept=".xlsx,.csv" type="file" onChange={(event) => { void importProjectSheet(project, event.target.files?.[0]); event.target.value = ""; }} />
                          </label>
                          <button className="icon-button danger" type="button" onClick={() => deleteProject(project)} aria-label={`Delete ${project.name}`}><Trash2 aria-hidden="true" size={16} /></button>
                        </div>
                        <small className="import-hint">Columns: Task, Priority, Due Date, Progress, Task Type, Assignees (name or username).</small>
                      </>
                    ) : null}
                  </article>
                );
              }) : <p className="empty-state">No projects are available yet.</p>}
            </div>
          </section>
        ) : activeView === "tasks" ? (
          <section className="panel page-panel" id="active-tasks-page">
            <div className="panel-header">
              <div>
                <p>{currentUser.role === "superadmin" ? "All departments" : currentUser.department}</p>
                <h2>Active Tasks</h2>
              </div>
              <strong className="result-count">{activeTasks.length} active</strong>
            </div>
            <div className="task-list">
              {activeTasks.length ? activeTasks.map((task) => renderTaskCard(task)) : (
                <p className="empty-state">No active tasks match your access.</p>
              )}
            </div>
          </section>
        ) : activeView === "people" ? (
          <section className="panel page-panel" id="people-page">
            <div className="panel-header">
              <div>
                <p>{currentUser.role === "superadmin" ? "Organization directory" : currentUser.department}</p>
                <h2>People</h2>
              </div>
              <strong className="result-count">{visibleUsers.length} people</strong>
            </div>
            <div className="directory-grid">
              {visibleUsers.map((user) => {
                const metrics = user.role === "user" ? userMetrics(user.id) : null;
                return (
                  <article className="directory-card" key={`people-${user.id}`}>
                    <div className="member-heading">
                      <div><strong>{user.name}</strong><p>{user.username}</p></div>
                      <span>{roleLabels[user.role]}</span>
                    </div>
                    <div className="user-line">
                      <span>{user.department}</span>
                      {metrics ? <span>{metrics.active} active tasks</span> : <span>Management access</span>}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ) : activeView === "team" ? (
          <section className="panel page-panel" id="team-page">
            <div className="panel-header">
              <div>
                <p>Department capacity and monthly delivery</p>
                <h2>Team</h2>
              </div>
            </div>
            <div className="analytics-filters compact-filters">
              {currentUser.role === "superadmin" ? (
                <label>Department<select value={teamDepartment} onChange={(event) => setTeamDepartment(event.target.value)}>
                  <option value="">All departments</option>
                  {departments.map((department) => <option key={department} value={department}>{department}</option>)}
                </select></label>
              ) : null}
              <label>Completion month<input type="month" value={teamMonth} onChange={(event) => setTeamMonth(event.target.value)} /></label>
            </div>
            <div className="department-groups">
              {departments
                .filter((department) => currentUser.role === "superadmin"
                  ? !teamDepartment || department === teamDepartment
                  : department === currentUser.department)
                .map((department) => {
                  const candidates = teamCandidates.filter((user) => user.department === department);
                  return (
                    <section className="department-group" key={department}>
                      <div className="department-heading"><h3>{department}</h3><span>{candidates.length} candidates</span></div>
                      <div className="team-table-wrap"><table className="analytics-table">
                        <thead><tr><th>Candidate</th><th>Active now</th><th>Total assigned</th><th>Finished in month</th><th>Avg. cycle time</th><th>On time</th><th>Report</th></tr></thead>
                        <tbody>{candidates.length ? candidates.map((user) => {
                          const metrics = userMetrics(user.id);
                          return <tr key={`team-${user.id}`}><td><strong>{user.name}</strong><small>{user.username}</small></td><td>{metrics.active}</td><td>{metrics.assigned}</td><td>{metrics.completedInMonth}</td><td>{metrics.completed ? `${metrics.averageCompletionDays.toFixed(1)} days` : "—"}</td><td>{metrics.completed ? `${Math.round(metrics.onTimeRate * 100)}%` : "—"}</td><td><button className="icon-button" type="button" onClick={() => downloadProductivityReport(user.id, teamMonth)} title={`Download ${teamMonth} report`}><Download aria-hidden="true" size={15} /></button></td></tr>;
                        }) : <tr><td colSpan={7}>No normal users in this department.</td></tr>}</tbody>
                      </table></div>
                    </section>
                  );
                })}
            </div>
          </section>
        ) : activeView === "productivity" ? (
          <section className="panel page-panel" id="productivity-page">
            <div className="panel-header">
              <div><p>Normal-user delivery intelligence</p><h2>Productivity</h2></div>
            </div>
            <div className="analytics-filters compact-filters">
              <label>Analysis month<input type="month" value={productivityMonth} onChange={(event) => setProductivityMonth(event.target.value)} /></label>
              <button className="ghost-button" type="button" onClick={() => setProductivityMonth("")}>All time</button>
            </div>
            <div className="productivity-grid">
              {productivityCandidates.map((user) => {
                const metrics = userMetrics(user.id, productivityMonth);
                return (
                  <article className="productivity-card" key={`productivity-${user.id}`}>
                    <div className="member-heading"><div><strong>{user.name}</strong><p>{user.department}</p></div><span>{metrics.completed}/{metrics.assigned} done</span></div>
                    <div className="metric-grid">
                      <span><strong>{metrics.completed ? metrics.averageCompletionDays.toFixed(1) : "—"}</strong>Avg. days/task</span>
                      <span><strong>{Math.round(metrics.completionRate * 100)}%</strong>Completion rate</span>
                      <span><strong>{metrics.completed ? `${Math.round(metrics.onTimeRate * 100)}%` : "—"}</strong>On-time rate</span>
                      <span><strong>{metrics.overdue}</strong>Overdue</span>
                      <span><strong>{metrics.averageProgress}%</strong>Avg. progress</span>
                      <span><strong>{metrics.active}</strong>Active now</span>
                    </div>
                    <button className="ghost-button" type="button" onClick={() => downloadProductivityReport(user.id, productivityMonth)}>
                      <Download aria-hidden="true" size={16} /> Download {productivityMonth || "All-time"} Excel
                    </button>
                  </article>
                );
              })}
            </div>
            {peopleMessage ? <p className="success-message">{peopleMessage}</p> : null}
          </section>
        ) : activeView === "chat" ? (
          <section className="panel chat-panel" id="department-chat">
            <div className="panel-header">
              <div>
                <p>{selectedChatChannel?.department ?? currentUser.department}</p>
                <h2>{selectedChatChannel?.name ?? "Department Chat"}</h2>
              </div>
              {canManagePeople ? (
                <div className="chat-management-actions">
                  {selectedChatChannel?.isGroup && currentUser.role === "superadmin" ? (
                    <button
                      className="icon-button"
                      onClick={() => {
                        setEditingChatGroupId(selectedChatChannel.id);
                        setChatGroupNameDraft(selectedChatChannel.name);
                      }}
                      type="button"
                      aria-label={`Edit ${selectedChatChannel.name}`}
                      title="Edit group name"
                    >
                      <Edit3 aria-hidden="true" size={16} />
                    </button>
                  ) : null}
                  {selectedChatChannel && canDeleteSelectedChatGroup ? (
                    <button
                      className="icon-button danger"
                      onClick={() => deleteChatGroup(selectedChatChannel)}
                      type="button"
                      aria-label={`Delete ${selectedChatChannel.name}`}
                      title="Delete group chat"
                    >
                      <Trash2 aria-hidden="true" size={16} />
                    </button>
                  ) : null}
                  <button
                    className="ghost-button"
                    onClick={() => setShowGroupForm((visible) => !visible)}
                    type="button"
                  >
                    <Plus aria-hidden="true" size={17} />
                    Create Group
                  </button>
                </div>
              ) : null}
            </div>

            {selectedChatChannel?.isGroup && editingChatGroupId === selectedChatChannel.id && currentUser.role === "superadmin" ? (
              <form className="chat-edit-form" onSubmit={saveChatGroup}>
                <input
                  autoFocus
                  maxLength={80}
                  onChange={(event) => setChatGroupNameDraft(event.target.value)}
                  value={chatGroupNameDraft}
                  aria-label="Group chat name"
                />
                <button className="primary-button" type="submit"><Save aria-hidden="true" size={16} />Save Name</button>
                <button className="ghost-button" onClick={() => {
                  setEditingChatGroupId("");
                  setChatGroupNameDraft("");
                }} type="button">Cancel</button>
              </form>
            ) : null}

            {showGroupForm && canManagePeople ? (
              <form className="chat-group-form" onSubmit={createChatGroup}>
                <input
                  onChange={(event) => setGroupDraft((draft) => ({ ...draft, name: event.target.value }))}
                  placeholder="Group name"
                  value={groupDraft.name}
                />
                {currentUser.role === "superadmin" ? (
                  <select
                    onChange={(event) => setGroupDraft((draft) => ({
                      ...draft,
                      department: event.target.value as DepartmentName
                    }))}
                    value={groupDraft.department}
                  >
                    {departments.map((department) => (
                      <option key={department} value={department}>{department}</option>
                    ))}
                  </select>
                ) : (
                  <input readOnly value={currentUser.department} />
                )}
                <button className="primary-button" type="submit">
                  <Users aria-hidden="true" size={17} />
                  Create for Department
                </button>
              </form>
            ) : null}

            <div className="chat-layout">
              <aside className="chat-channel-list" aria-label="Chat channels">
                {chatChannels.map((channel) => (
                  <button
                    className={channel.id === selectedChannelId ? "active" : ""}
                    key={channel.id}
                    onClick={() => setSelectedChannelId(channel.id)}
                    type="button"
                  >
                    <MessageSquare aria-hidden="true" size={16} />
                    <span>
                      <strong>{channel.name}</strong>
                      <small>{channel.department}{channel.isGroup ? " · Group" : ""}</small>
                    </span>
                  </button>
                ))}
              </aside>

              <div className="chat-room">
                <div className="chat-message-list" aria-live="polite">
                  {selectedChatMessages.length ? selectedChatMessages.map((message) => (
                    <article
                      className={message.authorId === currentUser.id ? "chat-message mine" : "chat-message"}
                      key={message.id}
                    >
                      <div>
                        <strong style={{ color: identityColor(message.authorId, currentUser.id) }}>{message.authorName}</strong>
                        <span>{message.createdAt}</span>
                      </div>
                      <p>{message.body}</p>
                    </article>
                  )) : (
                    <p className="empty-state">No messages yet. Say hello to your department.</p>
                  )}
                </div>
                <form className="chat-compose" onSubmit={sendDepartmentMessage}>
                  <div className="emoji-picker department-emojis" aria-label="Quick emojis">
                    {quickEmojis.map((emoji) => (
                      <button key={emoji} type="button" onClick={() => setChatDraft((draft) => `${draft}${emoji}`)} aria-label={`Add ${emoji}`}>{emoji}</button>
                    ))}
                  </div>
                  <input
                    className={chatDraft ? "typing-input" : ""}
                    disabled={!selectedChannelId}
                    maxLength={2000}
                    onChange={(event) => setChatDraft(event.target.value)}
                    placeholder="Write a message"
                    value={chatDraft}
                  />
                  <button className="primary-button" disabled={!selectedChannelId || !chatDraft.trim()} type="submit">
                    Send
                  </button>
                </form>
              </div>
            </div>
            {chatStatus ? <p className="success-message">{chatStatus}</p> : null}
          </section>
        ) : (
          <section className="panel finished-panel" id="finished-tasks">
            <div className="panel-header">
              <div>
                <p>Searchable task history</p>
                <h2>Finished Tasks & Explorer</h2>
              </div>
              <strong className="result-count">{filteredArchiveTasks.length} of {visibleTasks.length}</strong>
            </div>
            <div className="analytics-filters archive-filters">
              <label>Status<select value={archiveFilters.status} onChange={(event) => setArchiveFilters((filters) => ({ ...filters, status: event.target.value as "" | TaskStatus }))}>
                <option value="">All statuses</option>
                {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select></label>
              <label>Priority<select value={archiveFilters.priority} onChange={(event) => setArchiveFilters((filters) => ({ ...filters, priority: event.target.value as "" | TaskPriority }))}>
                <option value="">All priorities</option>
                {Object.entries(priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select></label>
              <label>Assigned person<select value={archiveFilters.assigneeId} onChange={(event) => setArchiveFilters((filters) => ({ ...filters, assigneeId: event.target.value }))}>
                <option value="">All candidates</option>
                {productivityCandidates.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
              </select></label>
              <label>From<input type="date" value={archiveFilters.from} onChange={(event) => setArchiveFilters((filters) => ({ ...filters, from: event.target.value }))} /></label>
              <label>To<input type="date" value={archiveFilters.to} onChange={(event) => setArchiveFilters((filters) => ({ ...filters, to: event.target.value }))} /></label>
              <button className="ghost-button" type="button" onClick={() => setArchiveFilters({ from: "", to: "", assigneeId: "", priority: "", status: "done" })}>Reset filters</button>
            </div>
            <div className="task-list">
              {filteredArchiveTasks.length ? filteredArchiveTasks.map((task) => renderTaskCard(task)) : (
                <p className="empty-state">No tasks match these filters.</p>
              )}
            </div>
          </section>
        )}
      </section>
      {confirmation ? (
        <div className="confirmation-backdrop" role="presentation" onMouseDown={() => setConfirmation(null)}>
          <section className="confirmation-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-confirmation-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="confirmation-icon"><AlertTriangle aria-hidden="true" size={24} /></div>
            <h2 id="delete-confirmation-title">Confirm deletion</h2>
            <p>{confirmation.message}</p>
            <div className="confirmation-actions">
              <button className="ghost-button" type="button" onClick={() => setConfirmation(null)}>Cancel</button>
              <button className="danger-button" type="button" onClick={() => {
                const action = confirmation.onConfirm;
                setConfirmation(null);
                void action();
              }}>Yes, delete</button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
