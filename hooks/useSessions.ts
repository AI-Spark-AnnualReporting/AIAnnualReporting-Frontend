import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { departmentApi, SubmitAnswersPayload, FinalizePayload, AdjustTonePayload } from "@/lib/api/department"
import { pmApi, ReviewPayload, ReminderPayload, KickoffBriefPayload, EscalationPayload, PMCycleSession } from "@/lib/api/pm"
import { KickoffBriefResponse, PMDashboard } from "@/types"
import { toast } from "sonner"
import { isDocumentLanguageError } from "@/lib/lang"

export function useDepartmentDashboard() {
  return useQuery({
    queryKey: ["dept", "dashboard"],
    queryFn: () => departmentApi.dashboard(),
  })
}

export function useSession(sessionId: string) {
  return useQuery({
    queryKey: ["session", sessionId],
    queryFn: () => departmentApi.getSession(sessionId),
    enabled: !!sessionId,
    retry: false,
  })
}

/** PM-scoped session fetch — uses server-side impersonation proxy. */
export function usePMSession(sessionId: string) {
  return useQuery({
    queryKey: ["pm", "session", sessionId],
    queryFn: () => pmApi.getSession(sessionId),
    enabled: !!sessionId,
    retry: false,
    staleTime: 0,
  })
}

export function useSubmitAnswers() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ sessionId, data }: { sessionId: string; data: SubmitAnswersPayload }) =>
      departmentApi.submitAnswers(sessionId, data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["session", vars.sessionId] })
      qc.invalidateQueries({ queryKey: ["dept", "dashboard"] })
      // Bust PM cycle caches so progress_percentage updates are visible to the PM
      qc.invalidateQueries({ queryKey: ["pm"] })
      toast.success("Answers saved")
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message || "Failed to save answers")
    },
  })
}

export function useGenerateDraft() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (sessionId: string) => departmentApi.generateDraft(sessionId),
    onSuccess: (_, sessionId) => {
      qc.invalidateQueries({ queryKey: ["session", sessionId] })
      toast.success("Draft generated successfully")
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message || "Failed to generate draft")
    },
  })
}

export function useFinalizeSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ sessionId, data }: { sessionId: string; data: FinalizePayload }) =>
      departmentApi.finalize(sessionId, data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["session", vars.sessionId] })
      qc.invalidateQueries({ queryKey: ["dept", "dashboard"] })
      // Also bust PM caches so the submission shows immediately when PM refreshes
      qc.invalidateQueries({ queryKey: ["pm"] })
      toast.success("Submission finalized successfully!")
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message || "Failed to finalize submission")
    },
  })
}

export function useAdjustTone() {
  return useMutation({
    mutationFn: ({ sessionId, data }: { sessionId: string; data: AdjustTonePayload }) =>
      departmentApi.adjustTone(sessionId, data),
    onError: (err: { message?: string }) => {
      toast.error(err?.message || "Failed to adjust tone")
    },
  })
}

/**
 * PM dashboard — cycle cards + review stats, built from the real backend
 * endpoints (GET /pm/cycles + GET /pm/cycles/{id}/sessions). Per cycle the
 * department-session statuses are counted client-side, and cycle progress is
 * the average of every department's own progress_percentage.
 */
