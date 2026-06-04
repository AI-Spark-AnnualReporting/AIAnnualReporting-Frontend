export type UserRole = "admin" | "project_manager" | "department_user"
export type UserStatus = "active" | "inactive" | "pending" | "suspended"
export type CycleStatus = "draft" | "active" | "completed" | "archived" | "closed"
export type SessionStatus =
  | "assigned"
  | "not_started"
  | "in_progress"
  | "submitted"
  | "approved"
  | "reopened"

export type PMReviewAction = "approved" | "rejected" | "reopened"

// ── Company profile & report sections ──────────────────────────────────────
export type CompanyProfile = "listed" | "private"
export type Sector = "bank" | "insurance" | "general" | "reit" | "finance_co"
export type SectionMode = "generate" | "attach" | "auto" | "extract" | "analyze"
export type SectionLayer = "common" | "cma" | "sector" | "optional"
export type SectionStatus = "pending" | "drafting" | "locked"

export interface User {
  id?: string
  user_id: string
  email: string
  full_name: string
  role: UserRole
  status: UserStatus
  department?: string | null
  department_id?: string | null
  phone?: string | null
  created_at?: string
  updated_at?: string
  last_login?: string | null
  email_verified?: boolean
}

export interface AuthTokens {
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number
}

export interface LoginResponse extends AuthTokens {
  success: boolean
  message: string
  user_id: string
  email: string
  full_name: string
  role: UserRole
}

export interface Department {
  /** Some backends return "id", others "department_id" — support both */
  id?: string
  department_id?: string
  department_code: string
  department_name: string
  description?: string
  is_active: boolean
  /** True for pre-seeded/system departments that were pre-loaded by the platform */
  is_system?: boolean
  created_at: string
  initial_prompt?: string
  system_prompt?: string
}

export interface Cycle {
  id: string
  cycle_name: string
  fiscal_year: number
  start_date: string
  end_date: string
  submission_deadline: string
  status: CycleStatus
  project_manager_id?: string
  pm_name?: string
  kickoff_brief?: string
  enriched_context?: string
  total_departments?: number
  submitted_count?: number
  created_at: string
  // Company profile — null on pre-existing cycles created before this field existed
  company_profile: CompanyProfile | null
  sector: Sector | null
  is_shariah: boolean
  has_subsidiaries: boolean
  has_sukuk: boolean
}

// Source document attached to an attach-mode section.
export interface AttachmentInfo {
  document_id: string
  filename: string
  file_type: string
  file_size: number
  uploaded_at: string
}

// A resolved report section, enriched via the section-definitions join.
export interface CycleReportSection {
  section_code: string
  title: string
  layer: SectionLayer
  content_source: "narrative" | "structured" | "financials" | "composite"
  mode: SectionMode
  status: SectionStatus
  display_order: number
  ai_allowed: boolean
  // Attach-mode state. Populated for attach sections; benign defaults elsewhere.
  verified: boolean
  locked_at: string | null
  attachment: AttachmentInfo | null
  // Generate-mode content. Populated after the LLM pass for generate sections;
  // null on pending generate sections and irrelevant for attach/auto.
  content: string | null
}

export interface ResolveSectionsResponse {
  success: boolean
  cycle_id: string
  sections_created: number
  sections: CycleReportSection[]
}

// ──────────────────────────────────────────────────────────────────────
// Stage 6 — Plan Review Screen
// The AI-generated plan: a headline, themes, and per-section feeders.
// `feeders` is the routing map the PM reviews and edits.
// ──────────────────────────────────────────────────────────────────────

export interface ReportTheme {
  title: string
  description: string
}

export interface FeederMapEntry {
  section_code: string
  title: string
  departments: string[] // department codes
  // Extract-mode entries also carry their mode and whether a source document
  // has been uploaded yet — both sources are optional and independent.
  mode?: SectionMode
  document_uploaded?: boolean
}

export interface PlanResponse {
  cycle_id: string
  headline: string | null
  themes: ReportTheme[]
  plan_generated_at: string | null
  feeders: FeederMapEntry[]
  // Server-side blueprint lock. Once `sections_locked` is true the plan is
  // frozen: sources, ordering, optional sections, themes/headline, and
  // regeneration are all rejected (409) by the backend. One-way — no unlock.
  sections_locked: boolean
  sections_locked_at: string | null
  sections_locked_by: string | null
}

export interface AvailableOptionalSection {
  section_code: string
  title: string
  layer: SectionLayer
}

// ──────────────────────────────────────────────────────────────────────
// Stage 8 — Assemble & Final Report
// ──────────────────────────────────────────────────────────────────────

export interface AssemblyReadiness {
  cycle_id: string
  total: number
  locked: number
  can_assemble: boolean
  unlocked_sections: Array<{
    section_code: string
    title: string
    layer: SectionLayer
  }>
  has_final_report: boolean
  final_report_generated_at: string | null
}

export interface FinalReportSection {
  type: "narrative" | "attachment" | "auto"
  section_code: string
  title: string
  order: number
  content?: string
  document?: {
    document_id: string
    filename: string
    file_type: string
    file_size?: number
  }
}

export interface FinalReport {
  cycle_id: string
  headline: string | null
  executive_summary: string | null
  word_count: number
  status: string
  generated_at: string | null
  sections: FinalReportSection[]
}

// Readiness of a cycle to enter the Report Builder.
export interface BuildReadiness {
  sections_resolved: boolean
  sections_total: number
  departments_total: number
  departments_approved: number
  all_approved: boolean
  status_breakdown: Record<string, number>
  can_build: boolean
}

