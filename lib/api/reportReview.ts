import { apiClient } from "@/lib/api/client"
import { publicClient } from "@/lib/api/share"
import type { AssembledReport } from "@/lib/api/annual-design"
import type { ContentLanguage, FinalReport } from "@/types"

/* ────────────────────────────────────────────────────────────────────────────
   Client review of the assembled annual report.

   Spark sends the report to one client by private link. The client comments,
   then approves (the report locks) or asks for changes. Re-assembling after
   their answer makes the next version (v2, v3…); the last 3 are kept.

   The Arabic translation has its own link and versions: every internal call
   takes `arabic` and sends `?report=arabic`.

   Same two transports as the kickoff share (lib/api/share.ts): `apiClient` for
   Spark's and the PM's screens, the bare `publicClient` for the client's page.
──────────────────────────────────────────────────────────────────────────── */

export type ReportVersionStatus = "draft" | "shared" | "changes_requested" | "approved"
export type ReportShareStatus =
  | "pending"
  | "approved"
  | "changes_requested"
  | "revoked"

export interface ClientComment {
  id: string
  body: string
  is_draft: boolean
  created_at?: string | null
}

/** The client link's state. The link itself is only returned right after sharing. */
export interface ReportShare {
  status: ReportShareStatus
  client_email: string
  email_status?: "pending" | "sent" | "failed" | null
  shared_by?: string | null
  viewed_at?: string | null
  responded_at?: string | null
  reminder_count: number
  last_reminded_at?: string | null
  created_at?: string | null
  /** The live link, for spark_internal only, while the client holds it. */
  url?: string | null
}

export interface VersionSummary {
  version_no: number
  status: ReportVersionStatus
  assembled_at?: string | null
  shared_to_email?: string | null
  shared_at?: string | null
  viewed_at?: string | null
  decided_at?: string | null
  decision_note?: string | null
  comments: ClientComment[]
  word_count: number
  /** False for v1, or when the version before it is no longer kept. */
  has_previous: boolean
  /** Words added / removed since the version before it; null without one. */
  added_words: number | null
  deleted_words: number | null
}

export interface ReportReviewState {
  /** e.g. "v2 · Changes requested". Null before the first version exists. */
  label: string | null
  status: ReportVersionStatus | null
  awaiting_client: boolean
  can_reassemble: boolean
  comment_count: number
  /** Newest first. */
  versions: VersionSummary[]
  share: ReportShare | null
  /** English, before the first share: why validation still blocks sharing. Null otherwise. */
  validation_blocker?: string | null
}

export interface ShareWithClientResult {
  share: ReportShare
  /** Shown once so Spark can copy it; it is never returned again. */
  url: string
  message: string
}

/** A run of words in a changed paragraph. */
/**
 * One changed paragraph. A heading, bullet or text has `parts`; a table row
 * has `cells` (parts per cell) and its table's top row in `header` (null
 * when the row is the top row itself).
 */
export interface DiffParagraph {
  type: "heading" | "bullet" | "text" | "row"
  parts: DiffPart[]
  cells: DiffPart[][]
  header: string[] | null
}

export interface DiffPart {
  kind: "added" | "deleted" | "same"
  text: string
}

export interface SectionDiff {
  code: string
  title: string
  status: "changed" | "same" | "added" | "removed"
  added: number
  deleted: number
  /** Only the changed paragraphs, each with its changed words marked. */
  paragraphs: DiffParagraph[]
}

export interface CompareResult {
  from_version: number
  to_version: number
  added: number
  deleted: number
  sections: SectionDiff[]
}

/** What the client's page shows. Nothing about other cycles or users. */
export interface ClientReviewView {
  /** The Arabic translation: shown right to left. */
  is_arabic: boolean
  content_language: ContentLanguage
  fiscal_year?: number | null
  company_name?: string | null
  cycle_name: string
  version_no: number
  status: ReportShareStatus
  message?: string | null
  /** The version as the PM's report page draws it. Attachments have no file link. */
  report: FinalReport
  /** The designed document it prints from: cover, brand, type. */
  assembled: AssembledReport
  comments: ClientComment[]
  previous_comments: ClientComment[]
  decided_at?: string | null
  decision_note?: string | null
  contact_name?: string | null
  contact_email?: string | null
}

/** The query string that picks the English report or its Arabic translation. */
function reportParams(arabic: boolean): { report: "english" | "arabic" } {
  return { report: arabic ? "arabic" : "english" }
}

/** Reads the file name the server chose from Content-Disposition. */
function fileNameFrom(header: string | undefined, fallback: string): string {
  const match = header?.match(/filename="?([^";]+)"?/i)
  return match ? match[1] : fallback
}

