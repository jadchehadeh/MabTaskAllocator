import { FormEvent, useMemo, useState } from "react";
import {
  AlertTriangle,
  ClipboardList,
  Edit3,
  Gauge,
  KeyRound,
  Lock,
  LogOut,
  Plus,
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
  },
  {
    id: "user-bilal",
    name: "Bilal",
    username: "bilal@mabunited.com",
    password: "bilal123",
    role: "admin",
    department: "Mechanical Technical office engineer"
  },
  {
    id: "user-super-user",
    name: "MAB Super User",
    username: "super.user@mabunited.com",
    password: "super12345",
    role: "admin",
    department: "Electrical Technical office engineer"
  },
  {
    id: "user-ali",
    name: "Ali",
    username: "ali@mabunited.com",
    password: "ali123",
    role: "user",
    department: "Mechanical Technical office engineer"
  },
  {
    id: "user-sara",
    name: "Sara Ahmed",
    username: "sara.ahmed@mabunited.com",
    password: "sara123",
    role: "user",
    department: "Mechanical Technical office engineer"
  },
  {
    id: "user-maya",
    name: "Maya Nasser",
    username: "maya.nasser@mabunited.com",
    password: "maya123",
    role: "user",
    department: "Electrical Technical office engineer"
  }
];

const seededTasks: ManagedTask[] = [
  {
    id: "task-1",
    title: "Prepare HVAC shop drawing package",
    department: "Mechanical Technical office engineer",
    priority: "high",
    status: "in_progress",
    assigneeId: "user-ali",
    candidateName: "Ali",
    dueDate: "2026-07-01",
    progress: 62
  },
  {
    id: "task-2",
    title: "Review electrical load schedule",
    department: "Electrical Technical office engineer",
    priority: "medium",
    status: "assigned",
    assigneeId: "user-maya",
    candidateName: "Maya Nasser",
    dueDate: "2026-07-03",
    progress: 35
  },
  {
    id: "task-3",
    title: "Resolve MEP coordination comments",
    department: "Mechanical Technical office engineer",
    priority: "urgent",
    status: "new",
    candidateName: "Unassigned",
    dueDate: "2026-06-30",
    progress: 0
  }
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
  done: "Done"
};

const roleLabels: Record<UserRole, string> = {
  superadmin: "Super Admin",
  admin: "Admin",
  user: "Normal User"
};

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

          <div className="credential-note">
            <strong>Department admin</strong>
            <span>bilal@mabunited.com / bilal123</span>
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
  const [taskDraft, setTaskDraft] = useState({
    title: "Prepare client visit checklist",
    assigneeId: "user-ali",
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
    if (currentUser.role === "superadmin") return tasks;
    return tasks.filter((task) => task.department === currentUser.department);
  }, [currentUser, tasks]);

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

  function handleAllocateTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentUser || !canAllocateTasks) return;

    const assignee = users.find((user) => user.id === taskDraft.assigneeId);

    if (!assignee) {
      setAllocationMessage("Choose a valid normal user.");
      return;
    }

    if (currentUser.role === "admin" && assignee.department !== currentUser.department) {
      setAllocationMessage("Admins can allocate tasks only inside their own department.");
      return;
    }

    const newTask: ManagedTask = {
      id: `task-${Date.now()}`,
      title: taskDraft.title,
      department: assignee.department,
      priority: taskDraft.priority,
      status: taskDraft.progress > 0 ? "in_progress" : "assigned",
      assigneeId: assignee.id,
      candidateName: assignee.name,
      dueDate: taskDraft.dueDate,
      progress: taskDraft.progress
    };

    setTasks((existingTasks) => [newTask, ...existingTasks]);
    setAllocationMessage(`${currentUser.name} allocated "${taskDraft.title}" to ${assignee.name}.`);
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
                    onChange={(event) => setTaskDraft((draft) => ({ ...draft, assigneeId: event.target.value }))}
                    value={taskDraft.assigneeId}
                  >
                    {assignableUsers.map((user) => (
                      <option key={user.id} value={user.id}>{user.name} - {user.department}</option>
                    ))}
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
              {visibleTasks.map((task) => (
                <article className="task-row task-row-progress" key={task.id}>
                  <div>
                    <strong>{task.title}</strong>
                    <p>{task.department} - Due {task.dueDate}</p>
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
                </article>
              ))}
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
