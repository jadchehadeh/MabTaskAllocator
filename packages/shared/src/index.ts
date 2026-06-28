export type TaskPriority = "low" | "medium" | "high" | "urgent";

export type TaskStatus = "new" | "assigned" | "in_progress" | "blocked" | "done";

export type UserRole = "superadmin" | "admin" | "user";

export type DepartmentName =
  | "Executive"
  | "Mechanical Technical office engineer"
  | "Electrical Technical office engineer";

export interface AppUser {
  id: string;
  name: string;
  username: string;
  password: string;
  role: UserRole;
  department: DepartmentName;
}

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  department: string;
  capacity: number;
  assignedTasks: number;
}

export interface TaskSummary {
  id: string;
  title: string;
  department: string;
  priority: TaskPriority;
  status: TaskStatus;
  assigneeName?: string;
  candidateName?: string;
  dueDate: string;
  progress: number;
}