export interface BriefQuality {
  quality: "low" | "acceptable" | "good"
  total: number
  length_score?: number
  specificity_score?: number
  cycle_relevance_score?: number
  missing: string[]
  suggestion: string
}

export interface KickoffBriefResponse {
  success: boolean
  message: string
  cycle_id: string
  departments_processed: number
  used_document_context?: boolean
  brief_quality?: BriefQuality
  warning?: string
  enrichment_applied?: boolean
}

export interface CycleOverview {
  cycle: {
    id: string
    cycle_name: string
    status: CycleStatus
  }
  stats: {
    total_departments: number
    assigned: number
    not_started: number
    in_progress: number
    submitted: number
    approved: number
    reopened: number
    completion_rate: number
  }
  departments: SessionSummary[]
}

export interface SessionSummary {
  session_id: string
  department_id: string
  department_name: string
  department_code: string
  user_id?: string
  user_name?: string
  user_email?: string
  status: SessionStatus
  progress_percentage: number
  submitted_at?: string
}

export interface Question {
  question_id: string
  question: string
  order: number
}

export interface Answer {
  question_id: string
  question: string
  answer: string
  ai_suggestion?: string | null
  answered_at?: string
}

export interface Session {
  session_id: string
  cycle_id: string
  department_id: string
  department_name: string
  user_id?: string
  status: SessionStatus
  progress_percentage: number
  questions: Question[]
  answers: Answer[]
  ai_generated_draft?: string | null
  final_submission?: string | null
  submitted_at?: string | null
  review_notes?: string | null
  reviewed_at?: string | null
}

export interface DepartmentDashboard {
  /** Top-level user info returned by GET /department/dashboard */
  user_id: string
  user_name: string
  /** Assignments replaces the old "active_sessions" field */
  assignments: {
    session_id: string
    cycle_id: string
    department_id: string
    department_name: string
    department_code: string
    cycle_name: string
    fiscal_year: number
    submission_deadline: string
    status: SessionStatus
    progress_percentage: number
    has_questions: boolean
    review_notes?: string | null
  }[]
  total_assignments: number
  pending_count: number
  submitted_count: number
  /** Optional — may not be present in all backend versions */
  notifications?: {
    id: string
    type: string
    message: string
    created_at: string
    is_read: boolean
  }[]
}

export interface Notification {
  id: string
  notification_type: string
  type?: string
  title?: string
  message: string
  priority?: "normal" | "high" | "urgent" | "critical"
  related_id?: string
  created_at: string
  is_read: boolean
}

export interface NotificationListResponse {
  notifications: Notification[]
  total: number
  unread_count: number
}

export interface NotificationUnreadCountResponse {
  unread_count: number
}

export interface NotificationMarkReadResponse {
  success: boolean
  message: string
}

export interface PMDashboard {
  active_cycles: {
    id: string
    cycle_name: string
    fiscal_year?: number
    status?: string
    submission_deadline?: string
    total_departments: number
    submitted_count: number
    /** Per-status counts computed from the real GET /pm/cycles/{id}/sessions endpoint */
    in_progress_count?: number
    not_started_count?: number
    reopened_count?: number
    /** Average of every department's progress_percentage across the cycle */
    completion_rate: number
  }[]
  pending_reviews: number
  recent_submissions: {
    session_id: string
    department_name: string
    cycle_name?: string
    submitted_at: string
    status?: SessionStatus
  }[]
}

export interface AdminStats {
  total_users: number
  active_users: number
  pending_users: number
  inactive_users: number
  by_role: {
    admin: number
    project_manager: number
    department_user: number
  }
  active_cycles?: number
  total_departments?: number
}

export interface Document {
  id: string
  document_id: string
  filename: string
  file_type: string
  file_size: number
  created_at: string
}

export type DocumentPurpose =
  | "kickoff"
  | "reference"
  | "submission"
  | "supporting"
  | "template"

// A row from GET /knowledge-base/documents. Every nullable field below can be
// null for deleted/unlinked records — render with fallbacks.
export interface KBDocument {
  id: string
  document_id: string
  filename: string
  file_type: string
  file_size: number
  document_purpose: DocumentPurpose | null
  user_id: string | null
  uploader_name: string | null
  department_id: string | null
  department_name: string | null
  cycle_id: string | null
  cycle_name: string | null
  created_at: string
}

// GET /knowledge-base/documents/{id} — single-document metadata. Unlike the
// list row this carries word_count but not the resolved *_name fields.
export interface KBDocumentDetail {
  id: string
  document_id: string
  filename: string
  file_type: string
  file_size: number
  user_id: string | null
  cycle_id: string | null
  department_id: string | null
  document_purpose: DocumentPurpose | null
  word_count: number
  created_at: string
}

// GET /knowledge-base/documents/{id}/text
export interface KBDocumentText {
  success: boolean
  document_id: string
  text: string
  word_count: number
}

export interface KBListResponse {
  success: boolean
  documents: KBDocument[]
  // Full count before pagination — drive the pager off this, not documents.length.
  total: number
  page: number
  page_size: number
}

export interface KBDownloadResponse {
  success: boolean
  document_id: string
  filename: string
  download_url: string
  expires_in: number
}

export interface ApiError {
  error: string
  message: string
  details?: Record<string, unknown>
}

export interface PaginatedResponse<T> {
  success: boolean
  total: number
  page: number
  page_size: number
  total_pages: number
  items?: T[]
}
