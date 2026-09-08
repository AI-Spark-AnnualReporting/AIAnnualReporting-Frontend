import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { departmentApi, SubmitAnswersPayload, FinalizePayload, AdjustTonePayload, PatchOutlineTitlesPayload } from "@/lib/api/department"
import { pmApi, ReviewPayload, ReminderPayload, KickoffBriefPayload, EscalationPayload, GenerateBriefPayload } from "@/lib/api/pm"
import { KickoffBriefResponse, PMDashboard, Session } from "@/types"
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

// ── Outline (before draft) ──────────────────────────────────────────────────

/**
 * Fetch the session's outline + editability. Key: ["session", id, "outline"].
 * Background refetches are disabled so a window-focus/reconnect refetch can't
 * swap titles out from under a field the user is editing — the outline only
 * changes through this user's own generate/regenerate/rename actions.
 */
export function useOutline(sessionId: string) {
  return useQuery({
    queryKey: ["session", sessionId, "outline"],
    queryFn: () => departmentApi.getOutline(sessionId),
    enabled: !!sessionId,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
}

/**
 * Build (or rebuild) the outline from answers. No onError toast here — the
 * page special-cases `400 no_answers` with its own message. Invalidates the
 * outline + session caches on success.
 */
export function useGenerateOutline() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (sessionId: string) => departmentApi.generateOutline(sessionId),
    onSuccess: (_data, sessionId) => {
      qc.invalidateQueries({ queryKey: ["session", sessionId, "outline"] })
      qc.invalidateQueries({ queryKey: ["session", sessionId] })
    },
  })
}

// Shared mutation key so the outline page can gate "Continue" on in-flight
// saves via useIsMutating({ mutationKey: OUTLINE_PATCH_KEY }).
export const OUTLINE_PATCH_KEY = ["patchOutlineTitles"] as const

/**
 * Rename a heading/subheading title (single-id PATCH, save-as-you-type). We do
 * NOT write the response into the outline cache: the DB is the source of truth
 * and the editing field already holds the latest value locally. Keeping the
 * `title` prop stable while typing means a save echo can never clobber an
 * in-progress edit. No onError toast — the card reverts the field and toasts
 * based on the error code.
 */
export function usePatchOutlineTitles() {
  return useMutation({
    mutationKey: OUTLINE_PATCH_KEY,
    mutationFn: ({ sessionId, payload }: { sessionId: string; payload: PatchOutlineTitlesPayload }) =>
      departmentApi.patchOutlineTitles(sessionId, payload),
  })
}

// ── Additional Insights (read-only) ─────────────────────────────────────────

/**
 * Fetch AI-surfaced leftover content from the session's uploaded documents.
 * Key: ["session", id, "additional-insights"]. Also used from the main
 * workspace page (to badge the "Additional Insights" button), so this is
 * LLM-backed and expensive — staleTime: Infinity + no background refetches
 * means it's computed once per browser session (tab) and reused across
 * remounts/navigation, only re-running on an actual page reload.
 */
export function useAdditionalInsights(sessionId: string) {
  return useQuery({
    queryKey: ["session", sessionId, "additional-insights"],
    queryFn: () => departmentApi.getAdditionalInsights(sessionId),
    enabled: !!sessionId,
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
}

/**
 * Toggle one insight card's `included` flag. The PATCH response is the full
 * updated list, so we write it straight into the query cache instead of
 * refetching (toggling is cheap; a refetch would re-run the LLM pass).
 */
export function useSetInsightInclusion(sessionId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ insightId, included }: { insightId: string; included: boolean }) =>
      departmentApi.setInsightInclusion(sessionId, insightId, included),
    onSuccess: (data) => {
      qc.setQueryData(["session", sessionId, "additional-insights"], data)
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message || "Couldn't update this card")
    },
  })
}

// ── Draft working copy ──────────────────────────────────────────────────────

// Shared mutation key so the draft page can gate navigation/finalize on
// in-flight saves via useIsMutating({ mutationKey: DRAFT_SAVE_KEY }).
export const DRAFT_SAVE_KEY = ["saveDraft"] as const

/**
 * Persist the working draft (debounced save-as-you-type).
 *
 * We do NOT invalidate ["session", id] — same reasoning as
 * usePatchOutlineTitles: refetching the whole session (questions + answers +
 * draft) on every keystroke pause is waste, and a server echo could race a
 * keystroke. Instead we write back the exact string we just sent, which is
 * strictly safe — we authored it, so it can't clobber anything — and keeps
 * other consumers (the workspace's draft nav, the checklist) correct with zero
 * network. No onError toast: the page renders an inline "Save failed — Retry",
 * because a toast on every failed keystroke pause would nag.
 */
