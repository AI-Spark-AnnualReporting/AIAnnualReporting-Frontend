import type {
  SectionMode,
  SectionLayer,
  SectionStatus,
  CompanyProfile,
  Sector,
} from "@/types"

export const SESSION_STATUSES = {
  assigned: { label: "Assigned", color: "slate" },
  not_started: { label: "Not Started", color: "gray" },
  in_progress: { label: "In Progress", color: "blue" },
  submitted: { label: "Submitted", color: "yellow" },
  approved: { label: "Approved", color: "green" },
  reopened: { label: "Needs Changes", color: "red" },
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

// Report-section badge maps. `color` holds full Tailwind class fragments
// (StatusBadge's colorMap lacks violet/cyan/neutral, so section badges render
// these directly via a local span instead of through StatusBadge).
export const SECTION_MODES: Record<
  SectionMode,
  { label: string; color: string; hint: string }
> = {
  generate: {
    label: "AI-written",
    color: "bg-violet-100 text-violet-700 border-violet-200",
    hint: "Drafted by the narrative agent, refined by you",
  },
  attach: {
    label: "Upload",
    color: "bg-cyan-100 text-cyan-700 border-cyan-200",
    hint: "You upload the source document; embedded as-is",
  },
  auto: {
    label: "System",
    color: "bg-neutral-100 text-neutral-700 border-neutral-200",
    hint: "Generated automatically at render (cover, contents)",
  },
  extract: {
    label: "Extract",
    color: "bg-emerald-100 text-emerald-700 border-emerald-200",
    hint: "Upload a document; AI extracts the content for you to review and edit",
  },
  analyze: {
    label: "Analyze",
    color: "bg-indigo-100 text-indigo-700 border-indigo-200",
    hint: "Structured findings produced by the analyze agent across department digests",
  },
}

export const SECTION_LAYERS: Record<
  SectionLayer,
  { label: string; color: string }
> = {
  common: { label: "Common", color: "bg-slate-100 text-slate-700 border-slate-200" },
  cma: { label: "CMA Required", color: "bg-blue-100 text-blue-700 border-blue-200" },
  sector: { label: "Sector", color: "bg-indigo-100 text-indigo-700 border-indigo-200" },
  optional: { label: "Optional", color: "bg-gray-100 text-gray-700 border-gray-200" },
}

export const SECTION_STATUSES: Record<
  SectionStatus,
  { label: string; color: string }
> = {
  pending: { label: "Pending", color: "bg-gray-100 text-gray-700 border-gray-200" },
  drafting: { label: "Drafting", color: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  locked: { label: "Locked", color: "bg-green-100 text-green-700 border-green-200" },
}

export const COMPANY_PROFILES: Record<CompanyProfile, string> = {
  listed: "Listed (Tadawul)",
  private: "Private",
}

export const SECTORS: Record<Sector, string> = {
  bank: "Bank",
  insurance: "Insurance",
  general: "General",
  reit: "REIT",
  finance_co: "Finance Company",
}

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
  BUILD_READINESS: (cycleId: string) => ["pm", "cycle", cycleId, "readiness"],
  PM_CYCLE_SECTIONS: (cycleId: string) => ["pm", "cycle", cycleId, "sections"],
  PM_CYCLE_PLAN: (cycleId: string) => ["pm", "cycle", cycleId, "plan"],
  PM_AVAILABLE_OPTIONAL: (cycleId: string) => ["pm", "cycle", cycleId, "optional-available"],
  PM_ASSEMBLY_READINESS: (cycleId: string) => ["pm", "cycle", cycleId, "assembly-readiness"],
  PM_FINAL_REPORT: (cycleId: string) => ["pm", "cycle", cycleId, "final-report"],
  DEPT_DASHBOARD: ["dept", "dashboard"],
  SESSION: (id: string) => ["session", id],
  DOCUMENTS: ["documents"],
} as const
