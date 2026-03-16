import apiClient from "./client"
import { PMDashboard, Session } from "@/types"

export interface ReviewPayload {
  // "reviewed" = PM has read the submission (intermediate step before approve/reject)
  // "approved" = PM fully approves, content will be included in the final report
  // "rejected" = PM rejects (hard reject, rare)
  // "reopened" = PM sends back to department for revision
  status: "reviewed" | "approved" | "rejected" | "reopened"
  review_notes?: string
}

export interface ReminderPayload {
  message: string
  priority?: "low" | "normal" | "high" | "urgent"
}

export interface EscalationPayload {
  session_id: string
  message: string
  priority?: string
}

export interface GenerateReportPayload {
  // If session_ids is omitted, the backend includes ALL approved sessions
  session_ids?: string[]
  format?: "markdown" | "html" | "text"
}

// PM kickoff brief — submitted after cycle is active
export interface KickoffBriefPayload {
  cycle_id: string
  strategic_brief: string
  additional_context?: string
}

export const pmApi = {
  /**
   * The backend has no GET /pm/dashboard list endpoint (only /pm/dashboard/{cycle_id}).
   * We proxy through a Next.js server-side route that uses an admin service account
   * to fetch all cycles and filters to the requesting PM's assignments.
   */
  dashboard: async (): Promise<PMDashboard> => {
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null
    const res = await fetch("/api/pm/cycles", {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      cache: "no-store",
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw { status: res.status, message: err.error ?? "Failed to load cycles" }
    }
    return res.json()
  },

  /**
   * Fetch PM cycle dashboard via our Next.js server-side proxy.
   * The real backend GET /pm/dashboard/{cycle_id} always returns departments:[]
   * due to a confirmed backend bug.  Our proxy aggregates department sessions
   * by logging in as each dept user server-side, giving the PM real data.
   */
  cycleDashboard: async (cycleId: string) => {
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null
    const res = await fetch(`/api/pm/cycles/${cycleId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      cache: "no-store",
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw { status: res.status, message: err.error ?? "Failed to load cycle dashboard" }
    }
    return res.json()
  },

  // Submit a text-based kickoff brief to generate AI questions for all sessions
  submitKickoff: async (payload: KickoffBriefPayload) => {
    const { data } = await apiClient.post("/pm/kickoff", payload)
    return data
  },

  // Upload a document as the kickoff brief (alternative to text)
  // The backend requires strategic_brief even when uploading a doc (used as a summary/context hint)
  uploadKickoffDoc: async (file: File, cycleId: string, strategicBrief?: string) => {
    const formData = new FormData()
    formData.append("file", file)
    formData.append("cycle_id", cycleId)
    formData.append("strategic_brief", strategicBrief || "Please refer to the attached document for strategic context.")
    // Must delete the instance-level "Content-Type: application/json" default so axios can
    // auto-set "multipart/form-data; boundary=..." from the FormData object.
    const { data } = await apiClient.post("/pm/kickoff/upload", formData, {
      headers: { "Content-Type": undefined },
      timeout: 120000, // 2 min — backend extracts + vectorises the kickoff document
    })
    return data
  },

  /**
   * Fetch a session's full detail as PM via server-side impersonation proxy.
   * The department endpoint GET /department/sessions/{id} requires a dept user token,
   * so we route through /api/pm/sessions/{id} which impersonates the correct user.
   */
  getSession: async (sessionId: string): Promise<{ success: boolean; session: Session }> => {
    const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null
    const res = await fetch(`/api/pm/sessions/${sessionId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      cache: "no-store",
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw { status: res.status, message: err.error ?? "Failed to load session" }
    }
    return res.json()
  },

  reviewSession: async (sessionId: string, payload: ReviewPayload) => {
    const { data } = await apiClient.post(
      `/pm/sessions/${sessionId}/review`,
      payload
    )
    return data
  },

  sendBulkReminders: async (payload: {
    session_ids?: string[]
    cycle_id?: string
    message: string
    priority?: string
  }) => {
    const { data } = await apiClient.post("/pm/reminders", payload)
    return data
  },

  createEscalation: async (payload: EscalationPayload) => {
    const { data } = await apiClient.post("/pm/escalations", payload)
    return data
  },

  getEscalations: async (cycleId: string) => {
    const { data } = await apiClient.get(`/pm/escalations/${cycleId}`)
    return data
  },

  generateReport: async (cycleId: string, payload: GenerateReportPayload) => {
    const { data } = await apiClient.post(
      `/pm/cycles/${cycleId}/generate-report`,
      payload
    )
    return data
  },
}
