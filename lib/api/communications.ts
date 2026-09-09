import axios, { AxiosInstance, InternalAxiosRequestConfig } from "axios"
import { centriyonLoginUrl } from "@/lib/centriyon"
import { agentRunPath } from "@/lib/reportReadiness"

/**
 * Communication Hub API — threads, threadless reports, members, and messages.
 *
 * These endpoints live on the CENTRION backend (a different host than the
 * Annual Report backend that `apiClient` talks to), so this module uses its own
 * axios instance pointed at NEXT_PUBLIC_CENTRION_API_URL. It reuses the same
 * Centriyon-issued JWT from localStorage. company_id is never sent — the
 * backend derives it from the token.
 *
 * Set NEXT_PUBLIC_CENTRION_API_URL to the Centrion backend base (including the
 * `/api/v1` suffix). Dev default: http://localhost:8000/api/v1
 */
const CENTRION_BASE_URL =
  process.env.NEXT_PUBLIC_CENTRION_API_URL || "http://localhost:8000/api/v1"

const commClient: AxiosInstance = axios.create({
  baseURL: CENTRION_BASE_URL,
  headers: { "Content-Type": "application/json" },
  timeout: 30000,
})

// Attach the Centriyon-issued JWT (same token the rest of the app uses).
commClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("access_token")
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`
    }
  }
  return config
})

// Normalize errors to { error, message, status, details } (matching the main
// client) so components can read `.status`. 401 → bounce to Centriyon login.
commClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && typeof window !== "undefined") {
      localStorage.removeItem("access_token")
      localStorage.removeItem("refresh_token")
      window.location.href = centriyonLoginUrl()
    }
    const data = error.response?.data
    const detail = typeof data?.detail === "string" ? data.detail : null
    return Promise.reject({
      error: data?.error || detail || "UNKNOWN_ERROR",
      message: data?.message || detail || error.message || "An unexpected error occurred",
      status: error.response?.status,
      details: data,
    })
  },
)

// ── Start-a-communication modal ───────────────────────────────────────────

// A report-type pill. `count` = number of threadless reports of this type; it
// stays constant regardless of the active filter (always the unfiltered set).
export interface ThreadlessReportType {
  code: string
  label: string
  count: number
}

// A report that doesn't have a communication thread yet.
export interface ThreadlessReport {
  id: string
  report_type: string
  period: string
  status: string
  created_at: string
  // One general thread and one private thread per person, per report.
  // Which flag disables the row depends on the Private tickbox.
  has_general_thread: boolean
  has_my_private_thread: boolean
  // "cycle" → this row is a reporting cycle with no annual report behind it
  // yet, and `id` is the cycle's. Starting a thread on it creates that report
  // server-side; nothing else here needs to know. Absent on real reports.
  source?: "cycle"
}

export interface ThreadlessReportsResponse {
  types: ThreadlessReportType[]
  reports: ThreadlessReport[]
}

// A company member eligible to be @mentioned. `id` is the UUID the write
// endpoints expect; `user_id` (usr_… string) is display-only — never send it.
export interface CommunicationMember {
  id: string
  user_id: string
  full_name: string
  role: string
  // Presentation fields — use directly, no client-side role mapping.
  display_role: string
  initials: string
  department: string | null
}

export interface CommunicationMembersResponse {
  members: CommunicationMember[]
}

export interface StartThreadBody {
  report_id: string
  message: string
  // Members' `id` UUIDs (NOT their usr_ `user_id`). Empty array if none.
  // On a private thread these people ARE the members — 422 if empty.
  mentioned_user_ids: string[]
  // Only the mentioned people can see the thread. Omit for a normal thread.
  is_private?: boolean
}

export interface CommunicationThread {
  id: string
  company_id: string
  report_id: string
  created_by: string
  created_at: string
  updated_at: string
}

export interface CommunicationMessage {
  id: string
  thread_id: string
  sender_id: string
  body: string
  mentioned_user_ids: string[]
  created_at: string
}

export interface StartThreadResponse {
  thread: CommunicationThread
  // null when the thread was started with no first message — the thread exists,
  // it just has nothing in it yet.
  message: CommunicationMessage | null
}

// ── Communication list (rows) ─────────────────────────────────────────────

export interface ThreadReport {
  id: string
  report_type: string
  // Display strings — use directly; report_type/status are the raw codes.
  type_label: string
  period: string
  title: string
  status: string
  status_label: string
  // Always present when `report` itself is non-null (it is null on an ad-hoc
  // thread) — every report type resolves to one of the four states.
  generation: ReportGeneration
}

// Where a report's CONTENT stands, which `status` does not answer: status is
// the review workflow (who shared it, who signed it off), so a Draft report and
// an In review one both land on an empty page when nothing was ever written.
//
// `ready` means APPROVED, not written — board and quarterly approve enforce no
// completeness check. Don't label it "complete" in the UI.
//
// An unrecognised future `state` should be treated as not_applicable rather
// than crashing the card.
export interface ReportGeneration {
  state: "ready" | "not_ready" | "in_progress" | "not_applicable"
  // Annual only — its sections live in the reporting-cycles system, which
  // counts them. null for every other type, so never render a bar off these
  // without checking. `percent` is a whole number.
  done: number | null
  total: number | null
  percent: number | null
  // Ids and a kind, never a URL — the backend has no view of our routes.
  // See generationHref() in @/lib/reportRoutes.
  target: {
    kind:
      | "quarterly_report"
      | "board_report"
      | "earnings_report"
      | "annual_cycle"
      | "esg_page"
      | null
    company_id: string
    // Module lanes only.
    report_id?: string
    // Annual only, and NOT the report id — an annual `reports` row is a shell
    // pointing at a cycle; navigating to the report id lands on an empty page.
    cycle_id?: string
  }
}

// The person who STARTED the thread (confirmed with the backend) — not the
// report's owner, even on a report thread. `can_add_members` is true only for
// them on a private thread.
export interface ThreadOwner {
  user_id: string
  full_name: string
  is_you: boolean
}

export interface ThreadLastMessage {
  sender_full_name: string
  is_you: boolean
  preview: string
  created_at: string
}

// One row. Rows arrive pre-sorted (updated_at desc) — don't re-sort.
// `owner` and `last_message` can both be null.
export interface ThreadSummary {
  thread_id: string
  // Private threads you're not a member of never appear in the list at all.
  is_private: boolean
  // Non-null once you've been removed — the row stays, read-only.
  removed_at: string | null
  // null on an ad-hoc thread — one with no report behind it.
  report: ThreadReport | null
  owner: ThreadOwner | null
  // Added alongside the review flow; null when not out for review.
  assignment: ReviewAssignment | null
  updated_at: string
  last_message: ThreadLastMessage | null
  internal_count: number
  unread_count: number
}

export interface ThreadListResponse {
  threads: ThreadSummary[]
}

export interface MarkThreadReadResponse {
  ok: boolean
}

// ── Thread view (message list + reply) ────────────────────────────────────

export interface MessageSender {
  user_id: string
  full_name: string
  // Raw role code (e.g. "ir") — label it on the frontend.
  role: string
  is_you: boolean
}

// `kind` drives the bubble: "system" lines are rendered with a muted avatar and
// name the actor (`sender`) — who added or removed someone; "user" renders as a
// normal person.
export type ThreadMessageKind = "system" | "user"

// One @mention on a message. The name is already inside `body` as
// "@Full Name" — this says which names in that text are mentions.
export interface MessageMention {
  user_id: string
  full_name: string
}

export interface ThreadMessage {
  id: string
  kind: ThreadMessageKind
  sender: MessageSender
  body: string
  mentioned_user_ids: string[]
  mentions: MessageMention[]
  created_at: string
}

// Who the report is currently out for review with. `label` is the snapshotted
// authority title ("Board Chairman") — display-only, not a backend entity.
export interface ReviewAssignment {
  id: string
  user_id: string
  full_name: string
  label: string | null
  is_you: boolean
  assigned_at: string
}

// A member of a private thread. `id` is the users.id UUID the member endpoints
// take; `user_id` is the usr_… string (matches MessageSender.user_id) and is
// what membership comparisons against the mention picker go through.
export interface ThreadMemberSummary {
  // The users.id UUID — what BOTH member endpoints take. Not `user_id`: the
  // usr_… string won't resolve and comes back 403.
  id: string
  user_id: string
  full_name: string
  role: string
  is_you: boolean
}

// Both member calls return this — drop it straight into the strip.
export interface ThreadMembersResponse {
  members: ThreadMemberSummary[]
  can_add_members: boolean
}

export interface ThreadDetail {
  thread_id: string
  is_private: boolean
  // When you were removed from this thread. null = current member. Non-null
  // means read-only: the backend still serves the thread, cut off at that
  // moment, and 403s every write.
  removed_at: string | null
  // [] on a public thread — render the members strip off this alone, no need
  // to check is_private first.
  members: ThreadMemberSummary[]
  // True only for the creator of a private thread; false for its other members
  // and on every public thread. Gates who may pull a non-member in.
  can_add_members: boolean
  // null on an ad-hoc thread — one with no report behind it.
  report: ThreadReport | null
  owner: ThreadOwner | null
  assignment: ReviewAssignment | null
  // True only for the assigned reviewer — gates "Open as reviewer".
  can_review: boolean
  created_at: string
  updated_at: string
}

// Messages arrive oldest→newest, already sorted — render in order.
export interface ThreadDetailResponse {
  thread: ThreadDetail
  messages: ThreadMessage[]
}

export interface SendMessageBody {
  message: string
  // Members' `id` UUIDs (NOT usr_ `user_id`). Empty array if none.
  mentioned_user_ids: string[]
}

export interface SendMessageResponse {
  message: ThreadMessage
}

// The caller's company profile on the Centrion backend. Only the display
// fields the External-email preview needs are typed here.
export interface CentrionCompany {
  id: string
  name: string
  headquarter_city?: string | null
  website_url?: string | null
  reporting_currency?: string | null
}

// ── History tab: email sends + publications ────────────────────────────────
export type EmailAudience = "external" | "internal"
export type EmailSendStatus = "tracked" | "scheduled" | "draft"

export interface EmailSendsStats {
  emails_sent_ytd: number
  external_count: number
  internal_count: number
  avg_open_rate: number
  industry_open_rate: number
  open_rate_vs_industry: number
  report_download_rate: number
  avg_time_on_report_seconds: number
  time_on_report_qoq_seconds: number | null
}

// metrics is a different shape per audience_type.
export type EmailSendMetrics =
  | { opened_pct: number; downloaded_pct: number } // external
  | { read_count: number; approved_count: number; total: number } // internal

export interface EmailSend {
  id: string
  subject: string
  audience_type: EmailAudience
  audience_label: string
  status: EmailSendStatus
  sent_at: string | null
  scheduled_at: string | null
  recipient_count: number
  report: { id: string; title: string } | null
  metrics: EmailSendMetrics
}

export interface EmailSendsResponse {
  stats: EmailSendsStats
  sends: EmailSend[]
}

export interface SendRecipientHeader {
  id: string
  subject: string
  audience_type: EmailAudience
  sent_at: string | null
  recipient_count: number
}

export interface SendRecipient {
  name: string
  org: string | null
  contact: string | null
  opened_at: string | null
  downloaded: boolean
  time_on_report_seconds: number | null
  approved_at: string | null
}

export interface SendRecipientsResponse {
  send: SendRecipientHeader
  recipients: SendRecipient[]
}

export interface Publication {
  id: string
  report: { id: string; title: string; report_type: string; period: string } | null
  channel: string
  jurisdiction: string | null
  visibility: string
  watermarked: boolean
  published_at?: string | null
  published_by: { full_name: string } | null
}

export interface PublicationsResponse {
  stats: { total: number } & Record<string, number>
  publications: Publication[]
}

// ── Compose modal: draft / send ────────────────────────────────────────────
export interface ComposeRecipient {
  name: string
  org?: string | null
  contact?: string | null
  email?: string | null
}

export interface EmailSendSavePayload {
  subject: string
  audience_type: EmailAudience
  audience_label?: string
  body?: string
  report_id?: string | null
  status: EmailSendStatus
  scheduled_at?: string | null
  recipients?: ComposeRecipient[]
}

export interface EmailSendDetail {
  id: string
  subject: string
  body: string | null
  audience_type: EmailAudience
  audience_label: string
  status: EmailSendStatus
  scheduled_at: string | null
  report: {
    id: string
    title: string
    pdf_path: string | null
    page_count: number | null
    file_size_mb: number | null
  } | null
  recipients: ComposeRecipient[]
}

export interface CreateEmailSendResponse {
  send: EmailSendDetail
  recipient_count: number
}

export interface UpdateEmailSendResponse {
  send: EmailSendDetail
}

export interface DraftListItem {
  id: string
  subject: string
  recipient_count: number
  report: { id: string; title: string; period?: string } | null
  updated_at: string
}

export interface DraftListResponse {
  drafts: DraftListItem[]
}

// ── Report review & approval ──────────────────────────────────────────────
// The four UI states map straight onto reports.status. `locked`/`published`
// also exist on finished reports — show via status_label and treat the panel
// as read-only (can_set_status: false).

// Radio options for the hub panel — render from the API, never hardcode.
export interface ReportStatusOption {
  code: string
  label: string
  hint: string
}

export interface ReportHubResponse {
  report: ThreadReport
  statuses: ReportStatusOption[]
  // False once locked/published — render the panel read-only.
  can_set_status: boolean
  owner: ThreadOwner | null
  // Null until the report has been shared.
  thread_id: string | null
  assignment: ReviewAssignment | null
  can_review: boolean
  unread_count: number
}

export interface SetReportStatusResponse {
  report_id: string
  status: string
  status_label: string
}

export interface ShareReportBody {
  // A users.id UUID from GET /communications/members — never a usr_ user_id.
  assigned_to: string
  // Free-text authority title, snapshotted on the thread ("Board Chairman").
  assigned_label?: string
  comment?: string
}

// Share returns the full review-thread payload, so the thread modal can paint
// straight from it without a second request.
export interface ShareReportResponse extends ThreadDetailResponse {
  report_status: string
}

// ── Reviewer view ─────────────────────────────────────────────────────────

export interface ReviewSection {
  // The earnings/report `section_code` verbatim (e.g. "s01_cover"), so this
  // pairs 1:1 with the report-content endpoint.
  id: string
  // The number badge next to each heading.
  order: number
  title: string
  type: string
}

export interface ReviewCommentAuthor {
  full_name: string
  initials: string
  is_you: boolean
}

export interface ReviewComment {
  id: string
  // Null for a comment on the report as a whole.
  section_id: string | null
  section_title: string | null
  author: ReviewCommentAuthor
  body: string
  resolved: boolean
  created_at: string
}

export interface ReviewViewResponse {
  thread_id: string
  report: ThreadReport
  owner: { full_name: string; is_you: boolean } | null
  assignment: ReviewAssignment | null
  // can_act = you are the assigned reviewer. can_approve additionally requires
  // the report to be in review — show Approve disabled, not hidden, when
  // can_act && !can_approve.
  can_act: boolean
  can_approve: boolean
  // Same flag the thread payload carries: non-null → you were removed, so the
  // screen is read-only. `can_comment` is the derived form — use that.
  removed_at: string | null
  can_comment: boolean
  // Only the ticked sections (e.g. 11 of 19). Empty when the narrative hasn't
  // been generated — hide the per-section rail.
  sections: ReviewSection[]
  comments: ReviewComment[]
  // Same comments keyed by section_id; report-level ones sit under "null".
  comments_by_section: Record<string, ReviewComment[]>
}

export interface CreateReviewCommentBody {
  section_id?: string | null
  section_title?: string | null
  body: string
}

export interface CreateReviewCommentResponse {
  comment: ReviewComment
}

export interface ReassignReviewBody {
  assigned_to: string
  assigned_label?: string
}

export interface ReassignReviewResponse {
  thread_id: string
  assigned_to: string
  assigned_label: string | null
  full_name: string
}

export interface ApproveReviewResponse {
  report_id: string
  status: string
  status_label: string
  approved_at: string
}

export interface SendBackReviewResponse {
  report_id: string
  status: string
  status_label: string
}

// One produced section of the report under review. Lives on the same Centrion
// backend as the communications endpoints, so it goes through commClient.
export interface ReviewReportSection {
  section_code: string
  title: string
  display_order: number
  mode: string
  status: string
  content: string | null
  included: boolean
}

export interface ReviewReportSectionsResponse {
  sections: ReviewReportSection[]
  cover_template_key: string | null
  locked: boolean
  // Quarterly only — the cover page's real values and the report's brand
  // accents, so the reviewer can render the same document the creator approved.
  // Absent on the earnings path, which carries its cover inside a section.
  header?: ReviewReportHeader | null
  brand?: ReviewReportBrand | null
}

export interface ReviewReportHeader {
  company_name?: string | null
  title?: string | null
  period_label?: string | null
  prepared_on?: string | null
}

export interface ReviewReportBrand {
  primary?: string | null
  secondary?: string | null
}

// GET .../quarterly/{reportId}/assemble returns a leaner section than the
// earnings one, and hands table content back either as a JSON string or as an
// already-parsed object/array. Brand sits at the top level on some backends and
// under `cover` on others — read both.
interface AssembledSection {
  section_code: string
  title: string
  display_order?: number
  mode: string
  content: unknown
}
interface AssembledReportResponse {
  sections?: AssembledSection[]
  header?: ReviewReportHeader | null
  brand?: ReviewReportBrand | null
  cover?: {
    cover_template_key?: string | null
    brand?: ReviewReportBrand | null
  } | null
}

/** What a "get this report ready for the AI assistant again" call returns. The
 *  work runs in the background, so this is only a handle on it. */
export interface ReindexResponse {
  report_id: string
  run_id: string | null
  /** An agent_runs URL, already prefixed with /api/v1 — see getAgentRun. */
  poll_url: string | null
  /** "Q3 2025 earnings report" — names the report in the success toast. */
  report_label?: string | null
}

export interface AgentRunStatus {
  id: string
  status: string
  error_message?: string | null
}

export const communicationsApi = {
  // Company profile for the signed-in user (company derived from the JWT).
  // Used to fill the External-email preview (name, city, currency, sender).
  getMyCompany: async (): Promise<CentrionCompany> => {
    const { data } = await commClient.get(`/companies/me`)
    return data
  },

  // Communication list. limit (1–200, default 50) / offset (default 0) only
  // needed for pagination.
  listThreads: async (params?: {
    limit?: number
    offset?: number
  }): Promise<ThreadListResponse> => {
    const qs = new URLSearchParams()
    if (params?.limit != null) qs.set("limit", String(params.limit))
    if (params?.offset != null) qs.set("offset", String(params.offset))
    const q = qs.toString()
    const { data } = await commClient.get(
      `/communications/threads${q ? `?${q}` : ""}`,
    )
    return data
  },

  // Move the caller's read watermark to now → clears "N new". Fire on open.
  // 404 → thread gone / not in company.
  markThreadRead: async (threadId: string): Promise<MarkThreadReadResponse> => {
    const { data } = await commClient.post(
      `/communications/threads/${encodeURIComponent(threadId)}/read`,
    )
    return data
  },

  // Thread header + full message list (oldest→newest). 404 → thread gone.
  getThread: async (threadId: string): Promise<ThreadDetailResponse> => {
    const { data } = await commClient.get(
      `/communications/threads/${encodeURIComponent(threadId)}/messages`,
    )
    return data
  },

  // Post a reply. Bumps the thread's updated_at (reorders the list).
  sendMessage: async (
    threadId: string,
    body: SendMessageBody,
  ): Promise<SendMessageResponse> => {
    const { data } = await commClient.post(
      `/communications/threads/${encodeURIComponent(threadId)}/messages`,
      body,
    )
    return data
  },

  // All threadless reports + the type pills. `type` narrows only the reports
  // list; the pills always reflect the full unfiltered set.
  threadlessReports: async (
    type?: string,
  ): Promise<ThreadlessReportsResponse> => {
    const { data } = await commClient.get(
      `/communications/threadless-reports${type ? `?type=${encodeURIComponent(type)}` : ""}`,
    )
    return data
  },

  // Members eligible for the @mention / add-people / reviewer pickers, filtered
  // client-side from here. `reportId` narrows it to people who can open that
  // report — pass it whenever the thread or the share is about one, or the
  // picker offers people whose add (or assignment) the backend will refuse.
  members: async (reportId?: string): Promise<CommunicationMembersResponse> => {
    const { data } = await commClient.get(
      `/communications/members${reportId ? `?report_id=${encodeURIComponent(reportId)}` : ""}`,
    )
    return data
  },

  // ── Report review & approval ─────────────────────────────────────────────
  // One call renders the whole hub side rail. Re-fetch after any action below.
  // 404 → report not in your company.
  reportHub: async (reportId: string): Promise<ReportHubResponse> => {
    const { data } = await commClient.get(
      `/communications/reports/${encodeURIComponent(reportId)}/hub`,
    )
    return data
  },

  // 403 → "approved" isn't settable here (approve from the reviewer view so a
  // sign-off is recorded). 422 → outside draft/in_review/pending_approval.
  // 409 → report locked or published.
  setReportStatus: async (
    reportId: string,
    status: string,
  ): Promise<SetReportStatusResponse> => {
    const { data } = await commClient.patch(
      `/communications/reports/${encodeURIComponent(reportId)}/status`,
      { status },
    )
    return data
  },

  // Creates or reuses the thread, assigns the reviewer, posts the system line
  // and your comment, moves the report to in_review, notifies the reviewer.
  // Sharing twice is expected (reassignment / a second round).
  // 422 → assigned_to is you · 403 → not an active member · 404 → no report.
  shareReport: async (
    reportId: string,
    body: ShareReportBody,
  ): Promise<ShareReportResponse> => {
    const { data } = await commClient.post(
      `/communications/reports/${encodeURIComponent(reportId)}/share`,
      body,
    )
    return data
  },

  // Reviewer screen: sections, comments, and the action gates. Any company
  // member may read this — only the write calls below are restricted.
  reviewView: async (threadId: string): Promise<ReviewViewResponse> => {
    const { data } = await commClient.get(
      `/communications/threads/${encodeURIComponent(threadId)}/review`,
    )
    return data
  },

  // Open to any company member. Omit both section fields for a report-level
  // comment. 422 → empty body, or a section_id not in this report.
  addReviewComment: async (
    threadId: string,
    body: CreateReviewCommentBody,
  ): Promise<CreateReviewCommentResponse> => {
    const { data } = await commClient.post(
      `/communications/threads/${encodeURIComponent(threadId)}/comments`,
      body,
    )
    return data
  },

  // After this the caller is no longer the reviewer — re-fetch and expect
  // can_act: false. 403 → not the reviewer · 422 → same person · 409 → unassigned.
  reassignReview: async (
    threadId: string,
    body: ReassignReviewBody,
  ): Promise<ReassignReviewResponse> => {
    const { data } = await commClient.post(
      `/communications/threads/${encodeURIComponent(threadId)}/reassign`,
      body,
    )
    return data
  },

  // The sign-off that unblocks publishing. 403 → not the assigned reviewer
  // (admins included) · 409 → report not in review, or thread unassigned.
  approveReview: async (
    threadId: string,
    note?: string,
  ): Promise<ApproveReviewResponse> => {
    const { data } = await commClient.post(
      `/communications/threads/${encodeURIComponent(threadId)}/approve`,
      note ? { note } : {},
    )
    return data
  },

  // Note is REQUIRED (422 if blank). Returns the report to draft and clears the
  // assignment. 403 → not the reviewer · 409 → report locked/published.
  sendBackReview: async (
    threadId: string,
    note: string,
  ): Promise<SendBackReviewResponse> => {
    const { data } = await commClient.post(
      `/communications/threads/${encodeURIComponent(threadId)}/send-back`,
      { note },
    )
    return data
  },

  // An annual report's written body for the reviewer screen. Annual reports are
  // written in the reporting-cycles system, so this reads cycle_report_sections
  // rather than a per-report table — same envelope as the earnings sections
  // endpoint below, keyed on the section_code the review payload emits as each
  // section's `id`. 422 for any other report type.
  reviewAnnualSections: async (
    reportId: string,
  ): Promise<ReviewReportSectionsResponse> => {
    const { data } = await commClient.get(
      `/communications/reports/${encodeURIComponent(reportId)}/annual-sections`,
    )
    return data
  },

  // Produced sections of the report under review, for the reviewer screen's
  // section bodies. Company-scoped on the backend (not owner-scoped), so a
  // non-owner reviewer can read it. `section_code` pairs 1:1 with the review
  // payload's `section.id`.
  reviewReportSections: async (
    reportId: string,
  ): Promise<ReviewReportSectionsResponse> => {
    const { data } = await commClient.get(
      `/earnings/reports/${encodeURIComponent(reportId)}/sections`,
    )
    return data
  },

  // An earnings report's cover/brand selection. Only the brand is used here —
  // it drives the report-content accents, and it's the same source the earnings
  // preview reads. Works on locked reports.
  reviewEarningsCoverSelection: async (
    reportId: string,
  ): Promise<{ cover_template_key: string | null; brand: ReviewReportBrand | null }> => {
    const { data } = await commClient.get(
      `/earnings/reports/${encodeURIComponent(reportId)}/cover-template`,
    )
    return {
      cover_template_key: data?.cover_template_key ?? null,
      brand: data?.brand ?? null,
    }
  },

  // Same thing for a quarterly report, whose body lives behind the quarterly
  // assemble endpoint — the earnings path above 404s for it. Normalised to the
  // same response shape so the reviewer screen doesn't care which it got.
  // Table content may arrive already parsed; stringify it, or every renderer
  // that calls .trim()/JSON.parse on the content breaks.
  //
  // The cover is dropped, matching how the quarterly report itself assembles:
  // it renders the cover from the response header + template key, never from
  // the section's content, so nothing reads that content and its shape is
  // unknown. It carries no reviewable prose either — just company, period, and
  // a template choice.
  reviewQuarterlySections: async (
    companyId: string,
    reportId: string,
  ): Promise<ReviewReportSectionsResponse> => {
    const { data } = await commClient.get<AssembledReportResponse>(
      `/reports/${encodeURIComponent(companyId)}/quarterly/${encodeURIComponent(reportId)}/assemble`,
    )
    return {
      sections: (data.sections ?? [])
        .filter((s) => !/cover/i.test(s.section_code))
        .map((s) => ({
          section_code: s.section_code,
          title: s.title,
          display_order: s.display_order ?? 0,
          mode: s.mode,
          status: "produced",
          content:
            s.content == null
              ? null
              : typeof s.content === "string"
                ? s.content
                : JSON.stringify(s.content),
          included: true,
        })),
      cover_template_key: data.cover?.cover_template_key ?? null,
      locked: false,
      header: data.header ?? null,
      brand: data.brand ?? data.cover?.brand ?? null,
    }
  },

  // Add people to a private thread. Creator only (403 otherwise); idempotent —
  // re-adding an existing member is a 200 that changes nothing. The
  // "X added Y" system line lands on the next message fetch, not in here.
  addThreadMembers: async (
    threadId: string,
    userIds: string[],
  ): Promise<ThreadMembersResponse> => {
    const { data } = await commClient.post(
      `/communications/threads/${encodeURIComponent(threadId)}/members`,
      { user_ids: userIds },
    )
    return data
  },

  // Remove one person. `userId` is the users.id UUID, NOT the usr_ `user_id`
  // on ThreadMemberSummary. Creator only · 422 removing yourself, or the last
  // other person, or on a public thread · 404 if you're not in the thread.
  removeThreadMember: async (
    threadId: string,
    userId: string,
  ): Promise<ThreadMembersResponse> => {
    const { data } = await commClient.delete(
      `/communications/threads/${encodeURIComponent(threadId)}/members/${encodeURIComponent(userId)}`,
    )
    return data
  },

  // Start a thread on a report with a first message + optional mentions.
  startThread: async (body: StartThreadBody): Promise<StartThreadResponse> => {
    const { data } = await commClient.post(`/communications/threads`, body)
    return data
  },

  // ── History tab ──────────────────────────────────────────────────────────
  // Email sends + header stats. `audience` filters the list only; stats always
  // cover everything so the header stays stable while toggling.
  emailSends: async (audience?: EmailAudience | "all"): Promise<EmailSendsResponse> => {
    const { data } = await commClient.get(`/communications/history/email-sends`, {
      params: audience && audience !== "all" ? { audience } : undefined,
    })
    return data
  },

  // Per-recipient drill-down for one send.
  sendRecipients: async (sendId: string): Promise<SendRecipientsResponse> => {
    const { data } = await commClient.get(
      `/communications/history/email-sends/${encodeURIComponent(sendId)}/recipients`,
    )
    return data
  },

  // CSV export — carries the Bearer token via commClient; returns a Blob.
  sendRecipientsCsv: async (sendId: string): Promise<Blob> => {
    const { data } = await commClient.get(
      `/communications/history/email-sends/${encodeURIComponent(sendId)}/recipients.csv`,
      { responseType: "blob" },
    )
    return data
  },

  // Publications list + stats. Empty until reports are published.
  publications: async (): Promise<PublicationsResponse> => {
    const { data } = await commClient.get(`/communications/history/publications`)
    return data
  },

  // ── Compose: draft / send ────────────────────────────────────────────────
  // Create a send row (first Save draft OR first Send).
  createEmailSend: async (body: EmailSendSavePayload): Promise<CreateEmailSendResponse> => {
    const { data } = await commClient.post(`/communications/history/email-sends`, body)
    return data
  },

  // Update an existing draft. All fields optional; `recipients` replaces the
  // whole list. 409 if the row is already tracked/scheduled.
  updateEmailSend: async (id: string, body: Partial<EmailSendSavePayload>): Promise<UpdateEmailSendResponse> => {
    const { data } = await commClient.patch(
      `/communications/history/email-sends/${encodeURIComponent(id)}`,
      body,
    )
    return data
  },

  // Reopen a draft — prefill the editor. `report.pdf_path` may be null.
  getEmailSend: async (id: string): Promise<EmailSendDetail> => {
    const { data } = await commClient.get(`/communications/history/email-sends/${encodeURIComponent(id)}`)
    return data
  },

  // Saved drafts (only surface for drafts — they're not in the History list).
  drafts: async (): Promise<DraftListResponse> => {
    const { data } = await commClient.get(`/communications/history/drafts`)
    return data
  },
  // ── Report readiness for the AI assistant ────────────────────────────────
  //
  // When a quarterly or earnings report is approved, Centriton indexes it so the
  // AI assistant can answer questions about it. If that fails, the approver gets
  // a notification row in the SHARED notifications table — which this app's bell
  // reads too. These three let that bell fix the problem in place instead of
  // sending the user to an app they may not use.
  //
  // Nothing new is needed to call them: commClient already points at Centriton's
  // backend with the same JWT, and already calls both of these route families.

  reindexEarningsReport: async (reportId: string): Promise<ReindexResponse> => {
    const { data } = await commClient.post(
      `/earnings/reports/${encodeURIComponent(reportId)}/reindex`, {},
    )
    return data
  },

  reindexQuarterlyReport: async (
    companyId: string, reportId: string,
  ): Promise<ReindexResponse> => {
    const { data } = await commClient.post(
      `/reports/${encodeURIComponent(companyId)}/quarterly/${encodeURIComponent(reportId)}/reindex`,
      {},
    )
    return data
  },

  // poll_url comes back as "/api/v1/agent_runs/{id}", and commClient's baseURL
  // ALREADY ends in /api/v1 — passing it raw would request /api/v1/api/v1/...
  // Centriton's own client strips the same prefix for the same reason.
  getAgentRun: async (pollUrl: string): Promise<AgentRunStatus> => {
    const { data } = await commClient.get(agentRunPath(pollUrl))
    return data
  },

}