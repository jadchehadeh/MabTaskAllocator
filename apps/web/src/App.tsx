import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Archive,
  Bell,
  Building2,
  Calendar,
  CheckCircle2,
  ClipboardList,
  CornerUpLeft,
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
  Search,
  ShieldCheck,
  Sparkles,
  Sun,
  Trophy,
  Trash2,
  Upload,
  UserPlus,
  Users,
  X
} from "lucide-react";
import type { AppUser, DepartmentName, TaskPriority, TaskStatus, TaskType, UserRole } from "@mab/shared";
import { api, getLastActivity, hasSession, inactivityLimitMs, markActivity } from "./api";
import type { AppNotification, AttendanceProfile, ChatChannel, ChatMessage, ChatMessageFile, ManagedTask, PerformanceTask, Project, TodoItem } from "./api";
import { StatCard } from "./components/StatCard";

const mabLogo = "/mab-logo.jpeg";

const defaultDepartments: DepartmentName[] = [
  "Mechanical Technical office engineer",
  "Electrical Technical office engineer",
  "Document Controller"
];

const taskTypes: TaskType[] = ["Technical", "QS", "Shop Drawings", "BIM", "Variation"];
const complexityLabels = ["", "Very low", "Low", "Moderate", "High", "Very high"];
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

const viewTitles = {
  dashboard: "Command Center",
  projects: "Projects",
  tasks: "Active Tasks",
  todos: "My TODOs",
  finished: "Finished Tasks",
  people: "People Directory",
  team: "Team Performance",
  productivity: "Productivity",
  achievements: "Achievements",
  attendance: "Attendance",
  chat: "Department Chat"
} as const;

function clampProgress(progress: number) {
  return Math.min(100, Math.max(0, progress));
}

function complexityPoints(task: Pick<ManagedTask, "complexity">) {
  return Math.min(5, Math.max(1, Math.round(Number(task.complexity) || 3)));
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
    return (firstTask.dueDate || "9999-12-31").localeCompare(secondTask.dueDate || "9999-12-31");
  });
}

function formatFileSize(size: number) {
  if (!size) return "Stored file";
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function chatDayLabel(message: Pick<ChatMessage, "createdAt">) {
  return message.createdAt.split(",")[0]?.trim() ?? "";
}

function chatTimeLabel(message: Pick<ChatMessage, "createdAt">) {
  return message.createdAt.split(",")[1]?.trim() ?? message.createdAt;
}

function relativeChatDayLabel(dayLabel: string) {
  const now = new Date();
  const todayLabel = now.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayLabel = yesterday.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  if (dayLabel === todayLabel) return "Today";
  if (dayLabel === yesterdayLabel) return "Yesterday";
  return dayLabel;
}

function completionDays(task: Pick<PerformanceTask, "completedAtIso" | "startedAt" | "createdAt">) {
  if (!task.completedAtIso) return null;
  const duration = (new Date(task.completedAtIso).getTime() - new Date(task.startedAt ?? task.createdAt).getTime()) / 86_400_000;
  return Number.isFinite(duration) && duration >= 0 ? duration : null;
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((first, second) => first - second);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function currentRiyadhDate() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function identityColor(id?: string | null, currentUserId?: string) {
  const safeId = id || "unknown-user";
  if (safeId === currentUserId) return "#1178b8";
  const colors = ["#7c3aed", "#c2410c", "#047857", "#be185d", "#0369a1", "#a16207"];
  const hash = [...safeId].reduce((total, character) => total + character.charCodeAt(0), 0);
  return colors[hash % colors.length];
}

function sameDepartment(first?: string | null, second?: string | null) {
  return String(first ?? "").trim().toLocaleLowerCase() === String(second ?? "").trim().toLocaleLowerCase();
}

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "?";
}

function renderMentionedText(body: string, currentUserName: string) {
  return body.split(/(@\[[^\]]+\])/g).map((part, index) => {
    const match = part.match(/^@\[([^\]]+)\]$/);
    if (!match) return part;
    const isCurrentUser = match[1].toLocaleLowerCase() === currentUserName.toLocaleLowerCase();
    return <mark className={`chat-mention ${isCurrentUser ? "mine" : ""}`} key={`${part}-${index}`}>@{match[1]}</mark>;
  });
}

function isTaskOverdue(task: Pick<ManagedTask, "dueDate" | "status">) {
  return Boolean(task.dueDate && task.status !== "done" && task.dueDate < new Date().toISOString().slice(0, 10));
}

interface CandidatePickerProps {
  candidates: AppUser[];
  emptyMessage: string;
  onChange: (ids: string[]) => void;
  selectedIds: string[];
}

function CandidatePicker({ candidates, emptyMessage, onChange, selectedIds }: CandidatePickerProps) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredCandidates = candidates.filter((candidate) => !normalizedQuery ||
    candidate.name.toLocaleLowerCase().includes(normalizedQuery) ||
    candidate.username.toLocaleLowerCase().includes(normalizedQuery) ||
    candidate.department.toLocaleLowerCase().includes(normalizedQuery));

  if (!candidates.length) return <p className="candidate-empty">{emptyMessage}</p>;

  return (
    <div className="candidate-selector">
      <label className="candidate-search">
        <Search aria-hidden="true" size={16} />
        <input
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by name, email, or department..."
          type="search"
          value={query}
        />
      </label>
      <div className="candidate-picker" role="group" aria-label="Available candidates">
      {filteredCandidates.map((candidate) => {
        const selected = selectedIds.includes(candidate.id);
        return (
          <label
            className={`candidate-option ${selected ? "selected" : ""}`}
            key={candidate.id}
          >
            <input
              checked={selected}
              onChange={() => onChange(selected
                ? selectedIds.filter((id) => id !== candidate.id)
                : [...selectedIds, candidate.id])}
              type="checkbox"
            />
            <span className="candidate-avatar" aria-hidden="true">
              {candidate.name.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}
            </span>
            <span className="candidate-details">
              <strong>{candidate.name}</strong>
              <small>{candidate.department}</small>
            </span>
            <CheckCircle2 aria-hidden="true" size={18} />
          </label>
        );
      })}
      {!filteredCandidates.length ? <p className="candidate-empty candidate-no-results">No users match “{query}”.</p> : null}
      </div>
    </div>
  );
}

