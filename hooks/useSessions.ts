import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { departmentApi, SubmitAnswersPayload, FinalizePayload, AdjustTonePayload } from "@/lib/api/department"
import { pmApi, ReviewPayload, ReminderPayload, KickoffBriefPayload, EscalationPayload } from "@/lib/api/pm"
import { toast } from "sonner"

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

export function usePMDashboard() {
  return useQuery({
    queryKey: ["pm", "dashboard"],
    queryFn: async () => {
      try {
        return await pmApi.dashboard()
      } catch (err: unknown) {
        // Backend returns 404 when PM has no active cycles — treat as empty
        const status = (err as { status?: number; response?: { status?: number } })?.status
          ?? (err as { response?: { status?: number } })?.response?.status
        if (status === 404) return { active_cycles: [], cycles: [], pending_reviews: 0, recent_submissions: [] }
        throw err
      }
    },
    retry: false,
    staleTime: 0,                // always treat as stale so refocus triggers a fetch
    refetchInterval: 5_000,      // poll every 5 s — picks up dept submissions quickly
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

export function useSubmitKickoff() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: KickoffBriefPayload) => pmApi.submitKickoff(payload),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["pm", "cycle", vars.cycle_id] })
      qc.invalidateQueries({ queryKey: ["pm", "dashboard"] })
      toast.success("Kickoff brief submitted! AI questions are being generated.")
    },
    onError: (err: { message?: string; response?: { data?: { detail?: string } } }) => {
      const detail = err?.response?.data?.detail
      toast.error(detail || err?.message || "Failed to submit kickoff brief")
    },
  })
}

export function useUploadKickoffDoc() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ file, cycleId, strategicBrief }: { file: File; cycleId: string; strategicBrief?: string }) =>
      pmApi.uploadKickoffDoc(file, cycleId, strategicBrief),
    onSuccess: (_, vars) => {
      // Bust PM cycle cache so the page reflects kickoff_submitted=true immediately
      qc.invalidateQueries({ queryKey: ["pm", "cycle", vars.cycleId] })
      qc.invalidateQueries({ queryKey: ["pm", "dashboard"] })
      toast.success("Kickoff document uploaded! AI questions are being generated.")
    },
    onError: (err: { message?: string; response?: { data?: { detail?: string } } }) => {
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
    mutationFn: ({ sessionId, data }: { sessionId: string; data: ReminderPayload }) =>
      pmApi.sendBulkReminders({ session_ids: [sessionId], ...data }),
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
    mutationFn: (payload: { cycle_id: string; message: string; priority?: string }) =>
      pmApi.sendBulkReminders(payload),
    onSuccess: () => toast.success("Reminders sent to all pending departments"),
    onError: (err: { message?: string }) => {
      toast.error(err?.message || "Failed to send bulk reminders")
    },
  })
}
