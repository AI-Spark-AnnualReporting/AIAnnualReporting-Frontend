import axios from "axios"
import { apiClient } from "@/lib/api/client"
import type { AreaOfFocus } from "@/lib/areasOfFocus"
import type { ConceptMessage, GenerateBriefAnswer, SurveyQuestion } from "@/lib/api/pm"

/* ────────────────────────────────────────────────────────────────────────────
   Client sign-off on the kickoff wizard.

   Two callers live here and they must not share a transport:

   - Spark's own screens use `apiClient`, which attaches the Centriyon JWT and
     the acting-company header.
   - The client's page uses `publicClient` below. It has NO interceptors. The
     person holding the link has no account, no token and no company, and
     apiClient's 401 handler would bounce them to a Centriyon login they can
     never complete.
──────────────────────────────────────────────────────────────────────────── */

const BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "https://anualreport-hmc4gyfnc9e9emdf.canadacentral-01.azurewebsites.net/api/v1"

/** Deliberately bare: no auth header, no company header, no redirect-on-401. */
const publicClient = axios.create({
  baseURL: BASE_URL,
  headers: { "Content-Type": "application/json" },
  timeout: 30000,
})

export type ShareStage = "questionnaire" | "brief"
export type ShareStatus = "pending" | "responded" | "approved"
export type ShareEmailStatus = "pending" | "sent" | "failed"

/** What the client sent back. Shape follows the stage. */
export interface ShareResponsePayload {
  answers?: GenerateBriefAnswer[]
  /** Questions the client wrote themselves. The server renumbers the ids and
   *  re-points their answers, so these are only ever a suggestion of an id. */
  added_questions?: { id: string; text: string }[]
  strategic_brief?: string
  areas_of_focus?: AreaOfFocus[]
  concept_messages?: ConceptMessage[]
}

/** What the client is being asked about. Shape follows the stage. */
export interface SharePayload {
  questions?: SurveyQuestion[]
  strategic_brief?: string
  areas_of_focus?: AreaOfFocus[]
  concept_messages?: ConceptMessage[]
}

export interface ShareRequest {
  id: string
  cycle_id: string
  stage: ShareStage
  status: ShareStatus
  url: string
  client_email: string
  /** SMTP acceptance, not delivery — a bounce afterwards is invisible to us. */
  email_status: ShareEmailStatus
  reminder_count: number
  last_reminded_at?: string | null
  /** The latest note sent back to the client, and how many rounds so far. */
  review_comment?: string | null
  revision_count: number
  /** Their own note back to Spark. Bundle only. */
  client_note?: string | null
  response: ShareResponsePayload
  created_at?: string | null
  responded_at?: string | null
  approved_at?: string | null
  approved_by?: string | null
}

export interface CycleShares {
  cycle_id: string
  questionnaire?: ShareRequest | null
  brief?: ShareRequest | null
}

export interface ShareActionResult {
  share: ShareRequest
  message: string
}

/** The client's view. Carries no cycle id, company or user — only this one share. */
export interface ClientShareView {
  stage: ShareStage
  status: ShareStatus
  cycle_name: string
  payload: SharePayload
  response: ShareResponsePayload
  submitted_at?: string | null
  /** Set when their work came back for changes — shown at the top of the page. */
  review_comment?: string | null
  revision_count: number
  /** The file the client attached, if any. */
  document_name?: string | null
}

export const shareApi = {
  /** Both gates' state. Readable by any PM, so a blocked screen can explain itself. */
  list: async (cycleId: string): Promise<CycleShares> => {
    const { data } = await apiClient.get<CycleShares>(`/pm/cycles/${cycleId}/shares`)
    return data
  },

  /** spark_internal only. Re-sharing rotates the token and kills the old link. */
  create: async (
    cycleId: string,
    body: { stage: ShareStage; client_email: string },
  ): Promise<ShareActionResult> => {
    const { data } = await apiClient.post<ShareActionResult>(
      `/pm/cycles/${cycleId}/share`,
      body,
    )
    return data
  },

  /** spark_internal only. This is what unblocks the wizard. */
  approve: async (cycleId: string, stage: ShareStage): Promise<ShareActionResult> => {
    const { data } = await apiClient.post<ShareActionResult>(
      `/pm/cycles/${cycleId}/share/${stage}/approve`,
    )
    return data
  },

  /** spark_internal only. Reopens the same link with their answers still on
   *  it, plus a note saying what to change. */
  sendBack: async (
    cycleId: string,
    stage: ShareStage,
    comment: string,
  ): Promise<ShareActionResult> => {
    const { data } = await apiClient.post<ShareActionResult>(
      `/pm/cycles/${cycleId}/share/${stage}/send-back`,
      { comment },
    )
    return data
  },

  /** spark_internal only. Emails a reminder; unblocks nothing. */
  escalate: async (cycleId: string, stage: ShareStage): Promise<ShareActionResult> => {
    const { data } = await apiClient.post<ShareActionResult>(
      `/pm/cycles/${cycleId}/share/${stage}/escalate`,
    )
    return data
  },
}

/** The client's two calls. No auth anywhere. */
export const clientShareApi = {
  view: async (token: string): Promise<ClientShareView> => {
    const { data } = await publicClient.get<ClientShareView>(
      `/share/${encodeURIComponent(token)}`,
    )
    return data
  },

  /** The client attaching their own strategic brief. Replace semantics: a
   *  second upload removes the first. No auth — the token is the credential. */
  uploadDocument: async (token: string, file: File): Promise<{ filename: string }> => {
    const form = new FormData()
    form.append("file", file)
    const { data } = await publicClient.post<{ filename: string }>(
      `/share/${encodeURIComponent(token)}/document`,
      form,
      // Let the browser set the multipart boundary; the instance default of
      // application/json would make the server reject the body.
      { headers: { "Content-Type": undefined } },
    )
    return data
  },

  submit: async (
    token: string,
    body: { response: ShareResponsePayload; client_note?: string },
  ): Promise<ClientShareView> => {
    const { data } = await publicClient.post<ClientShareView>(
      `/share/${encodeURIComponent(token)}/submit`,
      body,
    )
    return data
  },
}