export function useSaveDraft() {
  const qc = useQueryClient()
  return useMutation({
    mutationKey: DRAFT_SAVE_KEY,
    mutationFn: ({ sessionId, content }: { sessionId: string; content: string }) =>
      departmentApi.saveDraft(sessionId, { content }),
    onSuccess: (_data, vars) => {
      qc.setQueryData(
        ["session", vars.sessionId],
        (old: { success: boolean; session: Session } | undefined) =>
          old
            ? { ...old, session: { ...old.session, draft_content: vars.content } }
            : old
      )
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
 * PM dashboard — cycle cards + review stats, built from a single
 * GET /pm/cycles call. Previously this fanned out to GET /pm/cycles/{id}/sessions
 * once per cycle (~35+ extra requests, ~37s on a real account) to compute
 * per-status counts the list endpoint already returns in `status_counts`.
 *
 * `status_counts` keys mirror SessionStatus; any missing key reads as 0, so a
 * partial backend rollout undercounts instead of crashing.
 */
export function usePMDashboard() {
  return useQuery({
    queryKey: ["pm", "dashboard"],
    queryFn: async (): Promise<PMDashboard> => {
      const { cycles } = await pmApi.getCycles()

      const active_cycles = cycles.map((cycle) => {
        const sc = cycle.status_counts ?? {}
        const submitted = sc.submitted ?? 0
        const approved = sc.approved ?? 0
        const inProgress = sc.in_progress ?? 0
        const notStarted = (sc.not_started ?? 0) + (sc.assigned ?? 0)
        const reopened = sc.reopened ?? 0
        return {
          id: cycle.cycle_id,
          cycle_name: cycle.cycle_name,
          fiscal_year: cycle.fiscal_year,
          status: cycle.status,
          submission_deadline: cycle.submission_deadline,
          updated_at: cycle.updated_at,
          total_departments: cycle.total_departments ?? 0,
          submitted_count: submitted + approved,
          in_progress_count: inProgress,
          not_started_count: notStarted,
          reopened_count: reopened,
          completion_rate: Math.round(cycle.progress ?? 0),
        }
      })

      // pending_reviews = "Awaiting Department Lead Approval" — submitted only, not approved.
      const pending_reviews = cycles.reduce(
        (sum, c) => sum + (c.status_counts?.submitted ?? 0),
        0
      )

      // Historic behaviour: the old fan-out built a session-level list, sliced it
      // to 10, then only ever rendered its .length — so the "Recent Submissions"
      // stat card silently capped at 10. Reproduced verbatim here as a count,
      // since there's no session-level data left to build a real list from.
      const totalSubmitted = cycles.reduce(
        (sum, c) => sum + (c.status_counts?.submitted ?? 0) + (c.status_counts?.approved ?? 0),
        0
      )
      const RECENT_SUBMISSIONS_CAP = 10
      const recent_submissions_count = Math.min(totalSubmitted, RECENT_SUBMISSIONS_CAP)

      return {
        active_cycles,
        pending_reviews,
        recent_submissions_count,
      }
    },
    retry: false,
    // Matches refetchInterval — was 0, which refired the whole fan-out on every
    // /pm ↔ /pm/cycles navigation. Now it's one cheap request either way, but
    // there's no reason to double it within the same 30s poll window.
    staleTime: 30_000,
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

// Strategic Brief wizard — Step 1 questionnaire. Read-only: there is no
// answer-save endpoint yet, so callers keep answers in local component state.
// retry:false so a 403/404 surfaces immediately instead of retrying 3x.
export function useSurveyQuestions(cycleId: string) {
  return useQuery({
    queryKey: ["pm", "survey-questions", cycleId],
    queryFn: () => pmApi.getSurveyQuestions(cycleId),
    enabled: !!cycleId,
    retry: false,
    staleTime: 5 * 60_000,
  })
}

// Strategic Brief wizard Step 2 — generates (or regenerates) the brief +
// themes from the questionnaire answers. Bust the cycle dashboard cache on
// success so kickoff_brief / areas_of_focus are fresh on reload.
export function useGenerateBrief() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ cycleId, payload }: { cycleId: string; payload: GenerateBriefPayload }) =>
      pmApi.generateBrief(cycleId, payload),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["pm", "cycle", vars.cycleId] })
    },
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

export function useSetQuestionsDeadline(cycleId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (deadline: string | null) => pmApi.setQuestionsDeadline(cycleId, deadline),
    onSuccess: (data, deadline) => {
      qc.invalidateQueries({ queryKey: ["pm", "cycle", cycleId] })
      qc.invalidateQueries({ queryKey: ["pm", "dashboard"] })
      const msg = deadline
        ? `Questions deadline set${data.notified_count > 0 ? ` — ${data.notified_count} department user${data.notified_count !== 1 ? "s" : ""} notified` : ""}`
        : "Questions deadline cleared"
      toast.success(msg)
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message || "Failed to update questions deadline")
    },
  })
}