function ChatAttachment({ file }: { file: ChatMessageFile }) {
  const isImage = file.mimeType.startsWith("image/");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const [downloadState, setDownloadState] = useState<"" | "downloading" | "error">("");

  useEffect(() => {
    if (!isImage) return;
    let objectUrl = "";
    let cancelled = false;
    api.loadChatFilePreview(file.id)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setImageUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setImageFailed(true);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file.id, isImage]);

  async function download() {
    setDownloadState("downloading");
    try {
      await api.downloadChatFile(file);
      setDownloadState("");
    } catch {
      setDownloadState("error");
    }
  }

  if (isImage && !imageFailed) {
    return (
      <button className="chat-attachment-image" onClick={download} title={`Download ${file.name}`} type="button">
        {imageUrl ? <img src={imageUrl} alt={file.name} /> : <span className="chat-attachment-loading">Loading image…</span>}
        {downloadState === "downloading" ? <span className="chat-download-state">Downloading…</span> : null}
        {downloadState === "error" ? <span className="chat-download-state error">Download failed · retry</span> : null}
      </button>
    );
  }

  return (
    <button className="chat-attachment-file" onClick={download} title={`Download ${file.name}`} type="button">
      <Paperclip aria-hidden="true" size={15} />
      <span>
        <strong>{file.name}</strong>
        <small>{downloadState === "downloading" ? "Downloading…" : downloadState === "error" ? "Download failed · click to retry" : formatFileSize(file.size)}</small>
      </span>
      <Download aria-hidden="true" size={15} />
    </button>
  );
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
  const [performanceTasks, setPerformanceTasks] = useState<PerformanceTask[]>([]);
  const [attendanceProfiles, setAttendanceProfiles] = useState<AttendanceProfile[]>([]);
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [chatChannels, setChatChannels] = useState<ChatChannel[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const chatMessageListRef = useRef<HTMLDivElement | null>(null);
  const chatParticipantsRef = useRef<HTMLDetailsElement | null>(null);
  const [selectedChannelId, setSelectedChannelId] = useState("");
  const [chatDraft, setChatDraft] = useState("");
  const [chatStatus, setChatStatus] = useState("");
  const [chatFiles, setChatFiles] = useState<File[]>([]);
  const [chatSending, setChatSending] = useState(false);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [editingChatMessageId, setEditingChatMessageId] = useState("");
  const [deletingChatMessage, setDeletingChatMessage] = useState<ChatMessage | null>(null);
  const [chatMessageEditDraft, setChatMessageEditDraft] = useState("");
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [groupDraft, setGroupDraft] = useState({ name: "", department: defaultDepartments[0] });
  const [editingChatGroupId, setEditingChatGroupId] = useState("");
  const [chatGroupNameDraft, setChatGroupNameDraft] = useState("");
  const [showChatPanel, setShowChatPanel] = useState(false);
  const [showAiAssistant, setShowAiAssistant] = useState(false);
  const [aiDraft, setAiDraft] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiMessages, setAiMessages] = useState<Array<{ role: "user" | "assistant"; text: string }>>([
    { role: "assistant", text: "Hello! I’m the MAB AI assistant. Ask me to help organize work, draft a task update, summarize an issue, or plan your day." }
  ]);
  const [activeView, setActiveView] = useState<
    "dashboard" | "projects" | "tasks" | "todos" | "finished" | "people" | "team" | "productivity" | "achievements" | "attendance" | "chat"
  >("dashboard");
  const [activeTaskSection, setActiveTaskSection] = useState<"assigned" | "free">("assigned");
  const [managerTaskSection, setManagerTaskSection] = useState<"all" | "review" | "free">("all");
  const [showNotifications, setShowNotifications] = useState(false);
  const [appLoading, setAppLoading] = useState(hasSession());
  const [loginError, setLoginError] = useState("");
  const [peopleMessage, setPeopleMessage] = useState("");
  const [departmentDraft, setDepartmentDraft] = useState("");
  const [departmentMessage, setDepartmentMessage] = useState("");
  const [allocationMessage, setAllocationMessage] = useState("");
  const [showTaskComposer, setShowTaskComposer] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<AppUser | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [taskEditDraft, setTaskEditDraft] = useState<ManagedTask | null>(null);
  const [assigningTaskId, setAssigningTaskId] = useState<string | null>(null);
  const [assignDraft, setAssignDraft] = useState<{ assigneeIds: string[]; dueDate: string }>({ assigneeIds: [], dueDate: "" });
  const [messageDrafts, setMessageDrafts] = useState<Record<string, string>>({});
  const [editingTaskMessageId, setEditingTaskMessageId] = useState("");
  const [taskMessageEditDraft, setTaskMessageEditDraft] = useState("");
  const [taskMessageStatus, setTaskMessageStatus] = useState<Record<string, string>>({});
  const [reviewDrafts, setReviewDrafts] = useState<Record<string, string>>({});
  const [taskFiles, setTaskFiles] = useState<File[]>([]);
  const [reportUserId, setReportUserId] = useState("");
  const [archiveFilters, setArchiveFilters] = useState({
    taskId: "",
    from: "",
    to: "",
    assigneeId: "",
    priority: "" as "" | TaskPriority
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
  const [achievementMonth, setAchievementMonth] = useState(new Date().toISOString().slice(0, 7));
  const [achievementDepartment, setAchievementDepartment] = useState("");
  const [attendanceMonth, setAttendanceMonth] = useState(new Date().toISOString().slice(0, 7));
  const [todoDraft, setTodoDraft] = useState({ title: "", taskId: "" });
  const [todoFilter, setTodoFilter] = useState<"all" | "open" | "completed">("all");
  const [todoMessage, setTodoMessage] = useState("");
  const [taskDraft, setTaskDraft] = useState({
    title: "Prepare client visit checklist",
    assigneeIds: [] as string[],
    department: "Mechanical Technical office engineer" as DepartmentName,
    priority: "high" as TaskPriority,
    taskType: "Technical" as TaskType,
    complexity: 3,
    projectId: "",
    dueDate: "",
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
  const [projectEditDrafts, setProjectEditDrafts] = useState<Record<string, { name: string; description: string }>>({});
  const [confirmation, setConfirmation] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    danger: boolean;
    onConfirm: () => Promise<void> | void;
  } | null>(null);

  const canManagePeople = currentUser?.role === "superadmin" || currentUser?.role === "admin";
  const canAllocateTasks = currentUser?.role === "superadmin" || currentUser?.role === "admin";

  function requestConfirmation(
    message: string,
    onConfirm: () => Promise<void> | void,
    options: { title?: string; confirmLabel?: string; danger?: boolean } = {}
  ) {
    setConfirmation({
      title: options.title ?? "Confirm deletion",
      message,
      confirmLabel: options.confirmLabel ?? "Yes, delete",
      danger: options.danger ?? true,
      onConfirm
    });
  }

  async function refreshData(silent = false) {
    try {
      const data = await api.bootstrap();
      setCurrentUser(data.currentUser);
      setDepartments(data.departments?.length ? data.departments : defaultDepartments);
      setUsers(data.users);
      setTasks(data.tasks);
      setPerformanceTasks(data.performanceTasks ?? []);
      setAttendanceProfiles(data.attendanceProfiles ?? []);
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
      return users.filter((user) => sameDepartment(user.department, currentUser.department) && user.role !== "superadmin");
    }
    return users.filter((user) => user.id === currentUser.id);
  }, [currentUser, users]);

  const assignableUsers = useMemo(() => {
    if (!currentUser) return [];
    if (currentUser.role === "superadmin") return users.filter((user) => user.role === "user");
    if (currentUser.role === "admin") {
      return users.filter((user) => user.role === "user" && sameDepartment(user.department, currentUser.department));
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
        : tasks.filter((task) => sameDepartment(task.department, currentUser.department));

    return sortTasksByPriority(matchingTasks);
  }, [currentUser, tasks]);

  const activeTasks = useMemo(
    () => visibleTasks.filter((task) => task.status !== "done"),
    [visibleTasks]
  );

  const assignedActiveTasks = useMemo(
    () => currentUser?.role === "user"
      ? activeTasks.filter((task) => task.assigneeIds.includes(currentUser.id))
      : activeTasks,
    [activeTasks, currentUser]
  );

  const freeActiveTasks = useMemo(
    () => activeTasks.filter((task) => task.assigneeIds.length === 0),
    [activeTasks]
  );

  const activeTaskSectionTasks = currentUser?.role === "user"
    ? activeTaskSection === "assigned" ? assignedActiveTasks : freeActiveTasks
    : managerTaskSection === "review"
      ? activeTasks.filter((task) => task.status === "under_review")
      : managerTaskSection === "free" ? freeActiveTasks : activeTasks;
  const activeSectionUrgentCount = activeTaskSectionTasks.filter((task) => task.priority === "urgent").length;
  const activeSectionOverdueCount = activeTaskSectionTasks.filter(isTaskOverdue).length;
  const dashboardTasks = currentUser?.role === "user" ? assignedActiveTasks : activeTasks;

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

  const filteredArchiveTasks = useMemo(() => finishedTasks.filter((task) => {
    const normalizedQuery = archiveFilters.taskId.toLocaleLowerCase().replace(/[^a-z0-9]/g, "");
    const normalizedTaskCode = task.taskCode.toLocaleLowerCase().replace(/[^a-z0-9]/g, "");
    if (normalizedQuery && !normalizedTaskCode.includes(normalizedQuery)) return false;
    if (archiveFilters.priority && task.priority !== archiveFilters.priority) return false;
    if (archiveFilters.assigneeId && !task.assigneeIds.includes(archiveFilters.assigneeId)) return false;
    const referenceDate = (task.completedAtIso ?? task.createdAt).slice(0, 10);
    if (archiveFilters.from && referenceDate < archiveFilters.from) return false;
    if (archiveFilters.to && referenceDate > archiveFilters.to) return false;
    return true;
  }), [archiveFilters, finishedTasks]);

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
      : sameDepartment(user.department, taskDraft.department)
  );
  const projectDraftCandidates = assignableUsers.filter((user) => sameDepartment(
    user.department,
    currentUser?.role === "admin" ? currentUser.department : projectDraft.department
  ));

  useEffect(() => {
    if (currentUser?.role !== "superadmin" || !departments.length) return;
    setProjectDraft((draft) => departments.some((department) => sameDepartment(department, draft.department))
      ? draft
      : { ...draft, department: departments[0], memberIds: [] });
    setTaskDraft((draft) => draft.projectId || departments.some((department) => sameDepartment(department, draft.department))
      ? draft
      : { ...draft, department: departments[0], assigneeIds: [] });
  }, [currentUser?.id, departments.join("|")]);

  useEffect(() => {
    if (!currentUser || !canAllocateTasks) return;
    setTaskDraft((draft) => ({
      ...draft,
      assigneeIds: draft.assigneeIds.filter((id) => taskDraftAssignableUsers.some((user) => user.id === id)),
      department: selectedDraftProject?.department ?? (currentUser.role === "admin" ? currentUser.department : draft.department)
    }));
  }, [canAllocateTasks, currentUser?.id, selectedDraftProject?.id, taskDraftAssignableUsers.map((user) => user.id).join(",")]);

  const openTasks = dashboardTasks.length;
  const urgentTasks = dashboardTasks.filter((task) => task.priority === "urgent").length;
  const reviewTasks = dashboardTasks.filter((task) => task.status === "under_review").length;
  const overdueTasks = dashboardTasks.filter((task) => task.dueDate && task.dueDate < new Date().toISOString().slice(0, 10)).length;
  const dashboardComplexity = dashboardTasks.reduce((sum, task) => sum + complexityPoints(task), 0);
  const averageProgress = dashboardComplexity
    ? Math.round(dashboardTasks.reduce((sum, task) => sum + task.progress * complexityPoints(task), 0) / dashboardComplexity)
    : 0;
  const unreadNotifications = notifications.filter((notification) => !notification.isRead).length;
  const selectedChatChannel = chatChannels.find((channel) => channel.id === selectedChannelId);
  const selectedChatMessages = chatMessages.filter((message) => message.channelId === selectedChannelId);
  const selectedChatTask = selectedChatChannel?.taskId ? tasks.find((task) => task.id === selectedChatChannel.taskId) : undefined;
  const selectedChatParticipants = selectedChatChannel?.isDirect
    ? users.filter((user) => user.id === currentUser?.id || user.id === selectedChatChannel.participantId)
    : users.filter((user) => {
        if (!selectedChatChannel) return false;
        if (user.role === "superadmin") return true;
        if (!sameDepartment(user.department, selectedChatChannel.department)) return false;
        if (!selectedChatTask) return true;
        return user.role === "admin" || selectedChatTask.assigneeIds.includes(user.id);
      });
  const mentionMatch = chatDraft.match(/@([^@\[\]\n]*)$/);
  const mentionQuery = mentionMatch?.[1].trim().toLocaleLowerCase() ?? "";
  const mentionCandidates = mentionMatch
    ? selectedChatParticipants.filter((user) => user.id !== currentUser?.id && (
        user.name.toLocaleLowerCase().includes(mentionQuery) || user.username.toLocaleLowerCase().includes(mentionQuery)
      )).slice(0, 6)
    : [];
  const newestSelectedChatMessageId = selectedChatMessages[selectedChatMessages.length - 1]?.id;

  useEffect(() => {
    if (!showChatPanel) return;
    const frame = window.requestAnimationFrame(() => {
      const messageList = chatMessageListRef.current;
      if (!messageList) return;
      messageList.scrollTo({ top: messageList.scrollHeight, behavior: "smooth" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [showChatPanel, selectedChannelId, newestSelectedChatMessageId]);

  useEffect(() => {
    function closeOpenPopovers(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;

      if (showNotifications && !target.closest(".notification-center")) setShowNotifications(false);

      const participants = chatParticipantsRef.current;
      if (participants?.open && !participants.contains(target)) participants.open = false;

      if (showGroupForm && !target.closest(".chat-group-form") && !target.closest(".chat-create-group-button")) {
        setShowGroupForm(false);
      }

      if (showAiAssistant && !target.closest(".ai-assistant") && !target.closest(".ai-toggle-button")) {
        setShowAiAssistant(false);
      }

      if (
        showChatPanel &&
        !target.closest("#department-chat") &&
        !target.closest(".chat-launcher") &&
        !target.closest(".notification-center") &&
        !target.closest(".confirmation-backdrop")
      ) {
        setShowChatPanel(false);
        setShowGroupForm(false);
        setShowAiAssistant(false);
      }
    }

    document.addEventListener("pointerdown", closeOpenPopovers);
    return () => document.removeEventListener("pointerdown", closeOpenPopovers);
  }, [showAiAssistant, showChatPanel, showGroupForm, showNotifications]);
  const canDeleteSelectedChatGroup = Boolean(selectedChatChannel?.isGroup && (
    currentUser?.role === "superadmin" ||
    (currentUser?.role === "admin" && selectedChatChannel.department === currentUser.department)
  ));

  function openTaskQueue(section: "assigned" | "free" | "all" | "review") {
    if (currentUser?.role === "user") setActiveTaskSection(section === "free" ? "free" : "assigned");
    else setManagerTaskSection(section === "review" ? "review" : section === "free" ? "free" : "all");
    setActiveView("tasks");
  }

  function insertChatMention(user: AppUser) {
    setChatDraft((draft) => draft.replace(/@([^@\[\]\n]*)$/, `@[${user.name}] `));
  }

  function attendanceMetrics(userId: string, month = "") {
    const profile = attendanceProfiles.find((item) => item.userId === userId);
    const today = currentRiyadhDate();
    const allDates = attendanceProfiles.flatMap((item) => item.records.map((record) => record.workDate)).sort();
    const trackingStart = allDates[0] ?? today;
    const requestedStart = /^\d{4}-\d{2}$/.test(month) ? `${month}-01` : trackingStart;
    const requestedEnd = /^\d{4}-\d{2}$/.test(month)
      ? new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10)
      : today;
    const startCandidates = [requestedStart, trackingStart, profile?.employmentStart ?? trackingStart].sort();
    const start = startCandidates[startCandidates.length - 1] ?? requestedStart;
    const end = requestedEnd < today ? requestedEnd : today;
    let expectedDays = 0;
    if (start <= end) {
      const cursor = new Date(`${start}T00:00:00Z`);
      const last = new Date(`${end}T00:00:00Z`);
      while (cursor <= last) {
        const day = cursor.getUTCDay();
        if (day !== 5) expectedDays += 1;
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
    }
    const records = profile?.records.filter((record) => record.workDate >= start && record.workDate <= end) ?? [];
    const presentDays = records.filter((record) => {
      const day = new Date(`${record.workDate}T00:00:00Z`).getUTCDay();
      return day !== 5;
    }).length;
    return {
      expectedDays,
      presentDays,
      attendanceRate: expectedDays ? Math.min(1, presentDays / expectedDays) : 0,
      totalLogins: records.reduce((sum, record) => sum + record.loginCount, 0),
      lastSeen: records[0]?.lastLoginAt
    };
  }

  function performanceMetrics(userId: string, month = "") {
    const user = users.find((candidate) => candidate.id === userId);
    const assigned = performanceTasks.filter((task) => task.assigneeIds.includes(userId));
    const completed = assigned.filter((task) => task.status === "done" && (!month || task.completedAtIso?.startsWith(month)));
    const departmentCompleted = performanceTasks.filter((task) =>
      task.status === "done" &&
      (!user || sameDepartment(task.department, user.department)) &&
      (!month || task.completedAtIso?.startsWith(month))
    );
    let earnedPoints = 0;
    let basePoints = 0;
    let speedTotal = 0;
    let teamworkTasks = 0;
    let onTimeTasks = 0;
    let reopenTotal = 0;

    for (const task of completed) {
      const complexity = complexityPoints(task);
      const duration = completionDays(task);
      const comparableDurations = departmentCompleted
        .filter((candidate) => complexityPoints(candidate) === complexity)
        .map(completionDays)
        .filter((value): value is number => value !== null && value > 0);
      const broaderDurations = departmentCompleted.map(completionDays).filter((value): value is number => value !== null && value > 0);
      const benchmark = comparableDurations.length >= 3 ? median(comparableDurations) : median(broaderDurations);
      const speedFactor = duration !== null && duration > 0 && benchmark > 0
        ? Math.min(1.4, Math.max(0.6, benchmark / Math.max(duration, 0.25)))
        : 1;
      const qualityFactor = Math.max(0.45, 1 - (task.reopenCount ?? 0) * 0.18);
      const onTime = Boolean(task.completedAtIso && task.dueDate && task.completedAtIso.slice(0, 10) <= task.dueDate);
      const timelinessFactor = task.dueDate ? (onTime ? 1.1 : 0.88) : 1;
      const teamSize = Math.max(1, task.assigneeIds.length);
      const collaborationFactor = teamSize > 1 ? Math.min(1.2, 1 + (teamSize - 1) * 0.08) : 1;
      const contributionFactor = 1 / Math.sqrt(teamSize);
      const base = complexity * 20;
      basePoints += base;
      earnedPoints += base * speedFactor * qualityFactor * timelinessFactor * collaborationFactor * contributionFactor;
      speedTotal += speedFactor;
      reopenTotal += task.reopenCount ?? 0;
      if (onTime) onTimeTasks += 1;
      if (teamSize > 1) teamworkTasks += 1;
    }

    const rawEfficiency = basePoints ? Math.min(120, (earnedPoints / basePoints) * 100) : 0;
    const confidence = completed.length / (completed.length + 3);
    const deliveryIndex = completed.length ? Math.round(50 + confidence * (rawEfficiency - 50)) : 0;
    const attendance = attendanceMetrics(userId, month);
    const productivityIndex = completed.length
      ? Math.round(deliveryIndex * 0.85 + (attendance.expectedDays ? attendance.attendanceRate * 100 : deliveryIndex) * 0.15)
      : 0;
    const strongOutput = earnedPoints / 2 >= 100 && reopenTotal === 0;
    const status = completed.length < 2
      ? "Building history"
      : productivityIndex >= 85
        ? "Outstanding"
        : productivityIndex >= 70
          ? "Strong"
          : productivityIndex >= 55 || strongOutput
            ? "Developing"
            : "Needs support";
    const evaluationReasons = [
      completed.length ? `${Math.round((speedTotal / completed.length) * 100)}% speed versus comparable work` : "No completed work in this period",
      `${reopenTotal} reopen${reopenTotal === 1 ? "" : "s"}`,
      attendance.expectedDays ? `${Math.round(attendance.attendanceRate * 100)}% attendance` : "Attendance baseline is still forming",
      `${Math.round(earnedPoints / 2)} complexity-weighted achievement points`
    ];
    return {
      completed: completed.length,
      complexityDelivered: completed.reduce((sum, task) => sum + complexityPoints(task), 0),
      achievementPoints: Math.round(earnedPoints / 2),
      productivityIndex,
      deliveryIndex,
      attendance,
      averageSpeedFactor: completed.length ? speedTotal / completed.length : 0,
      teamworkTasks,
      onTimeRate: completed.length ? onTimeTasks / completed.length : 0,
      reopenTotal,
      reopenRate: completed.length ? reopenTotal / completed.length : 0,
      status,
      evaluationReasons
    };
  }

  function userMetrics(userId: string, month = "") {
    const assigned = tasks.filter((task) => task.assigneeIds.includes(userId));
    const inPeriod = month
      ? assigned.filter((task) => task.createdAt.startsWith(month) || task.completedAtIso?.startsWith(month))
      : assigned;
    const completed = inPeriod.filter((task) => task.status === "done");
    const durations = completed.map(completionDays).filter((value): value is number => value !== null);
    const onTime = completed.filter((task) => task.completedAtIso && task.dueDate && task.completedAtIso.slice(0, 10) <= task.dueDate);
    const overdue = inPeriod.filter((task) => task.status !== "done" && task.dueDate && task.dueDate < new Date().toISOString().slice(0, 10));
    const assignedComplexity = inPeriod.reduce((sum, task) => sum + complexityPoints(task), 0);
    const activeComplexity = assigned.filter((task) => task.status !== "done").reduce((sum, task) => sum + complexityPoints(task), 0);
    const completedComplexity = completed.reduce((sum, task) => sum + complexityPoints(task), 0);
    const performance = performanceMetrics(userId, month);
    return {
      assigned: inPeriod.length,
      active: assigned.filter((task) => task.status !== "done").length,
      completed: completed.length,
      completedInMonth: assigned.filter((task) => task.completedAtIso?.startsWith(teamMonth)).length,
      overdue: overdue.length,
      averageProgress: assignedComplexity
        ? Math.round(inPeriod.reduce((sum, task) => sum + task.progress * complexityPoints(task), 0) / assignedComplexity)
        : 0,
      assignedComplexity,
      activeComplexity,
      completedComplexity,
      averageCompletionDays: average(durations),
      completionRate: assignedComplexity ? completedComplexity / assignedComplexity : 0,
      onTimeRate: completed.length ? onTime.length / completed.length : 0,
      performance
    };
  }

  async function handleLogout() {
    try {
      await api.logout();
    } finally {
      setCurrentUser(null);
      setUsers([]);
      setTasks([]);
      setPerformanceTasks([]);
      setAttendanceProfiles([]);
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
      setPerformanceTasks([]);
      setAttendanceProfiles([]);
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

  function selectChatChannel(channelId: string) {
    setSelectedChannelId(channelId);
    setReplyingTo(null);
    setChatFiles([]);
    if (!channelId) return;
    setChatChannels((channels) => channels.map((channel) => channel.id === channelId ? { ...channel, unreadCount: 0 } : channel));
    void api.markChatRead(channelId).catch(() => undefined);
  }

  async function openDepartmentChat(preferredChannelId?: string) {
    if (showChatPanel && !preferredChannelId) {
      setShowChatPanel(false);
      return;
    }
    setShowChatPanel(true);
    setChatStatus("");
    try {
      const data = await api.loadChat();
      setChatChannels(data.chatChannels);
      setChatMessages(data.chatMessages);
      const preferredChannel = preferredChannelId ? data.chatChannels.find((channel) => channel.id === preferredChannelId) : undefined;
      const departmentChannel = data.chatChannels.find((channel) =>
        !channel.isGroup && !channel.isDirect && (currentUser?.role === "superadmin" || channel.department === currentUser?.department));
      selectChatChannel(preferredChannel?.id ?? departmentChannel?.id ?? data.chatChannels[0]?.id ?? "");
    } catch (error) {
      setChatStatus(error instanceof Error ? error.message : "Could not open Department Chat.");
    }
  }

  function openNotificationTarget(notification: AppNotification) {
    setShowNotifications(false);
    if (notification.channelId) {
      void openDepartmentChat(notification.channelId);
      return;
    }
    if (notification.taskId) {
      setShowChatPanel(false);
      const task = tasks.find((item) => item.id === notification.taskId);
      if (task?.status === "done") setActiveView("finished");
      else {
        setActiveView("tasks");
        if (currentUser?.role === "user") setActiveTaskSection("assigned");
        else setManagerTaskSection(task?.status === "under_review" ? "review" : "all");
      }
      window.setTimeout(() => {
        document.getElementById(`task-${notification.taskId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 100);
      return;
    }
    if (["user", "people"].includes(notification.kind)) setActiveView("people");
    else setActiveView("dashboard");
  }

  function startReplyToChatMessage(message: ChatMessage) {
    setReplyingTo(message);
  }

  async function sendAiMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = aiDraft.trim();
    if (!message || aiLoading) return;
    const history = aiMessages.slice(-10);
    setAiDraft("");
    setAiMessages((items) => [...items, { role: "user", text: message }]);
    setAiLoading(true);
    try {
      const result = await api.askAiAssistant(message, history);
      setAiMessages((items) => [...items, { role: "assistant", text: result.reply }]);
    } catch (error) {
      setAiMessages((items) => [...items, { role: "assistant", text: error instanceof Error ? error.message : "The AI assistant is unavailable right now." }]);
    } finally {
      setAiLoading(false);
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
        complexity: taskDraft.complexity,
        dueDate: taskDraft.dueDate,
        progress: assignees.length ? clampProgress(taskDraft.progress) : 0,
        reviewComment: undefined,
        completedAt: undefined
      }, taskFiles);
      await refreshData(true);
      setTaskFiles([]);
      setShowTaskComposer(false);
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
    setAssigningTaskId(null);
    setEditingTaskId(task.id);
    setTaskEditDraft({ ...task, complexity: complexityPoints(task) });
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
      : sameDepartment(user.department, taskEditDraft.department));
    const assignees = allowedUsers.filter((user) => taskEditDraft.assigneeIds.includes(user.id));
    if (assignees.length !== taskEditDraft.assigneeIds.length) {
      setAllocationMessage("Every assignee must be a valid project member in this department.");
      return;
    }

    if (currentUser.role === "admin" && taskEditDraft.department !== currentUser.department) {
      setAllocationMessage("Admins can edit tasks only inside their own department.");
      return;
    }

    if (currentUser.role === "admin" && assignees.some((assignee) => !sameDepartment(assignee.department, currentUser.department))) {
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

  function directAssignableUsersFor(task: ManagedTask) {
    const project = projects.find((item) => item.id === task.projectId);
    return assignableUsers.filter((user) => project
      ? project.members.some((member) => member.id === user.id)
      : sameDepartment(user.department, task.department));
  }

  function startAssignTask(task: ManagedTask) {
    if (!canManageTask(task)) return;
    setEditingTaskId(null);
    setTaskEditDraft(null);
    setAssigningTaskId(task.id);
    setAssignDraft({ assigneeIds: task.assigneeIds, dueDate: task.dueDate ?? "" });
  }

  function cancelAssignTask() {
    setAssigningTaskId(null);
    setAssignDraft({ assigneeIds: [], dueDate: "" });
  }

  async function saveAssignTask(task: ManagedTask) {
    if (!currentUser || !canManageTask(task)) return;

    const allowedUsers = directAssignableUsersFor(task);
    const assignees = allowedUsers.filter((user) => assignDraft.assigneeIds.includes(user.id));
    if (assignees.length !== assignDraft.assigneeIds.length) {
      setAllocationMessage("Every assignee must be a valid project member in this department.");
      return;
    }
    if (!assignees.length) {
      setAllocationMessage("Select at least one person to assign.");
      return;
    }

    const updatedTask: ManagedTask = {
      ...task,
      assigneeId: assignees[0]?.id,
      assigneeIds: assignees.map((assignee) => assignee.id),
      candidateName: assignees.map((assignee) => assignee.name).join(", "),
      candidateNames: assignees.map((assignee) => assignee.name),
      status: "assigned",
      dueDate: assignDraft.dueDate
    };

    try {
      await api.updateTask(updatedTask);
      await refreshData(true);
      cancelAssignTask();
      setAllocationMessage(`"${task.title}" was assigned to ${assignees.map((assignee) => assignee.name).join(", ")}.`);
    } catch (error) {
      setAllocationMessage(error instanceof Error ? error.message : "Could not assign this task.");
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
        setAssigningTaskId((activeTaskId) => (activeTaskId === task.id ? null : activeTaskId));
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
      setTaskMessageStatus((statuses) => ({ ...statuses, [task.id]: "Claim request sent. Waiting for manager approval." }));
    } catch (error) {
      setTaskMessageStatus((statuses) => ({ ...statuses, [task.id]: error instanceof Error ? error.message : "Could not request this task." }));
    }
  }

  function confirmTaskClaim(task: ManagedTask) {
    requestConfirmation(
      `Are you sure you want to request Task #${task.taskCode}: “${task.title}”? An admin must approve before the task starts.`,
      () => claimTask(task),
      { title: "Request this task?", confirmLabel: "Yes, request task", danger: false }
    );
  }

  async function reviewTaskClaim(task: ManagedTask, approve: boolean) {
    try {
      await api.taskAction(task.id, approve ? "claim-approve" : "claim-reject");
      await refreshData(true);
      setTaskMessageStatus((statuses) => ({ ...statuses, [task.id]: approve ? "Claim approved. The task start was recorded." : "Claim request declined." }));
    } catch (error) {
      setTaskMessageStatus((statuses) => ({ ...statuses, [task.id]: error instanceof Error ? error.message : "Could not review this request." }));
    }
  }

  async function submitTaskForReview(task: ManagedTask) {
    if (!currentUser || currentUser.role !== "user" || !task.assigneeIds.includes(currentUser.id)) return;
    if (task.status === "done" || task.status === "under_review") return;

    try {
      await api.taskAction(task.id, "submit");
      await refreshData(true);
      setTaskMessageStatus((statuses) => ({ ...statuses, [task.id]: `Task #${task.taskCode} was submitted as finished.` }));
    } catch (error) {
      setAllocationMessage(error instanceof Error ? error.message : "Could not submit this task.");
    }
  }

  function confirmFinishTask(task: ManagedTask) {
    requestConfirmation(
      `Are you sure you finished Task #${task.taskCode}: “${task.title}”? It will be sent for manager review.`,
      () => submitTaskForReview(task),
      { title: "Finish this task?", confirmLabel: "Yes, finish task", danger: false }
    );
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

  async function saveTaskMessage(task: ManagedTask, messageId: string) {
    const body = taskMessageEditDraft.trim();
    if (!body) return;
    try {
      const result = await api.updateTaskMessage(task.id, messageId, body);
      setTasks((currentTasks) => currentTasks.map((item) => item.id === result.task.id ? result.task : item));
      setEditingTaskMessageId("");
      setTaskMessageEditDraft("");
      setTaskMessageStatus((statuses) => ({ ...statuses, [task.id]: "Comment updated." }));
    } catch (error) {
      setTaskMessageStatus((statuses) => ({ ...statuses, [task.id]: error instanceof Error ? error.message : "Could not edit this comment." }));
    }
  }

  function deleteTaskMessage(task: ManagedTask, messageId: string) {
    requestConfirmation("Delete this task comment? This cannot be undone.", async () => {
      try {
        const result = await api.deleteTaskMessage(task.id, messageId);
        setTasks((currentTasks) => currentTasks.map((item) => item.id === result.task.id ? result.task : item));
        setTaskMessageStatus((statuses) => ({ ...statuses, [task.id]: "Comment deleted." }));
      } catch (error) {
        setTaskMessageStatus((statuses) => ({ ...statuses, [task.id]: error instanceof Error ? error.message : "Could not delete this comment." }));
      }
    });
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
    if (!selectedChannelId || (!message && !chatFiles.length)) return;
    if (chatSending) return;
    try {
      setChatSending(true);
      setChatStatus(chatFiles.length ? `Uploading ${chatFiles.length} attachment${chatFiles.length === 1 ? "" : "s"}…` : "Sending message…");
      await api.sendChatMessage(selectedChannelId, message, chatFiles, replyingTo?.id);
      setChatDraft("");
      setChatFiles([]);
      setReplyingTo(null);
      const data = await api.loadChat();
      setChatChannels(data.chatChannels);
      setChatMessages(data.chatMessages);
      setChatStatus(chatFiles.length ? "Attachment uploaded successfully." : "");
    } catch (error) {
      setChatStatus(error instanceof Error ? error.message : "Could not send this message.");
    } finally {
      setChatSending(false);
    }
  }

  function selectChatAttachments(files: FileList | null) {
    const incoming = Array.from(files ?? []);
    if (!incoming.length) return;
    const oversized = incoming.find((file) => file.size > 10 * 1024 * 1024);
    if (oversized) {
      setChatStatus(`${oversized.name} exceeds the 10 MB file limit.`);
      return;
    }
    setChatFiles((current) => {
      const unique = [...current, ...incoming].filter((file, index, all) =>
        all.findIndex((item) => item.name === file.name && item.size === file.size && item.lastModified === file.lastModified) === index
      );
      if (unique.length > 5) setChatStatus("You can attach up to 5 files to one message.");
      else setChatStatus(`${unique.length} attachment${unique.length === 1 ? "" : "s"} ready to upload.`);
      return unique.slice(0, 5);
    });
  }

  async function saveChatMessage(messageId: string) {
    const body = chatMessageEditDraft.trim();
    if (!body) return;
    try {
      await api.updateChatMessage(messageId, body);
      setChatMessages((messages) => messages.map((message) => message.id === messageId ? { ...message, body } : message));
      setEditingChatMessageId("");
      setChatMessageEditDraft("");
      setChatStatus("Message updated.");
    } catch (error) {
      setChatStatus(error instanceof Error ? error.message : "Could not edit this message.");
    }
  }

  async function deleteChatMessage(message: ChatMessage, scope: "me" | "everyone") {
    try {
      await api.deleteChatMessage(message.id, scope);
      setChatMessages((messages) => scope === "me"
        ? messages.filter((item) => item.id !== message.id)
        : messages.map((item) => item.id === message.id ? { ...item, body: "", files: [], isDeleted: true } : item));
      setDeletingChatMessage(null);
      setChatStatus(scope === "me" ? "Message removed from your chat." : "Message deleted for everyone.");
    } catch (error) {
      setChatStatus(error instanceof Error ? error.message : "Could not delete this message.");
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

  async function saveProject(project: Project) {
    const memberIds = projectMemberDrafts[project.id] ?? project.members.map((member) => member.id);
    const details = projectEditDrafts[project.id] ?? { name: project.name, description: project.description };
    const name = details.name.trim();
    if (!name) {
      setProjectMessage("Project name is required.");
      return;
    }
    try {
      await api.updateProject(project.id, { name, description: details.description.trim(), memberIds });
      setProjectMessage(`Saved project ${name}.`);
      setProjectEditDrafts((drafts) => {
        const next = { ...drafts };
        delete next[project.id];
        return next;
      });
      setProjectMemberDrafts((drafts) => {
        const next = { ...drafts };
        delete next[project.id];
        return next;
      });
      await refreshData(true);
    } catch (error) {
      setProjectMessage(error instanceof Error ? error.message : "Could not update this project.");
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
    const isAssigningTask = assigningTaskId === task.id;
    const canDeleteTask = canManageTask(task);
    const canEditTask = canDeleteTask && task.status !== "done";
    const canClaimTask =
      currentUser?.role === "user" &&
      task.department === currentUser.department &&
      !task.assigneeIds.length &&
      !task.claimRequest &&
      task.status === "new";
    const hasPendingClaim = Boolean(task.claimRequest && !task.assigneeIds.length);
    const canReviewClaim = Boolean(hasPendingClaim && currentUser && ["admin", "superadmin"].includes(currentUser.role));
    const canDirectAssign = Boolean(canEditTask && !task.assigneeIds.length && !task.claimRequest);
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
      : sameDepartment(user.department, taskEditDraft?.department ?? task.department));
    const overdue = isTaskOverdue(task);

    return (
      <article className={`task-card task-card-priority-${task.priority}`} id={`task-${task.id}`} key={`${view}-${task.id}`}>
        <div className="task-row">
          {isEditingTask ? (
            <div className="edit-task-panel">
              <div className="edit-task-panel-header">
                <Edit3 aria-hidden="true" size={16} />
                <span>Editing Task #{task.taskCode}</span>
              </div>
              <div className="edit-task-grid">
                <label className="task-field-label edit-task-grid-full">Title
                  <input
                    onChange={(event) =>
                      setTaskEditDraft({ ...taskEditDraft, title: event.target.value })
                    }
                    value={taskEditDraft.title}
                  />
                </label>
                <label className="task-field-label">Project
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
                </label>
                {currentUser?.role === "superadmin" ? (
                  <label className="task-field-label">Department
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
                  </label>
                ) : null}
                <label className="task-field-label edit-task-grid-full">Assignees
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
                </label>
                <label className="task-field-label">Task type
                  <select onChange={(event) => setTaskEditDraft({ ...taskEditDraft, taskType: event.target.value as TaskType })} value={taskEditDraft.taskType}>
                    {taskTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                  </select>
                </label>
                <label className="task-field-label">Priority
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
                </label>
                <label className="task-field-label">Status
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
                </label>
                <label className="task-field-label">Complexity
                  <select onChange={(event) => setTaskEditDraft({ ...taskEditDraft, complexity: Number(event.target.value) })} value={taskEditDraft.complexity}>
                    {[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value} / 5 · {complexityLabels[value]}</option>)}
                  </select>
                </label>
                <label className="task-field-label">Due date
                  <input
                    disabled={!taskEditDraft.assigneeIds.length}
                    onChange={(event) =>
                      setTaskEditDraft({ ...taskEditDraft, dueDate: event.target.value })
                    }
                    type="date"
                    value={taskEditDraft.dueDate}
                  />
                </label>
                <label className="task-field-label">Progress (%)
                  <input
                    disabled={!taskEditDraft.assigneeIds.length}
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
                </label>
              </div>
              <div className="edit-task-panel-actions">
                <button type="button" className="task-action-button" onClick={saveEditTask}>
                  <Save aria-hidden="true" size={16} />
                  Save Changes
                </button>
                <button
                  type="button"
                  className="task-action-button secondary"
                  onClick={() => {
                    setEditingTaskId(null);
                    setTaskEditDraft(null);
                  }}
                >
                  <X aria-hidden="true" size={16} />
                  Cancel
                </button>
              </div>
            </div>
          ) : isAssigningTask ? (
            <div className="quick-assign-panel">
              <div className="edit-task-panel-header">
                <UserPlus aria-hidden="true" size={16} />
                <span>Assign Task #{task.taskCode} · {task.title}</span>
              </div>
              <CandidatePicker
                candidates={directAssignableUsersFor(task)}
                emptyMessage="No eligible users are available in this department yet."
                onChange={(ids) => setAssignDraft((draft) => ({ ...draft, assigneeIds: ids }))}
                selectedIds={assignDraft.assigneeIds}
              />
              <label className="task-field-label quick-assign-due">Due date (optional)
                <input
                  onChange={(event) => setAssignDraft((draft) => ({ ...draft, dueDate: event.target.value }))}
                  type="date"
                  value={assignDraft.dueDate}
                />
              </label>
              <div className="edit-task-panel-actions">
                <button
                  type="button"
                  className="task-action-button"
                  disabled={!assignDraft.assigneeIds.length}
                  onClick={() => saveAssignTask(task)}
                >
                  <CheckCircle2 aria-hidden="true" size={16} />
                  Assign Task
                </button>
                <button type="button" className="task-action-button secondary" onClick={cancelAssignTask}>
                  <X aria-hidden="true" size={16} />
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="task-card-body">
              <div className="task-card-heading">
                <span className="task-code">#{task.taskCode}</span>
                <span className={`status-pill status-${task.status}`}>{statusLabels[task.status]}</span>
                <span className={`priority priority-${task.priority}`}>
                  {priorityLabels[task.priority]}
                </span>
                {overdue ? (
                  <span className="overdue-pill"><AlertTriangle aria-hidden="true" size={12} />Overdue</span>
                ) : null}
              </div>
              <h3 className="task-card-title">{task.title}</h3>
              {task.reviewComment ? <p className="review-note">Review: {task.reviewComment}</p> : null}
              <div className="task-card-meta">
                <span className="meta-item"><Building2 aria-hidden="true" size={13} />{task.department}</span>
                <span className="meta-item"><FolderKanban aria-hidden="true" size={13} />{task.projectName ?? "No project"}</span>
                <span className="meta-item"><ListTodo aria-hidden="true" size={13} />{task.taskType}</span>
                <span className="meta-item" title={complexityLabels[complexityPoints(task)]}><Gauge aria-hidden="true" size={13} />Complexity {complexityPoints(task)}/5</span>
                <span className="meta-item">{task.startedAt ? `Started ${new Date(task.startedAt).toLocaleDateString("en-GB")}` : "Not started"}</span>
                <span className={`meta-item ${overdue ? "meta-item-overdue" : ""}`}>
                  <Calendar aria-hidden="true" size={13} />
                  {task.dueDate ? `Due ${task.dueDate}` : "No due date"}
                </span>
              </div>
              <div className="task-card-footer">
                <div className="task-progress-wrap">
                  <div className="task-progress">
                    <span style={{ width: `${task.progress}%` }} />
                  </div>
                  <b className="task-progress-value">{task.progress}%</b>
                </div>
                <div className="task-card-people">
                  {task.assigneeIds.length ? task.assigneeIds.map((assigneeId, index) => (
                    <span className="assignee-chip" key={assigneeId}>
                      <span className="assignee-avatar" style={{ background: identityColor(assigneeId, currentUser?.id) }}>
                        {initials(task.candidateNames[index] ?? "?")}
                      </span>
                      {task.candidateNames[index]}
                    </span>
                  )) : (
                    <span className="assignee-chip unassigned"><Hand aria-hidden="true" size={13} />Unassigned</span>
                  )}
                </div>
              </div>
            </div>
          )}

          {(canEditTask || canDeleteTask || canClaimTask || canSubmitForReview || canReviewClaim) && !isEditingTask && !isAssigningTask ? (
            <div className="row-actions task-actions">
              {canClaimTask ? (
                <button type="button" className="task-action-button" onClick={() => confirmTaskClaim(task)}>
                  <Hand aria-hidden="true" size={16} />
                  Request to Take
                </button>
              ) : null}
              {canReviewClaim ? <>
                <button type="button" className="task-action-button" onClick={() => reviewTaskClaim(task, true)}><CheckCircle2 aria-hidden="true" size={16} />Approve Claim</button>
                <button type="button" className="task-action-button secondary" onClick={() => reviewTaskClaim(task, false)}><X aria-hidden="true" size={16} />Reject</button>
              </> : null}
              {canSubmitForReview ? (
                <button type="button" className="task-action-button" onClick={() => confirmFinishTask(task)}>
                  <CheckCircle2 aria-hidden="true" size={16} />
                  Finish Task
                </button>
              ) : null}
              {canEditTask ? (
                <>
                  {canDirectAssign ? <button type="button" className="task-action-button secondary" onClick={() => startAssignTask(task)}><UserPlus aria-hidden="true" size={16} />Assign User</button> : null}
                  <button type="button" className="task-action-button secondary" onClick={() => startEditTask(task)}><Edit3 aria-hidden="true" size={16} />Edit</button>
                </>
              ) : null}
              {canDeleteTask ? (
                <button type="button" className="icon-button danger" onClick={() => deleteTask(task)} aria-label="Delete task">
                  <Trash2 aria-hidden="true" size={16} />
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        {task.claimRequest ? (
          <div className={`claim-request-note ${canReviewClaim ? "manager" : ""}`}>
            <Hand aria-hidden="true" size={17} />
            <div><strong>{task.claimRequest.userId === currentUser?.id ? "Your request is waiting for approval" : `${task.claimRequest.userName} requested this task`}</strong><span>The task has not started. Complexity and scheduling remain separate manager decisions.</span></div>
          </div>
        ) : null}

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

        <details className="task-collaboration-details">
          <summary><span><MessageSquare aria-hidden="true" size={15} />Discussion <b>{task.messages.length}</b></span><span><Paperclip aria-hidden="true" size={15} />Documents <b>{task.files.length}</b></span><small>Open workspace</small></summary>
        <div className="task-collab">
          <div className="task-thread">
            <div className="collab-heading">
              <MessageSquare aria-hidden="true" size={16} />
              <strong>Task Chat</strong>
            </div>
            <div className="task-message-list" tabIndex={0} aria-label={`Comments for Task ${task.taskCode}`}>
              {task.messages.length ? task.messages.map((message) => {
                  const mine = message.authorId === currentUser?.id;
                  return (
                    <article className={`task-comment ${mine ? "mine" : ""}`} key={message.id}>
                      <span className="task-comment-avatar" style={{ background: identityColor(message.authorId, currentUser?.id) }}>
                        {initials(message.authorName)}
                      </span>
                      <div className="task-comment-bubble">
                        <div className="message-heading">
                          <strong style={{ color: identityColor(message.authorId, currentUser?.id) }}>{message.authorName}</strong>
                          <span>{message.createdAt}</span>
                        </div>
                        {editingTaskMessageId === message.id ? (
                          <div className="message-edit-form">
                            <input
                              autoFocus
                              maxLength={2000}
                              onChange={(event) => setTaskMessageEditDraft(event.target.value)}
                              value={taskMessageEditDraft}
                            />
                            <button className="icon-button" onClick={() => saveTaskMessage(task, message.id)} type="button" aria-label="Save comment"><Save aria-hidden="true" size={15} /></button>
                            <button className="icon-button" onClick={() => { setEditingTaskMessageId(""); setTaskMessageEditDraft(""); }} type="button" aria-label="Cancel editing"><X aria-hidden="true" size={15} /></button>
                          </div>
                        ) : <p>{message.body}</p>}
                        {mine && editingTaskMessageId !== message.id ? (
                          <div className="message-actions">
                            <button onClick={() => { setEditingTaskMessageId(message.id); setTaskMessageEditDraft(message.body); }} type="button"><Edit3 aria-hidden="true" size={13} />Edit</button>
                            <button className="danger" onClick={() => deleteTaskMessage(task, message.id)} type="button"><Trash2 aria-hidden="true" size={13} />Delete</button>
                          </div>
                        ) : null}
                      </div>
                    </article>
                  );
                }) : <p className="empty-state">No comments yet. Start the discussion.</p>}
            </div>
            {taskMessageStatus[task.id] ? <p className="conversation-status">{taskMessageStatus[task.id]}</p> : null}
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
        </details>
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

  const departmentChatChannels = chatChannels.filter((channel) => !channel.isGroup && !channel.isDirect);
  const groupChatChannels = chatChannels.filter((channel) => channel.isGroup);
  const directChatChannels = chatChannels.filter((channel) => channel.isDirect);
  const unreadChatMessages = chatChannels.reduce((total, channel) => total + (channel.unreadCount ?? 0), 0);
  const lastMessageByChannel = new Map<string, ChatMessage>();
  for (const message of chatMessages) lastMessageByChannel.set(message.channelId, message);

  function renderChatChannelButton(channel: ChatChannel) {
    const preview = lastMessageByChannel.get(channel.id);
    const previewBody = preview?.body || (preview?.files.length ? `📎 ${preview.files.length} attachment${preview.files.length > 1 ? "s" : ""}` : "");
    const previewText = preview
      ? `${preview.authorId === currentUser?.id ? "You: " : ""}${previewBody}`
      : channel.isDirect ? "No messages yet" : channel.isGroup ? "Group chat" : "Broadcast to the whole department";
    const isActive = channel.id === selectedChannelId;
    const unreadCount = isActive ? 0 : channel.unreadCount ?? 0;

    return (
      <button
        className={isActive ? "active" : ""}
        key={channel.id}
        onClick={() => selectChatChannel(channel.id)}
        type="button"
      >
        {channel.isDirect ? (
          <span className="chat-channel-avatar" style={{ background: identityColor(channel.participantId, currentUser?.id) }}>
            {initials(channel.name)}
          </span>
        ) : channel.isGroup ? (
          <Users aria-hidden="true" size={16} />
        ) : (
          <MessageSquare aria-hidden="true" size={16} />
        )}
        <span className="chat-channel-text">
          <strong>{channel.name}</strong>
          <small className={unreadCount ? "chat-channel-preview-unread" : ""}>{previewText}</small>
        </span>
        {unreadCount ? <b className="chat-unread-badge">{unreadCount > 99 ? "99+" : unreadCount}</b> : null}
      </button>
    );
  }

  function renderChatPanel() {
    if (!currentUser) return null;
    return (
          <section className="panel chat-panel" id="department-chat">
            <div className="panel-header">
              <div>
                <p>{selectedChatChannel?.isDirect ? `Private message · ${selectedChatChannel.department}` : selectedChatChannel?.department ?? currentUser.department}</p>
                <h2>{selectedChatChannel?.name ?? "Department Chat"}</h2>
                <details className="chat-participants" ref={chatParticipantsRef}>
                  <summary>
                    <span className="chat-participant-stack" aria-hidden="true">
                      {selectedChatParticipants.slice(0, 4).map((user) => <i key={user.id} style={{ background: identityColor(user.id, currentUser.id) }}>{initials(user.name)}</i>)}
                    </span>
                    {selectedChatParticipants.length} member{selectedChatParticipants.length === 1 ? "" : "s"}
                  </summary>
                  <div className="chat-participant-popover">
                    <strong>People in this conversation</strong>
                    {selectedChatParticipants.map((user) => (
                      <button key={user.id} onClick={() => insertChatMention(user)} type="button">
                        <span style={{ background: identityColor(user.id, currentUser.id) }}>{initials(user.name)}</span>
                        <span><b>{user.name}</b><small>{user.role} · {user.department}</small></span>
                      </button>
                    ))}
                  </div>
                </details>
              </div>
              <div className="chat-management-actions">
                <button
                  className={`ghost-button ai-toggle-button ${showAiAssistant ? "active" : ""}`}
                  onClick={() => setShowAiAssistant((visible) => !visible)}
                  type="button"
                  aria-expanded={showAiAssistant}
                >
                  <Sparkles aria-hidden="true" size={16} />
                  AI Assistant
                </button>
                {canManagePeople ? (
                  <>
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
                    className="ghost-button chat-create-group-button"
                    onClick={() => setShowGroupForm((visible) => !visible)}
                    type="button"
                  >
                    <Plus aria-hidden="true" size={17} />
                    Create Group
                  </button>
                  </>
                ) : null}
                <button
                  className="icon-button chat-close-button"
                  onClick={() => setShowChatPanel(false)}
                  type="button"
                  aria-label="Close messages"
                  title="Close messages"
                >
                  <X aria-hidden="true" size={18} />
                </button>
              </div>
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
                <p className="chat-channel-section-label">Department</p>
                {departmentChatChannels.map((channel) => renderChatChannelButton(channel))}
                {groupChatChannels.length ? (
                  <>
                    <p className="chat-channel-section-label">Groups</p>
                    {groupChatChannels.map((channel) => renderChatChannelButton(channel))}
                  </>
                ) : null}
                {directChatChannels.length ? (
                  <>
                    <p className="chat-channel-section-label">Direct Messages</p>
                    {directChatChannels.map((channel) => renderChatChannelButton(channel))}
                  </>
                ) : null}
              </aside>

              <div className="chat-room">
                <div className="chat-message-list" aria-live="polite" ref={chatMessageListRef}>
                  {selectedChatMessages.length ? selectedChatMessages.map((message, index) => {
                    const previous = selectedChatMessages[index - 1];
                    const dayLabel = chatDayLabel(message);
                    const showDateSeparator = !previous || chatDayLabel(previous) !== dayLabel;
                    const mine = message.authorId === currentUser.id;
                    const grouped = Boolean(previous && !showDateSeparator && previous.authorId === message.authorId);
                    return (
                      <div className="chat-message-wrap" key={message.id}>
                        {showDateSeparator ? (
                          <div className="chat-date-separator"><span>{relativeChatDayLabel(dayLabel)}</span></div>
                        ) : null}
                        <article className={`chat-message ${mine ? "mine" : ""} ${grouped ? "grouped" : ""}`}>
                          <span className="chat-message-avatar" style={{ background: identityColor(message.authorId, currentUser.id) }}>
                            {initials(message.authorName)}
                          </span>
                          <div className="chat-message-bubble">
                            <div>
                              <strong style={{ color: identityColor(message.authorId, currentUser.id) }}>{message.authorName}</strong>
                              <span>{chatTimeLabel(message)}</span>
                            </div>
                            {message.replyTo && !message.isDeleted ? (
                              <div className="chat-quote">
                                <strong>{message.replyTo.authorName}</strong>
                                <p>{message.replyTo.body || "📎 Attachment"}</p>
                              </div>
                            ) : null}
                            {message.files.length && !message.isDeleted ? (
                              <div className="chat-attachments">
                                {message.files.map((file) => <ChatAttachment file={file} key={file.id} />)}
                              </div>
                            ) : null}
                            {message.isDeleted ? (
                              <p className="chat-message-deleted"><Trash2 aria-hidden="true" size={13} />This message was deleted</p>
                            ) : editingChatMessageId === message.id ? (
                              <div className="message-edit-form chat-message-edit">
                                <input
                                  autoFocus
                                  maxLength={2000}
                                  onChange={(event) => setChatMessageEditDraft(event.target.value)}
                                  value={chatMessageEditDraft}
                                />
                                <button className="icon-button" onClick={() => saveChatMessage(message.id)} type="button" aria-label="Save message"><Save aria-hidden="true" size={15} /></button>
                                <button className="icon-button" onClick={() => { setEditingChatMessageId(""); setChatMessageEditDraft(""); }} type="button" aria-label="Cancel editing"><X aria-hidden="true" size={15} /></button>
                              </div>
                            ) : message.body ? <p>{renderMentionedText(message.body, currentUser.name)}</p> : null}
                            {editingChatMessageId !== message.id && !message.isDeleted ? (
                              <div className="message-actions">
                                <button onClick={() => startReplyToChatMessage(message)} type="button"><CornerUpLeft aria-hidden="true" size={13} />Reply</button>
                                {mine ? (
                                  <>
                                    <button onClick={() => { setEditingChatMessageId(message.id); setChatMessageEditDraft(message.body); }} type="button"><Edit3 aria-hidden="true" size={13} />Edit</button>
                                  </>
                                ) : null}
                                <button className="danger" onClick={() => setDeletingChatMessage(message)} type="button"><Trash2 aria-hidden="true" size={13} />Delete</button>
                              </div>
                            ) : null}
                          </div>
                        </article>
                      </div>
                    );
                  }) : (
                    <p className="empty-state">
                      {selectedChatChannel?.isDirect ? `No messages yet. Say hello to ${selectedChatChannel.name}.` : "No messages yet. Say hello to your department."}
                    </p>
                  )}
                </div>

                {replyingTo ? (
                  <div className="chat-reply-banner">
                    <CornerUpLeft aria-hidden="true" size={16} />
                    <div>
                      <strong>Replying to {replyingTo.authorName}</strong>
                      <span>{replyingTo.body || (replyingTo.files.length ? `📎 ${replyingTo.files.length} attachment(s)` : "")}</span>
                    </div>
                    <button type="button" className="icon-button" onClick={() => setReplyingTo(null)} aria-label="Cancel reply">
                      <X aria-hidden="true" size={14} />
                    </button>
                  </div>
                ) : null}

                {chatFiles.length ? (
                  <div className="chat-staged-files">
                    {chatFiles.map((file, index) => (
                      <span className="chat-staged-file" key={`${file.name}-${index}`}>
                        <Paperclip aria-hidden="true" size={13} />
                        {file.name}
                        <button
                          aria-label={`Remove ${file.name}`}
                          onClick={() => setChatFiles((files) => files.filter((_, fileIndex) => fileIndex !== index))}
                          type="button"
                        >
                          <X aria-hidden="true" size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                ) : null}

                <form className="chat-compose" onSubmit={sendDepartmentMessage}>
                  {mentionMatch && mentionCandidates.length ? (
                    <div className="chat-mention-picker" role="listbox" aria-label="Mention a conversation member">
                      <small>Mention someone</small>
                      {mentionCandidates.map((user) => (
                        <button key={user.id} onClick={() => insertChatMention(user)} type="button">
                          <span style={{ background: identityColor(user.id, currentUser.id) }}>{initials(user.name)}</span>
                          <span><strong>{user.name}</strong><small>{user.username}</small></span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <div className="emoji-picker department-emojis" aria-label="Quick emojis">
                    {quickEmojis.map((emoji) => (
                      <button key={emoji} type="button" onClick={() => setChatDraft((draft) => `${draft}${emoji}`)} aria-label={`Add ${emoji}`}>{emoji}</button>
                    ))}
                  </div>
                  <label className="chat-attach-button" title="Attach files">
                    <Paperclip aria-hidden="true" size={18} />
                    <input
                      disabled={!selectedChannelId || chatSending}
                      multiple
                      onChange={(event) => {
                        selectChatAttachments(event.target.files);
                        event.target.value = "";
                      }}
                      type="file"
                    />
                  </label>
                  <input
                    className={chatDraft ? "typing-input" : ""}
                    disabled={!selectedChannelId || chatSending}
                    maxLength={2000}
                    onChange={(event) => setChatDraft(event.target.value)}
                    placeholder="Write a message"
                    value={chatDraft}
                  />
                  <button className="primary-button" disabled={chatSending || !selectedChannelId || (!chatDraft.trim() && !chatFiles.length)} type="submit">
                    {chatSending ? (chatFiles.length ? "Uploading…" : "Sending…") : "Send"}
                  </button>
                </form>
              </div>
            </div>

            {showAiAssistant ? (
              <section className="ai-assistant" aria-label="MAB AI assistant">
                <header>
                  <span><Sparkles aria-hidden="true" size={17} /></span>
                  <div><strong>MAB AI Assistant</strong><small>Private conversation · responses may need review</small></div>
                  <button className="icon-button" type="button" onClick={() => setShowAiAssistant(false)} aria-label="Close AI assistant"><X size={15} /></button>
                </header>
                <div className="ai-message-list" aria-live="polite">
                  {aiMessages.map((message, index) => (
                    <p className={message.role} key={`${message.role}-${index}`}>{message.text}</p>
                  ))}
                  {aiLoading ? <p className="assistant ai-thinking">Thinking…</p> : null}
                </div>
                <form onSubmit={sendAiMessage}>
                  <input maxLength={2000} value={aiDraft} onChange={(event) => setAiDraft(event.target.value)} placeholder="Ask the MAB assistant…" />
                  <button className="primary-button" disabled={!aiDraft.trim() || aiLoading} type="submit">Ask</button>
                </form>
              </section>
            ) : null}
            {chatStatus ? <p className="success-message">{chatStatus}</p> : null}
          </section>

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
        <div className="sidebar-context" title={currentUser.department}>
          <span><Building2 aria-hidden="true" size={15} /></span>
          <div><small>Current department</small><strong>{currentUser.department}</strong></div>
        </div>
        <p className="sidebar-nav-label">Main navigation</p>
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
            className={`sidebar-nav-button ${activeView === "achievements" ? "active" : ""}`}
            onClick={() => setActiveView("achievements")}
          >
            <Trophy aria-hidden="true" size={17} />
            Achievements
          </button>
          <button
            type="button"
            className={`sidebar-nav-button ${activeView === "attendance" ? "active" : ""}`}
            onClick={() => setActiveView("attendance")}
          >
            <Calendar aria-hidden="true" size={17} />
            Attendance
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
        <div className="sidebar-user">
          <span className="user-avatar" aria-hidden="true">
            {currentUser.name.split(" ").slice(0, 2).map((part) => part[0]).join("").toUpperCase()}
          </span>
          <div>
            <strong>{currentUser.name}</strong>
            <span>{currentUser.department}</span>
          </div>
          <span className="online-dot" title="Online" />
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="topbar-title">
            <img src={mabLogo} alt="" aria-hidden="true" />
            <div>
              <p>{currentUser.department} / {viewTitles[activeView]}</p>
              <h1>{viewTitles[activeView]}</h1>
            </div>
          </div>
          <div className="topbar-actions">
            {canAllocateTasks ? (
              <button className="primary-button topbar-create-button" onClick={() => setShowTaskComposer(true)} type="button">
                <Plus aria-hidden="true" size={17} />
                <span>New Task</span>
              </button>
            ) : null}
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
                      <button key={notification.id} className={notification.isRead ? "" : "unread"} onClick={() => openNotificationTarget(notification)} type="button">
                        <strong>{notification.title}</strong>
                        <p>{notification.body}</p>
                        <span>{notification.createdAt} · Open</span>
                      </button>
                    )) : <p className="empty-state">No notifications yet.</p>}
                  </div>
                </div>
              ) : null}
            </div>
            <button type="button" className="ghost-button" onClick={handleLogout}>
              <LogOut aria-hidden="true" size={18} />
              <span>Logout</span>
            </button>
          </div>
        </header>

        {activeView === "dashboard" ? <>
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
          <StatCard label="Active Tasks" value={String(openTasks)} icon={ClipboardList} tone="blue" onClick={() => openTaskQueue(currentUser.role === "user" ? "assigned" : "all")} />
          <StatCard label="Needs Review" value={String(reviewTasks)} icon={CheckCircle2} tone="green" onClick={canAllocateTasks ? () => openTaskQueue("review") : undefined} />
          <StatCard label="Overdue" value={String(overdueTasks)} icon={AlertTriangle} tone="red" />
          <StatCard label="Average Progress" value={`${averageProgress}%`} icon={Gauge} tone="amber" />
        </section>

        <section className="dashboard-main-grid" aria-label="Dashboard overview">
          <section className="panel dashboard-work-queue">
            <div className="panel-header">
              <div><p>Live workload</p><h2>Priority Work Queue</h2></div>
              <button className="ghost-button" onClick={() => openTaskQueue(currentUser.role === "user" ? "assigned" : "all")} type="button">View all</button>
            </div>
            <div className="dashboard-task-list">
              {dashboardTasks.slice(0, 6).map((task) => (
                <button className="dashboard-task-row" key={`dashboard-${task.id}`} onClick={() => openTaskQueue(currentUser.role === "user" ? "assigned" : "all")} type="button">
                  <span className={`dashboard-priority priority-${task.priority}`} />
                  <span><strong>{task.title}</strong><small>{task.taskCode} · {task.projectName || task.department}</small></span>
                  <span className="dashboard-assignee">{task.candidateName || "Unassigned"}</span>
                  <span className="dashboard-due">{task.dueDate || "Not started"}</span>
                  <strong className="dashboard-progress">{task.progress}%</strong>
                </button>
              ))}
              {!dashboardTasks.length ? <p className="empty-state">Everything is clear. No active tasks.</p> : null}
            </div>
          </section>

          <aside className="dashboard-side-column">
            <section className="panel dashboard-quick-actions">
              <div className="panel-header"><div><p>Shortcuts</p><h2>Quick Actions</h2></div></div>
              <div className="quick-action-grid">
                {canAllocateTasks ? <button onClick={() => setShowTaskComposer(true)} type="button"><Plus aria-hidden="true" size={18} /><span><strong>New task</strong><small>Assign work now</small></span></button> : null}
                <button onClick={() => openTaskQueue("free")} type="button"><Hand aria-hidden="true" size={18} /><span><strong>Free tasks</strong><small>{freeActiveTasks.length} available</small></span></button>
                <button onClick={() => setActiveView("projects")} type="button"><FolderKanban aria-hidden="true" size={18} /><span><strong>Projects</strong><small>{projects.length} available</small></span></button>
                <button onClick={() => setActiveView("people")} type="button"><Users aria-hidden="true" size={18} /><span><strong>People</strong><small>{visibleUsers.length} visible</small></span></button>
                <button onClick={() => void openDepartmentChat()} type="button"><MessageSquare aria-hidden="true" size={18} /><span><strong>Messages</strong><small>{chatChannels.length} channels</small></span></button>
              </div>
            </section>
            <section className="panel dashboard-health">
              <div className="panel-header"><div><p>At a glance</p><h2>Operations</h2></div></div>
              <div className="health-row"><span>Projects</span><strong>{projects.length}</strong></div>
              <div className="health-row"><span>Team members</span><strong>{productivityCandidates.length}</strong></div>
              <div className="health-row"><span>Urgent tasks</span><strong>{urgentTasks}</strong></div>
              <div className="health-row"><span>Completed tasks</span><strong>{finishedTasks.length}</strong></div>
            </section>
          </aside>
        </section>
        </> : null}

        {activeView === "dashboard" && (canManagePeople || canAllocateTasks) ? (
          <section className="admin-grid dashboard-legacy-admin" id="people">
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
                    <CandidatePicker
                      candidates={taskDraftAssignableUsers}
                      emptyMessage={selectedDraftProject
                        ? "This project has no available members. Add people to the project first."
                        : `No normal users are available in ${taskDraft.department}.`}
                      onChange={(assigneeIds) => setTaskDraft((draft) => ({ ...draft, assigneeIds }))}
                      selectedIds={taskDraft.assigneeIds}
                    />
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

        {activeView === "dashboard" ? <section className="content-grid dashboard-legacy-content">
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
                  <CandidatePicker
                    candidates={projectDraftCandidates}
                    emptyMessage={`No normal users are available in ${currentUser.role === "admin" ? currentUser.department : projectDraft.department}.`}
                    onChange={(memberIds) => setProjectDraft((draft) => ({ ...draft, memberIds }))}
                    selectedIds={projectDraft.memberIds}
                  />
                </label>
                <button className="primary-button" type="submit"><Plus aria-hidden="true" size={17} />Create Project</button>
              </form>
            ) : null}
            {projectMessage ? <p className="success-message">{projectMessage}</p> : null}
            <div className="projects-grid">
              {projects.length ? projects.map((project) => {
                const eligibleMembers = assignableUsers.filter((user) => sameDepartment(user.department, project.department));
                const memberIds = projectMemberDrafts[project.id] ?? project.members.map((member) => member.id);
                const projectDetails = projectEditDrafts[project.id] ?? { name: project.name, description: project.description };
                return (
                  <article className="project-card" key={project.id}>
                    <div className="member-heading"><div><strong>{project.name}</strong><p>{project.department}</p></div><span>{project.taskCount} tasks</span></div>
                    <div className="project-members"><strong>Members</strong><span>{project.members.map((member) => member.name).join(", ") || "No members yet"}</span></div>
                    {canManagePeople ? (
                      <>
                        <div className="project-edit-fields">
                          <label>Project name
                            <input
                              onChange={(event) => setProjectEditDrafts((drafts) => ({
                                ...drafts,
                                [project.id]: { ...projectDetails, name: event.target.value }
                              }))}
                              value={projectDetails.name}
                            />
                          </label>
                          <label>Description
                            <input
                              onChange={(event) => setProjectEditDrafts((drafts) => ({
                                ...drafts,
                                [project.id]: { ...projectDetails, description: event.target.value }
                              }))}
                              placeholder="Add a short project description"
                              value={projectDetails.description}
                            />
                          </label>
                        </div>
                        <label className="multi-select-field">Choose project members
                          <CandidatePicker
                            candidates={eligibleMembers}
                            emptyMessage={`No normal users are available in ${project.department}.`}
                            onChange={(ids) => setProjectMemberDrafts((drafts) => ({ ...drafts, [project.id]: ids }))}
                            selectedIds={memberIds}
                          />
                        </label>
                        <div className="project-actions">
                          <button className="primary-button" type="button" onClick={() => saveProject(project)}><Save aria-hidden="true" size={16} />Save Project</button>
                          <button className="ghost-button" type="button" onClick={() => exportProjectSheet(project)}><Download aria-hidden="true" size={16} />Export Task Sheet</button>
                          <label className="file-upload"><Upload aria-hidden="true" size={16} />Import Task Sheet
                            <input accept=".xlsx,.csv" type="file" onChange={(event) => { void importProjectSheet(project, event.target.files?.[0]); event.target.value = ""; }} />
                          </label>
                          <button className="icon-button danger" type="button" onClick={() => deleteProject(project)} aria-label={`Delete ${project.name}`}><Trash2 aria-hidden="true" size={16} /></button>
                        </div>
                        <small className="import-hint">Columns: Task, Priority, Complexity (1–5), Due Date, Progress, Task Type, Assignees (name or username).</small>
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
                <p>{currentUser.role === "superadmin" ? "Organization work queue" : currentUser.department}</p>
                <h2>{currentUser.role === "user" ? "My Active Tasks" : "Active Task Control"}</h2>
              </div>
              <strong className="result-count">{activeTaskSectionTasks.length} shown</strong>
            </div>
            {currentUser.role === "user" ? (
              <nav className="task-view-tabs" aria-label="Active task sections">
                <button className={activeTaskSection === "assigned" ? "active" : ""} onClick={() => setActiveTaskSection("assigned")} type="button">
                  <ClipboardList aria-hidden="true" size={17} />
                  <span><strong>Assigned to me</strong><small>Tasks only you can work on</small></span>
                  <b>{assignedActiveTasks.length}</b>
                </button>
                <button className={activeTaskSection === "free" ? "active" : ""} onClick={() => setActiveTaskSection("free")} type="button">
                  <Hand aria-hidden="true" size={17} />
                  <span><strong>Free tasks</strong><small>Available to take in your department</small></span>
                  <b>{freeActiveTasks.length}</b>
                </button>
              </nav>
            ) : (
              <nav className="task-view-tabs manager-task-tabs" aria-label="Manager task filters">
                <button className={managerTaskSection === "all" ? "active" : ""} onClick={() => setManagerTaskSection("all")} type="button">
                  <ClipboardList aria-hidden="true" size={17} /><span><strong>All active</strong><small>Complete work queue</small></span><b>{activeTasks.length}</b>
                </button>
                <button className={managerTaskSection === "review" ? "active" : ""} onClick={() => setManagerTaskSection("review")} type="button">
                  <CheckCircle2 aria-hidden="true" size={17} /><span><strong>Needs review</strong><small>Submitted by workers</small></span><b>{reviewTasks}</b>
                </button>
                <button className={managerTaskSection === "free" ? "active" : ""} onClick={() => setManagerTaskSection("free")} type="button">
                  <Hand aria-hidden="true" size={17} /><span><strong>Unassigned</strong><small>Free or awaiting a claim</small></span><b>{freeActiveTasks.length}</b>
                </button>
              </nav>
            )}
            <div className="active-queue-heading">
              <div>
                <strong>{currentUser.role === "user" ? activeTaskSection === "free" ? "Available tasks" : "Your workload" : managerTaskSection === "review" ? "Review queue" : managerTaskSection === "free" ? "Unassigned work" : "Current work"}</strong>
                <span>
                  Sorted by priority and due date
                  {activeSectionUrgentCount ? <span className="queue-flag queue-flag-urgent">{activeSectionUrgentCount} urgent</span> : null}
                  {activeSectionOverdueCount ? <span className="queue-flag queue-flag-overdue">{activeSectionOverdueCount} overdue</span> : null}
                </span>
              </div>
              {canAllocateTasks ? <button className="primary-button" onClick={() => setShowTaskComposer(true)} type="button"><Plus aria-hidden="true" size={16} />New Task</button> : null}
            </div>
            <div className="task-list">
              {activeTaskSectionTasks.length
                ? activeTaskSectionTasks.map((task) => renderTaskCard(task))
                : <p className="empty-state">{currentUser.role === "user"
                  ? activeTaskSection === "free" ? "There are no free tasks in your department right now." : "No active tasks are assigned to you."
                  : managerTaskSection === "review" ? "No tasks are waiting for review." : managerTaskSection === "free" ? "No tasks are currently unassigned." : "There are no active tasks."}</p>}
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
            {canManagePeople ? (
              <details className="people-management">
                <summary><UserPlus aria-hidden="true" size={17} /><span><strong>People management</strong><small>Create users{currentUser.role === "superadmin" ? " and departments" : " in your department"}</small></span></summary>
                <div className="people-management-grid">
                  {currentUser.role === "superadmin" ? (
                    <form className="person-form management-form" onSubmit={handleCreateDepartment}>
                      <h3>Create department</h3>
                      <label>Department name<input onChange={(event) => setDepartmentDraft(event.target.value)} value={departmentDraft} /></label>
                      <button className="primary-button" type="submit"><Plus aria-hidden="true" size={17} />Create Department</button>
                      {departmentMessage ? <p className="success-message">{departmentMessage}</p> : null}
                    </form>
                  ) : null}
                  <form className="person-form management-form" onSubmit={handleCreatePerson}>
                    <h3>Create user</h3>
                    <input name="name" placeholder="Full name" />
                    <input name="username" placeholder="username@mabunited.com" type="email" />
                    <input name="password" placeholder="Temporary password" type="password" />
                    {currentUser.role === "superadmin" ? <>
                      <select name="department" defaultValue={departments[0]}>{departments.map((department) => <option key={department} value={department}>{department}</option>)}</select>
                      <select name="role" defaultValue="user"><option value="user">Normal User</option><option value="admin">Admin</option><option value="superadmin">Super Admin</option></select>
                    </> : <input readOnly value={`${currentUser.department} - Normal User`} />}
                    <button className="primary-button" type="submit"><Plus aria-hidden="true" size={17} />Create User</button>
                    {peopleMessage ? <p className="success-message">{peopleMessage}</p> : null}
                  </form>
                </div>
              </details>
            ) : null}
            <div className="directory-grid">
              {visibleUsers.map((user) => {
                const metrics = user.role === "user" ? userMetrics(user.id) : null;
                const isEditing = editingUserId === user.id && editDraft;
                const canEditPerson = currentUser.role === "superadmin" || (
                  currentUser.role === "admin" && user.role === "user" && sameDepartment(user.department, currentUser.department)
                );
                const canDeletePerson = canEditPerson && user.id !== currentUser.id && user.role !== "superadmin";
                return (
                  <article className="directory-card" key={`people-${user.id}`}>
                    {isEditing ? (
                      <div className="directory-edit-form">
                        <div className="directory-edit-heading"><div><p>Edit user</p><h3>{user.name}</h3></div><Edit3 aria-hidden="true" size={18} /></div>
                        <label>Full name<input onChange={(event) => setEditDraft({ ...editDraft, name: event.target.value })} value={editDraft.name} /></label>
                        <label>Email / username<input onChange={(event) => setEditDraft({ ...editDraft, username: event.target.value })} type="email" value={editDraft.username} /></label>
                        <label>New password <small>Leave blank to keep the current password</small><input onChange={(event) => setEditDraft({ ...editDraft, password: event.target.value })} placeholder="Unchanged" type="password" value={editDraft.password} /></label>
                        {currentUser.role === "superadmin" ? (
                          <div className="directory-edit-grid">
                            <label>Role<select onChange={(event) => {
                              const role = event.target.value as UserRole;
                              setEditDraft({ ...editDraft, role, department: role === "superadmin" ? "Executive" : editDraft.department === "Executive" ? departments[0] : editDraft.department });
                            }} value={editDraft.role}><option value="user">Normal User</option><option value="admin">Admin</option><option value="superadmin">Super Admin</option></select></label>
                            <label>Department<select disabled={editDraft.role === "superadmin"} onChange={(event) => setEditDraft({ ...editDraft, department: event.target.value as DepartmentName })} value={editDraft.department}>
                              {editDraft.role === "superadmin" ? <option value="Executive">Executive</option> : departments.map((department) => <option key={department} value={department}>{department}</option>)}
                            </select></label>
                          </div>
                        ) : null}
                        <div className="directory-edit-actions">
                          <button className="ghost-button" onClick={() => { setEditingUserId(null); setEditDraft(null); }} type="button"><X aria-hidden="true" size={16} />Cancel</button>
                          <button className="primary-button" onClick={saveEditUser} type="button"><Save aria-hidden="true" size={16} />Save Changes</button>
                        </div>
                      </div>
                    ) : <>
                      <div className="member-heading">
                        <div><strong>{user.name}</strong><p>{user.username}</p></div>
                        <span>{roleLabels[user.role]}</span>
                      </div>
                      <div className="user-line">
                        <span>{user.department}</span>
                        {metrics ? <span>{metrics.active} active tasks</span> : <span>Management access</span>}
                      </div>
                      {canEditPerson ? <div className="directory-card-actions">
                        <button className="ghost-button" onClick={() => startEditUser(user)} type="button"><Edit3 aria-hidden="true" size={15} />Edit User</button>
                        {canDeletePerson ? <button className="icon-button danger" onClick={() => deleteUser(user.id)} type="button" aria-label={`Delete ${user.name}`}><Trash2 aria-hidden="true" size={15} /></button> : null}
                      </div> : null}
                    </>}
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
                        <thead><tr><th>Candidate</th><th>Productivity index</th><th>Achievement points</th><th>Active load</th><th>Finished in month</th><th>Avg. cycle time</th><th>Reopens</th><th>Report</th></tr></thead>
                        <tbody>{candidates.length ? candidates.map((user) => {
                          const metrics = userMetrics(user.id);
                          return <tr key={`team-${user.id}`}><td><strong>{user.name}</strong><small>{user.username}</small></td><td><strong>{metrics.performance.productivityIndex || "—"}</strong><small>{metrics.performance.status}</small></td><td>{metrics.performance.achievementPoints}</td><td>{metrics.activeComplexity} pts</td><td>{metrics.completedInMonth}</td><td>{metrics.completed ? `${metrics.averageCompletionDays.toFixed(1)} days` : "—"}</td><td>{metrics.performance.reopenTotal}</td><td><button className="icon-button" type="button" onClick={() => downloadProductivityReport(user.id, teamMonth)} title={`Download ${teamMonth} report`}><Download aria-hidden="true" size={15} /></button></td></tr>;
                        }) : <tr><td colSpan={8}>No normal users in this department.</td></tr>}</tbody>
                      </table></div>
                    </section>
                  );
                })}
            </div>
          </section>
        ) : activeView === "attendance" ? (() => {
          const candidates = currentUser.role === "user"
            ? users.filter((user) => user.id === currentUser.id)
            : productivityCandidates;
          const rows = candidates.map((user) => ({ user, metrics: attendanceMetrics(user.id, attendanceMonth) }));
          const presentToday = candidates.filter((user) => attendanceProfiles.find((profile) => profile.userId === user.id)?.records.some((record) => record.workDate === currentRiyadhDate())).length;
          const averageRate = rows.length ? average(rows.map((row) => row.metrics.attendanceRate)) : 0;
          return (
            <section className="panel attendance-page" id="attendance-page">
              <div className="attendance-header">
                <div><span><Calendar aria-hidden="true" size={22} /></span><div><p>Riyadh workday attendance</p><h2>Attendance</h2><small>Presence is recorded once per day at the first successful login.</small></div></div>
                <label>Attendance month<input type="month" value={attendanceMonth} onChange={(event) => setAttendanceMonth(event.target.value)} /></label>
              </div>
              <div className="attendance-summary">
                <span><strong>{presentToday}</strong>Present today</span>
                <span><strong>{candidates.length}</strong>Tracked employees</span>
                <span><strong>{Math.round(averageRate * 100)}%</strong>Average attendance</span>
                <span><strong>15%</strong>KPI weighting</span>
              </div>
              <div className="attendance-table-wrap">
                <table className="attendance-table">
                  <thead><tr><th>Employee</th><th>Department</th><th>Present days</th><th>Expected workdays</th><th>Attendance rate</th><th>Login sessions</th><th>Last login</th></tr></thead>
                  <tbody>{rows.map(({ user, metrics }) => (
                    <tr key={`attendance-${user.id}`}>
                      <td><span className="achievement-person"><i style={{ background: identityColor(user.id, currentUser.id) }}>{initials(user.name)}</i><span><strong>{user.name}</strong><small>{user.username}</small></span></span></td>
                      <td>{user.department}</td><td><strong>{metrics.presentDays}</strong></td><td>{metrics.expectedDays}</td>
                      <td><span className="attendance-rate"><i style={{ width: `${Math.round(metrics.attendanceRate * 100)}%` }} /><strong>{Math.round(metrics.attendanceRate * 100)}%</strong></span></td>
                      <td>{metrics.totalLogins}</td><td>{metrics.lastSeen ? new Date(metrics.lastSeen).toLocaleString("en-GB") : "No login recorded"}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              <p className="attendance-note"><ShieldCheck aria-hidden="true" size={16} />Working days are Saturday–Thursday, with Friday off. Attendance starts from the later of employee creation or system attendance tracking; future days are never counted as absences.</p>
            </section>
          );
        })() : activeView === "achievements" ? (() => {
          const availableDepartments = departments.filter((department) => department !== "Executive");
          const selectedDepartment = currentUser.role === "superadmin"
            ? achievementDepartment || availableDepartments[0] || ""
            : currentUser.department;
          const leaderboard = users
            .filter((user) => user.role === "user" && sameDepartment(user.department, selectedDepartment))
            .map((user) => ({ user, metrics: performanceMetrics(user.id, achievementMonth) }))
            .sort((first, second) => second.metrics.achievementPoints - first.metrics.achievementPoints || second.metrics.productivityIndex - first.metrics.productivityIndex);
          return (
            <section className="panel achievements-page" id="achievements-page">
              <header className="achievements-hero">
                <div><span><Trophy aria-hidden="true" size={24} /></span><div><p>Department performance race</p><h2>Monthly Achievements</h2><small>Fair scoring rewards difficult work, reliable quality, speed, and collaboration—not task count alone.</small></div></div>
                <div className="achievement-controls">
                  {currentUser.role === "superadmin" ? <label>Department<select value={selectedDepartment} onChange={(event) => setAchievementDepartment(event.target.value)}>{availableDepartments.map((department) => <option key={department} value={department}>{department}</option>)}</select></label> : null}
                  <label>Month<input type="month" value={achievementMonth} onChange={(event) => setAchievementMonth(event.target.value)} /></label>
                </div>
              </header>

              <div className="achievement-podium">
                {leaderboard.slice(0, 3).map(({ user, metrics }, index) => (
                  <article className={`achievement-winner rank-${index + 1} ${user.id === currentUser.id ? "current-user" : ""}`} key={user.id}>
                    <span className="achievement-rank">#{index + 1}</span>
                    <span className="achievement-avatar" style={{ background: identityColor(user.id, currentUser.id) }}>{initials(user.name)}</span>
                    <div><strong>{user.name}</strong><small>{metrics.status}</small></div>
                    <b>{metrics.achievementPoints}<small>points</small></b>
                  </article>
                ))}
                {!leaderboard.length ? <div className="achievement-empty"><Trophy aria-hidden="true" size={28} /><strong>No ranked members yet</strong><span>Completed work in {achievementMonth} will appear here.</span></div> : null}
              </div>

              <div className="achievement-table-wrap">
                <table className="achievement-table">
                  <thead><tr><th>Rank</th><th>Team member</th><th>Achievement points</th><th>Productivity index</th><th>Attendance</th><th>Complexity delivered</th><th>Speed vs peers</th><th>Team tasks</th><th>Reopens</th><th>Evaluation</th></tr></thead>
                  <tbody>{leaderboard.map(({ user, metrics }, index) => (
                    <tr className={user.id === currentUser.id ? "current-user" : ""} key={`achievement-${user.id}`}>
                      <td><strong>#{index + 1}</strong></td>
                      <td><span className="achievement-person"><i style={{ background: identityColor(user.id, currentUser.id) }}>{initials(user.name)}</i><span><strong>{user.name}</strong><small>{user.username}</small></span></span></td>
                      <td><strong>{metrics.achievementPoints}</strong></td>
                      <td><span className="achievement-index"><i style={{ width: `${Math.min(100, metrics.productivityIndex)}%` }} /><strong>{metrics.productivityIndex || "—"}</strong></span></td>
                      <td>{metrics.attendance.expectedDays ? `${Math.round(metrics.attendance.attendanceRate * 100)}%` : "—"}</td>
                      <td>{metrics.complexityDelivered} pts</td>
                      <td>{metrics.completed ? `${Math.round(metrics.averageSpeedFactor * 100)}%` : "—"}</td>
                      <td>{metrics.teamworkTasks}</td>
                      <td className={metrics.reopenTotal ? "metric-warning" : ""}>{metrics.reopenTotal}</td>
                      <td><span className={`achievement-status status-${metrics.status.toLowerCase().replace(/\s+/g, "-")}`} title={metrics.evaluationReasons.join(" · ")}>{metrics.status}</span></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>

              <details className="scoring-guide">
                <summary>How the fair score is calculated</summary>
                <div>
                  <p><strong>Complexity-weighted output:</strong> harder completed tasks start with more points.</p>
                  <p><strong>Comparable speed:</strong> cycle time is compared with the department median for work of the same complexity. It is capped to prevent gaming.</p>
                  <p><strong>Quality:</strong> each admin reopen reduces the task score. Reopen history is permanently recorded.</p>
                  <p><strong>Reliability:</strong> on-time delivery earns a bonus; late delivery receives a measured penalty.</p>
                  <p><strong>Teamwork:</strong> collaborative tasks earn a bonus, while points are shared fairly across assignees.</p>
                  <p><strong>Confidence:</strong> low sample sizes are adjusted toward neutral, so one easy task cannot create a misleading top score.</p>
                </div>
              </details>
            </section>
          );
        })() : activeView === "productivity" ? (
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
                      <span><strong>{metrics.activeComplexity}</strong>Active complexity</span>
                      <span><strong>{metrics.completedComplexity}</strong>Completed points</span>
                      <span><strong>{metrics.performance.productivityIndex || "—"}</strong>Productivity index</span>
                      <span><strong>{metrics.performance.achievementPoints}</strong>Achievement score</span>
                      <span><strong>{metrics.performance.reopenTotal}</strong>Admin reopens</span>
                      <span><strong>{metrics.performance.attendance.expectedDays ? `${Math.round(metrics.performance.attendance.attendanceRate * 100)}%` : "—"}</strong>Attendance KPI</span>
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
        ) : (
          <section className="panel finished-panel" id="finished-tasks">
            <header className="archive-header">
              <div className="archive-title-block">
                <span className="archive-title-icon"><Archive aria-hidden="true" size={22} /></span>
                <div><p>Completed work archive</p><h2>Finished Tasks</h2><span>Find completed work, delivery dates, and documents without the noise.</span></div>
              </div>
              <div className="archive-summary" aria-label="Archive summary">
                <span><strong>{finishedTasks.length}</strong>Total completed</span>
                <span><strong>{finishedTasks.filter((task) => task.completedAtIso?.startsWith(new Date().toISOString().slice(0, 7))).length}</strong>This month</span>
                <span><strong>{finishedTasks.length ? Math.round((finishedTasks.filter((task) => task.completedAtIso && task.completedAtIso.slice(0, 10) <= task.dueDate).length / finishedTasks.length) * 100) : 0}%</strong>On time</span>
              </div>
            </header>

            <div className="archive-search-area">
              <label className="archive-search">
                <Search aria-hidden="true" size={19} />
                <input
                  aria-label="Search by task ID"
                  onChange={(event) => setArchiveFilters((filters) => ({ ...filters, taskId: event.target.value }))}
                  placeholder="Search by task ID — partial IDs work, e.g. 104"
                  type="search"
                  value={archiveFilters.taskId}
                />
              </label>
              <strong className="archive-result-count">{filteredArchiveTasks.length} result{filteredArchiveTasks.length === 1 ? "" : "s"}</strong>
            </div>

            <details className="archive-filter-panel">
              <summary>More filters <span>Priority, person, and completion date</span></summary>
              <div className="archive-filter-grid">
                <label>Priority<select value={archiveFilters.priority} onChange={(event) => setArchiveFilters((filters) => ({ ...filters, priority: event.target.value as "" | TaskPriority }))}>
                  <option value="">All priorities</option>
                  {Object.entries(priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select></label>
                <label>Assigned person<select value={archiveFilters.assigneeId} onChange={(event) => setArchiveFilters((filters) => ({ ...filters, assigneeId: event.target.value }))}>
                  <option value="">All people</option>
                  {productivityCandidates.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
                </select></label>
                <label>Completed from<input type="date" value={archiveFilters.from} onChange={(event) => setArchiveFilters((filters) => ({ ...filters, from: event.target.value }))} /></label>
                <label>Completed to<input type="date" value={archiveFilters.to} onChange={(event) => setArchiveFilters((filters) => ({ ...filters, to: event.target.value }))} /></label>
                <button className="ghost-button" type="button" onClick={() => setArchiveFilters({ taskId: "", from: "", to: "", assigneeId: "", priority: "" })}>Clear filters</button>
              </div>
            </details>

            <div className="archive-task-list">
              {filteredArchiveTasks.length ? filteredArchiveTasks.map((task) => (
                <details className="archive-task-card" id={`task-${task.id}`} key={`archive-${task.id}`}>
                  <summary>
                    <span className="archive-check"><CheckCircle2 aria-hidden="true" size={17} /></span>
                    <span className="archive-task-name"><strong>{task.title}</strong><small>Task #{task.taskCode}{task.projectName ? ` · ${task.projectName}` : ""}</small></span>
                    <span className={`priority priority-${task.priority}`}>{priorityLabels[task.priority]}</span>
                    <span className="archive-owner">{task.candidateName || "Unassigned"}</span>
                    <span className="archive-completed"><small>Completed</small><strong>{task.completedAt || "Recorded"}</strong></span>
                  </summary>
                  <div className="archive-task-details">
                    <div><span>Department</span><strong>{task.department}</strong></div>
                    <div><span>Task type</span><strong>{task.taskType}</strong></div>
                    <div><span>Due date</span><strong>{task.dueDate || "Not scheduled"}</strong></div>
                    <div><span>Final progress</span><strong>{task.progress}%</strong></div>
                    <div><span>Complexity</span><strong>{complexityPoints(task)}/5</strong></div>
                    <div><span>Started</span><strong>{task.startedAt ? new Date(task.startedAt).toLocaleDateString("en-GB") : "Not recorded"}</strong></div>
                  </div>
                  {task.reviewComment ? <p className="archive-review-note"><strong>Final review</strong>{task.reviewComment}</p> : null}
                  {task.files.length ? <div className="archive-files">{task.files.map((file) => <button className="file-download" key={file.id} onClick={() => downloadTaskFile(file)} type="button"><span><strong>{file.name}</strong><small>{formatFileSize(file.size)}</small></span><Download aria-hidden="true" size={15} /></button>)}</div> : null}
                </details>
              )) : <div className="archive-empty"><Search aria-hidden="true" size={24} /><strong>No finished tasks found</strong><span>Try a shorter task ID or clear the additional filters.</span></div>}
            </div>
          </section>
        )}
      </section>
      {showChatPanel ? renderChatPanel() : null}
      <button
        aria-expanded={showChatPanel}
        aria-controls="department-chat"
        aria-label={showChatPanel ? "Close messages" : "Open messages"}
        className={`chat-launcher ${showChatPanel ? "open" : ""}`}
        onClick={() => void openDepartmentChat()}
        type="button"
      >
        <span className="chat-launcher-avatar" aria-hidden="true">
          {showChatPanel ? <X size={19} /> : <MessageSquare size={19} />}
        </span>
        <span className="chat-launcher-copy">
          <strong>{showChatPanel ? "Close messages" : "Messages"}</strong>
          <small>{unreadChatMessages ? `${unreadChatMessages} unread` : "Department & direct chat"}</small>
        </span>
        {unreadChatMessages && !showChatPanel ? <b>{unreadChatMessages > 99 ? "99+" : unreadChatMessages}</b> : null}
      </button>
      {showTaskComposer && canAllocateTasks ? (
        <div className="task-composer-backdrop" role="presentation" onMouseDown={() => setShowTaskComposer(false)}>
          <section className="task-composer-dialog" role="dialog" aria-modal="true" aria-labelledby="new-task-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="task-composer-header">
              <div><p>Available from every workspace</p><h2 id="new-task-title">Create New Task</h2></div>
              <button className="icon-button" onClick={() => setShowTaskComposer(false)} type="button" aria-label="Close new task form"><X aria-hidden="true" size={17} /></button>
            </div>
            <form className="person-form task-composer-form" onSubmit={handleAllocateTask}>
              <input onChange={(event) => setTaskDraft((draft) => ({ ...draft, title: event.target.value }))} placeholder="Task title" value={taskDraft.title} />
              <label>Project
                <select
                  onChange={(event) => {
                    const project = projects.find((item) => item.id === event.target.value);
                    setTaskDraft((draft) => ({ ...draft, projectId: project?.id ?? "", department: project?.department ?? draft.department, assigneeIds: [] }));
                  }}
                  value={taskDraft.projectId}
                >
                  <option value="">No project</option>
                  {projects.map((project) => <option key={project.id} value={project.id}>{project.name} - {project.department}</option>)}
                </select>
              </label>
              {currentUser.role === "superadmin" && !taskDraft.projectId ? (
                <label>Department
                  <select onChange={(event) => setTaskDraft((draft) => ({ ...draft, department: event.target.value as DepartmentName, assigneeIds: [] }))} value={taskDraft.department}>
                    {departments.map((department) => <option key={department} value={department}>{department}</option>)}
                  </select>
                </label>
              ) : null}
              <label className="multi-select-field task-composer-candidates">Assign people
                <CandidatePicker
                  candidates={taskDraftAssignableUsers}
                  emptyMessage={selectedDraftProject ? "This project has no available members. Add people to the project first." : `No normal users are available in ${taskDraft.department}.`}
                  onChange={(assigneeIds) => setTaskDraft((draft) => ({ ...draft, assigneeIds }))}
                  selectedIds={taskDraft.assigneeIds}
                />
              </label>
              <div className="task-composer-grid">
                <label>Task type<select onChange={(event) => setTaskDraft((draft) => ({ ...draft, taskType: event.target.value as TaskType }))} value={taskDraft.taskType}>{taskTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
                <label>Priority<select onChange={(event) => setTaskDraft((draft) => ({ ...draft, priority: event.target.value as TaskPriority }))} value={taskDraft.priority}><option value="low">Low priority</option><option value="medium">Medium priority</option><option value="high">High priority</option><option value="urgent">Urgent priority</option></select></label>
                <label>Complexity <small>Manager-selected workload score; unrelated to duration</small><select onChange={(event) => setTaskDraft((draft) => ({ ...draft, complexity: Number(event.target.value) }))} value={taskDraft.complexity}>{[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value} / 5 · {complexityLabels[value]}</option>)}</select></label>
                <label>Planned due date <small>{taskDraft.assigneeIds.length ? "Optional and set independently by the manager" : "Available after a user is assigned"}</small><input disabled={!taskDraft.assigneeIds.length} onChange={(event) => setTaskDraft((draft) => ({ ...draft, dueDate: event.target.value }))} type="date" value={taskDraft.assigneeIds.length ? taskDraft.dueDate : ""} /></label>
                <label>Initial progress<input disabled={!taskDraft.assigneeIds.length} max="100" min="0" onChange={(event) => setTaskDraft((draft) => ({ ...draft, progress: Number(event.target.value) }))} type="number" value={taskDraft.assigneeIds.length ? taskDraft.progress : 0} /></label>
              </div>
              <label className="file-upload task-create-files"><Paperclip aria-hidden="true" size={16} />Add task documents<input multiple onChange={(event) => setTaskFiles(Array.from(event.target.files ?? []))} type="file" /></label>
              {taskFiles.length ? <p className="selected-files">{taskFiles.map((file) => file.name).join(", ")}</p> : null}
              {allocationMessage ? <p className="success-message">{allocationMessage}</p> : null}
              <div className="task-composer-actions">
                <button className="ghost-button" onClick={() => setShowTaskComposer(false)} type="button">Cancel</button>
                <button className="primary-button" type="submit"><Plus aria-hidden="true" size={17} />Create Task</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
      {confirmation ? (
        <div className="confirmation-backdrop" role="presentation" onMouseDown={() => setConfirmation(null)}>
          <section className="confirmation-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirmation-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className={`confirmation-icon ${confirmation.danger ? "" : "safe"}`}>{confirmation.danger ? <AlertTriangle aria-hidden="true" size={24} /> : <CheckCircle2 aria-hidden="true" size={24} />}</div>
            <h2 id="confirmation-title">{confirmation.title}</h2>
            <p>{confirmation.message}</p>
            <div className="confirmation-actions">
              <button className="ghost-button" type="button" onClick={() => setConfirmation(null)}>Cancel</button>
              <button className={confirmation.danger ? "danger-button" : "primary-button"} type="button" onClick={() => {
                const action = confirmation.onConfirm;
                setConfirmation(null);
                void action();
              }}>{confirmation.confirmLabel}</button>
            </div>
          </section>
        </div>
      ) : null}
      {deletingChatMessage ? (
        <div className="confirmation-backdrop chat-delete-backdrop" role="presentation" onMouseDown={() => setDeletingChatMessage(null)}>
          <section className="confirmation-dialog chat-delete-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-message-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="confirmation-icon"><Trash2 aria-hidden="true" size={23} /></div>
            <h2 id="delete-message-title">Delete message?</h2>
            <p>Choose whether to remove it only from your view or from the conversation.</p>
            <div className="chat-delete-options">
              <button className="ghost-button" type="button" onClick={() => void deleteChatMessage(deletingChatMessage, "me")}>
                <Trash2 aria-hidden="true" size={16} /><span><strong>Delete for me</strong><small>Other people will still see this message.</small></span>
              </button>
              {deletingChatMessage.authorId === currentUser.id ? (
                <button className="danger-button" type="button" onClick={() => void deleteChatMessage(deletingChatMessage, "everyone")}>
                  <Users aria-hidden="true" size={16} /><span><strong>Delete for everyone</strong><small>A deleted-message notice will remain.</small></span>
                </button>
              ) : null}
            </div>
            <button className="ghost-button" type="button" onClick={() => setDeletingChatMessage(null)}>Cancel</button>
          </section>
        </div>
      ) : null}
    </main>
  );
}