/** Saves a downloaded file through a temporary link. */
export function saveFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = window.document.createElement("a")
  a.href = url
  a.download = filename
  window.document.body.appendChild(a)
  a.click()
  window.document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/** A PDF download's error body is a Blob too; this reads its message. */
async function blobErrorMessage(err: unknown, fallback: string): Promise<string> {
  const data = (err as { response?: { data?: unknown } })?.response?.data
  if (data instanceof Blob) {
    try {
      const parsed = JSON.parse(await data.text())
      if (typeof parsed?.detail === "string") return parsed.detail
    } catch {
      // Not JSON: fall through to the fallback.
    }
  }
  return fallback
}

export const reportReviewApi = {
  state: async (cycleId: string, arabic = false): Promise<ReportReviewState> => {
    const { data } = await apiClient.get<ReportReviewState>(
      `/pm/cycles/${cycleId}/report-review`,
      { params: reportParams(arabic) },
    )
    return data
  },

  /** spark_internal only. */
  share: async (
    cycleId: string,
    body: { email: string; message?: string },
    arabic = false,
  ): Promise<ShareWithClientResult> => {
    const { data } = await apiClient.post<ShareWithClientResult>(
      `/pm/cycles/${cycleId}/report-review/share`,
      body,
      { params: reportParams(arabic) },
    )
    return data
  },

  /** spark_internal only. A new link; the old one stops working. */
  resend: async (cycleId: string, arabic = false): Promise<ShareWithClientResult> => {
    const { data } = await apiClient.post<ShareWithClientResult>(
      `/pm/cycles/${cycleId}/report-review/resend`,
      undefined,
      { params: reportParams(arabic) },
    )
    return data
  },

  compare: async (cycleId: string, from: number, to: number, arabic = false): Promise<CompareResult> => {
    const { data } = await apiClient.get<CompareResult>(
      `/pm/cycles/${cycleId}/report-review/compare`,
      { params: { from, to, ...reportParams(arabic) } },
    )
    return data
  },

  /** Downloads one kept version as a PDF. */
  downloadPdf: async (cycleId: string, versionNo: number, arabic = false): Promise<void> => {
    try {
      const response = await apiClient.get(
        `/pm/cycles/${cycleId}/report-review/versions/${versionNo}/pdf`,
        { responseType: "blob", timeout: 120000, params: reportParams(arabic) },
      )
      const name = fileNameFrom(response.headers?.["content-disposition"], `Report_v${versionNo}.pdf`)
      saveFile(response.data as Blob, name)
    } catch (err) {
      throw new Error(await blobErrorMessage(err, "Couldn't make the PDF."))
    }
  },
}

/** The client's calls. No auth anywhere: the token is the credential. */
export const clientReportReviewApi = {
  view: async (token: string): Promise<ClientReviewView> => {
    const { data } = await publicClient.get<ClientReviewView>(
      `/report-review/${encodeURIComponent(token)}`,
    )
    return data
  },

  addComment: async (token: string, body: string): Promise<ClientComment[]> => {
    const { data } = await publicClient.post<{ comments: ClientComment[] }>(
      `/report-review/${encodeURIComponent(token)}/comments`,
      { body },
    )
    return data.comments
  },

  editComment: async (token: string, commentId: string, body: string): Promise<ClientComment[]> => {
    const { data } = await publicClient.patch<{ comments: ClientComment[] }>(
      `/report-review/${encodeURIComponent(token)}/comments/${commentId}`,
      { body },
    )
    return data.comments
  },

  deleteComment: async (token: string, commentId: string): Promise<ClientComment[]> => {
    const { data } = await publicClient.delete<{ comments: ClientComment[] }>(
      `/report-review/${encodeURIComponent(token)}/comments/${commentId}`,
    )
    return data.comments
  },

  submit: async (
    token: string,
    body: { decision: "approve" | "request_changes"; note?: string },
  ): Promise<ClientReviewView> => {
    const { data } = await publicClient.post<ClientReviewView>(
      `/report-review/${encodeURIComponent(token)}/submit`,
      body,
    )
    return data
  },

  downloadPdf: async (token: string): Promise<void> => {
    try {
      const response = await publicClient.get(
        `/report-review/${encodeURIComponent(token)}/pdf`,
        { responseType: "blob", timeout: 120000 },
      )
      const name = fileNameFrom(response.headers?.["content-disposition"], "Annual_Report.pdf")
      saveFile(response.data as Blob, name)
    } catch (err) {
      throw new Error(await blobErrorMessage(err, "Couldn't make the PDF. Please try again."))
    }
  },
}
