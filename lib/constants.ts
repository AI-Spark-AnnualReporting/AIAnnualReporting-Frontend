export const SESSION_STATUSES = {
  not_started: { label: "Not Started", color: "gray" },
  in_progress: { label: "In Progress", color: "blue" },
  submitted: { label: "Submitted", color: "purple" },
  reviewed: { label: "Reviewed", color: "indigo" },
  approved: { label: "Approved", color: "green" },
  rejected: { label: "Rejected", color: "red" },
  reopened: { label: "Needs Changes", color: "orange" },
} as const

export const CYCLE_STATUSES = {
  draft: { label: "Draft", color: "gray" },
  active: { label: "Active", color: "green" },
  completed: { label: "Completed", color: "blue" },
  archived: { label: "Archived", color: "yellow" },
  closed: { label: "Closed", color: "red" },
} as const

export const USER_STATUSES = {
  active: { label: "Active", color: "green" },
  inactive: { label: "Inactive", color: "gray" },
  pending: { label: "Pending", color: "yellow" },
  suspended: { label: "Suspended", color: "red" },
} as const

export const USER_ROLES = {
  admin: { label: "Admin" },
  project_manager: { label: "Project Manager" },
  department_user: { label: "Department User" },
} as const

export const TONE_OPTIONS = [
  { value: "executive", label: "Executive", description: "Concise, strategic" },
  { value: "professional", label: "Professional", description: "Formal, corporate" },
  { value: "technical", label: "Technical", description: "Detailed, precise" },
  { value: "conversational", label: "Conversational", description: "Friendly, accessible" },
  { value: "formal", label: "Formal", description: "Official document style" },
] as const

export const QUERY_KEYS = {
  ME: ["me"],
  ADMIN_STATS: ["admin", "stats"],
  USERS: (filters?: Record<string, unknown>) => ["users", filters],
  USER: (id: string) => ["user", id],
  DEPARTMENTS: ["departments"],
  CYCLES: (filters?: Record<string, unknown>) => ["cycles", filters],
  CYCLE: (id: string) => ["cycle", id],
  CYCLE_OVERVIEW: (id: string) => ["cycle", id, "overview"],
  PM_DASHBOARD: ["pm", "dashboard"],
  PM_CYCLE: (id: string) => ["pm", "cycle", id],
  DEPT_DASHBOARD: ["dept", "dashboard"],
  SESSION: (id: string) => ["session", id],
  DOCUMENTS: ["documents"],
} as const
