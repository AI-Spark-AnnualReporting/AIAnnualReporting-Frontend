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
