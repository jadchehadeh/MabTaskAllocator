import type { TaskSummary, TeamMember } from "@mab/shared";

export const teamMembers: TeamMember[] = [
  {
    id: "tm-1",
    name: "Sara Ahmed",
    role: "Mechanical Technical Office Engineer",
    department: "Mechanical Technical office engineer",
    capacity: 8,
    assignedTasks: 5
  },
  {
    id: "tm-2",
    name: "Omar Khalid",
    role: "Electrical Technical Office Engineer",
    department: "Electrical Technical office engineer",
    capacity: 6,
    assignedTasks: 3
  },
  {
    id: "tm-3",
    name: "Maya Nasser",
    role: "Electrical Technical Office Engineer",
    department: "Electrical Technical office engineer",
    capacity: 7,
    assignedTasks: 6
  }
];

export const tasks: TaskSummary[] = [
  {
    id: "task-1",
    title: "Prepare HVAC shop drawing package",
    department: "Mechanical Technical office engineer",
    priority: "high",
    status: "assigned",
    assigneeName: "Sara Ahmed",
    candidateName: "Sara Ahmed",
    dueDate: "2026-07-01",
    progress: 62
  },
  {
    id: "task-2",
    title: "Review electrical load schedule",
    department: "Electrical Technical office engineer",
    priority: "medium",
    status: "in_progress",
    assigneeName: "Omar Khalid",
    candidateName: "Omar Khalid",
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