export function usePMDashboard() {
  return useQuery({
    queryKey: ["pm", "dashboard"],
    queryFn: async (): Promise<PMDashboard> => {
      const { cycles } = await pmApi.getCycles()
      const perCycle = await Promise.all(
        cycles.map(async (c) => {
          try {
            const { sessions } = await pmApi.getCycleSessions(c.cycle_id)
            return { cycle: c, sessions }
          } catch {
            // One cycle failing shouldn't take down the whole dashboard
            return { cycle: c, sessions: [] as PMCycleSession[] }
          }
        })
      )

      const active_cycles = perCycle.map(({ cycle, sessions }) => {
        const total = sessions.length
        const submitted = sessions.filter((s) => s.status === "submitted").length
        const approved = sessions.filter((s) => s.status === "approved").length
        const inProgress = sessions.filter((s) => s.status === "in_progress").length
        const notStarted = sessions.filter(
          (s) => s.status === "not_started" || s.status === "assigned"
        ).length
        const reopened = sessions.filter((s) => s.status === "reopened").length
        // Cycle progress = average of every department's own progress_percentage.
        const completion_rate =
          total > 0
            ? Math.round(
                sessions.reduce((sum, s) => sum + (s.progress_percentage ?? 0), 0) / total
              )
            : 0
        return {
          id: cycle.cycle_id,
          cycle_name: cycle.cycle_name,
          fiscal_year: cycle.fiscal_year,
          status: cycle.status,
          submission_deadline: cycle.submission_deadline,
          updated_at: cycle.updated_at,
          total_departments: total,
          submitted_count: submitted + approved,
          in_progress_count: inProgress,
          not_started_count: notStarted,
          reopened_count: reopened,
          completion_rate,
        }
      })

      const recent_submissions = perCycle
        .flatMap(({ cycle, sessions }) =>
          sessions
            .filter((s) => s.status === "submitted")
            .map((s) => ({
              session_id: s.session_id,
              department_name: s.department_name,
              cycle_name: cycle.cycle_name,
              submitted_at: s.submitted_at ?? "",
              status: s.status,
            }))
        )
        .sort(
          (a, b) =>
            new Date(b.submitted_at || 0).getTime() -
            new Date(a.submitted_at || 0).getTime()
        )

      return {
        active_cycles,
        pending_reviews: recent_submissions.length,
        recent_submissions: recent_submissions.slice(0, 10),
      }
    },
    retry: false,
    staleTime: 0,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  })
}

/** A submitted session in the PM review queue, annotated with its cycle. */
export type ReviewQueueItem = PMCycleSession & { cycle_id: string; cycle_name: string }

/**
 * Cross-cycle review queue: every `submitted` session across the PM's cycles.
 * The backend has no cross-cycle endpoint, so we loop the PM's cycles client-side.
 */
export function usePMReviewQueue() {
  return useQuery({
    queryKey: ["pm", "reviewQueue"],
    queryFn: async (): Promise<ReviewQueueItem[]> => {
      const { cycles } = await pmApi.getCycles()
      const perCycle = await Promise.all(
        cycles
          .filter((c) => c.status !== "draft") // draft cycles have no sessions yet
          .map(async (c) => {
            try {
              const { sessions } = await pmApi.getCycleSessions(c.cycle_id)
              return sessions
                .filter((s) => s.status === "submitted")
                .map((s) => ({ ...s, cycle_id: c.cycle_id, cycle_name: c.cycle_name }))
            } catch {
              // One cycle failing shouldn't take down the whole queue
              return [] as ReviewQueueItem[]
            }
          })
      )
      return perCycle
        .flat()
        .sort(
          (a, b) =>
            new Date(b.submitted_at ?? 0).getTime() -
            new Date(a.submitted_at ?? 0).getTime()
        )
    },
    staleTime: 0,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  })
}

export function usePMCycleDashboard(cycleId: string) {
  return useQuery({
    queryKey: ["pm", "cycle", cycleId],
    queryFn: () => pmApi.cycleDashboard(cycleId),
    enabled: !!cycleId,
    staleTime: 0,
    refetchInterval: 5_000,      // poll every 5 s — quick pickup of dept submissions
    refetchIntervalInBackground: false,
  })
}

// Previous kickoff brief — used to pre-fill the strategic-brief textarea.
// `enabled` gates the fetch (e.g. only when the kickoff dialog is open).
// A non-200 is treated as non-fatal upstream; here we just don't retry so a
// missing/unauthorized lookup never blocks the form.
export function usePreviousBrief(cycleId: string, enabled = true) {
  return useQuery({
    queryKey: ["pm", "previous-brief", cycleId],
    queryFn: () => pmApi.previousBrief(cycleId),
    enabled: !!cycleId && enabled,
    retry: false,
    staleTime: 5 * 60_000,
  })
}

