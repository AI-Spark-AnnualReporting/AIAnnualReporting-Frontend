import axios, { AxiosInstance, InternalAxiosRequestConfig } from "axios"
import { centriyonLoginUrl } from "@/lib/centriyon"

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
  department: string | null
}

export interface CommunicationMembersResponse {
  members: CommunicationMember[]
}

export interface StartThreadBody {
  report_id: string
  message: string
  // Members' `id` UUIDs (NOT their usr_ `user_id`). Empty array if none.
  mentioned_user_ids: string[]
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
  message: CommunicationMessage
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
}

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
  report: ThreadReport
  owner: ThreadOwner | null
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

export interface ThreadMessage {
  id: string
  sender: MessageSender
  body: string
  mentioned_user_ids: string[]
  created_at: string
}

export interface ThreadDetail {
  thread_id: string
  report: ThreadReport
  owner: ThreadOwner | null
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

  // Members eligible for the @mention picker. Loaded once, filtered client-side.
  members: async (): Promise<CommunicationMembersResponse> => {
    const { data } = await commClient.get(`/communications/members`)
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
}