export function useSubmitKickoff() {
  const qc = useQueryClient()
  return useMutation<KickoffBriefResponse, { message?: string; response?: { data?: { detail?: string } } }, KickoffBriefPayload>({
    mutationFn: (payload: KickoffBriefPayload) => pmApi.submitKickoff(payload),
    onSuccess: (data, vars) => {
      qc.invalidateQueries({ queryKey: ["pm", "cycle", vars.cycle_id] })
      qc.invalidateQueries({ queryKey: ["pm", "dashboard"] })
      // Suppress generic success toast when the backend flags a low-quality brief —
      // the component renders its own warning panel in that case.
      if (!data?.warning) {
        toast.success("Kickoff brief submitted! AI questions are being generated.")
      }
    },
    onError: (err) => {
      const detail = err?.response?.data?.detail
      toast.error(detail || err?.message || "Failed to submit kickoff brief")
    },
  })
}

export function useUploadKickoffDoc() {
  const qc = useQueryClient()
  return useMutation<
    KickoffBriefResponse,
    { message?: string; response?: { data?: { detail?: string } } },
    { file: File; cycleId: string; strategicBrief?: string; numQuestions?: number }
  >({
    mutationFn: ({ file, cycleId, strategicBrief, numQuestions }) =>
      pmApi.uploadKickoffDoc(file, cycleId, strategicBrief, numQuestions),
    onSuccess: (data, vars) => {
      // Bust PM cycle cache so the page reflects kickoff_submitted=true immediately
      qc.invalidateQueries({ queryKey: ["pm", "cycle", vars.cycleId] })
      qc.invalidateQueries({ queryKey: ["pm", "dashboard"] })
      if (!data?.warning) {
        toast.success("Kickoff document uploaded! AI questions are being generated.")
      }
    },
    onError: (err) => {
      // Wrong-language documents get a prominent inline banner in the kickoff
      // card instead of a toast — skip the toast so the warning isn't duplicated.
      if (isDocumentLanguageError(err)) return
      const detail = err?.response?.data?.detail
      toast.error(detail || err?.message || "Failed to upload kickoff document")
    },
  })
}

export function useReviewSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ sessionId, data }: { sessionId: string; data: ReviewPayload }) =>
      pmApi.reviewSession(sessionId, data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["session", vars.sessionId] })
      qc.invalidateQueries({ queryKey: ["pm", "session", vars.sessionId] })
      // Bust PM cycle cache so the pipeline + table update immediately
      qc.invalidateQueries({ queryKey: ["pm"] })
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message || "Failed to review session")
    },
  })
}

export function useSendReminder() {
  return useMutation({
    mutationFn: (payload: ReminderPayload) => pmApi.sendBulkReminders(payload),
    onSuccess: () => toast.success("Reminder sent"),
    onError: (err: { message?: string }) => {
      toast.error(err?.message || "Failed to send reminder")
    },
  })
}

export function useGenerateReport() {
  return useMutation({
    mutationFn: ({ cycleId, payload }: {
      cycleId: string
      payload: { session_ids?: string[]; format?: "markdown" | "html" | "text" }
    }) => pmApi.generateReport(cycleId, payload),
    onError: (err: { message?: string }) => {
      toast.error(err?.message || "Failed to generate report")
    },
  })
}

export function useCreateEscalation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: EscalationPayload) => pmApi.createEscalation(payload),
    onSuccess: (_, vars) => {
      // Invalidate escalations for the cycle — we get cycle_id via session lookup but
      // just broadcast a wide invalidate so UI refreshes
      qc.invalidateQueries({ queryKey: ["pm", "escalations"] })
      qc.invalidateQueries({ queryKey: ["session", vars.session_id] })
      toast.success("Escalation raised")
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message || "Failed to raise escalation")
    },
  })
}

export function useEscalations(cycleId: string) {
  return useQuery({
    queryKey: ["pm", "escalations", cycleId],
    queryFn: () => pmApi.getEscalations(cycleId),
    enabled: !!cycleId,
    retry: false,
  })
}

export function useBulkReminder() {
  return useMutation({
    mutationFn: (payload: ReminderPayload) => pmApi.sendBulkReminders(payload),
    onSuccess: () => toast.success("Reminders sent to all pending departments"),
    onError: (err: { message?: string }) => {
      toast.error(err?.message || "Failed to send bulk reminders")
    },
  })
}
