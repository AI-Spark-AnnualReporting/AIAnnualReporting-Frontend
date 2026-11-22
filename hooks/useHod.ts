import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { hodApi, HODSession, HODQuestion, ReviewStatus } from "@/lib/api/hod"
import type { DepartmentShareState } from "@/lib/api/hod"
import { QUERY_KEYS } from "@/lib/constants"
import { toast } from "sonner"

// Shared mutation key for every curation write on a session — lets the page tell
// when all writes have settled (to do one reconciling refetch).
export const HOD_WRITE_KEY = (sessionId: string) => ["hod", "session", sessionId, "write"]

// Serialize all curation writes for a session. The server does a read-modify-write
// on the whole `questions` JSONB, so two concurrent writes would lose one another's
// change. We keep the UI instant via optimistic `onMutate` and only queue the
// network sends — one at a time, in click order. One failure doesn't stall the rest.
const sessionWriteChains = new Map<string, Promise<unknown>>()
function serializeWrite<T>(sessionId: string, run: () => Promise<T>): Promise<T> {
  const prev = sessionWriteChains.get(sessionId) ?? Promise.resolve()
  const result = prev.then(run, run)
  sessionWriteChains.set(sessionId, result.then(() => undefined, () => undefined))
  return result
}

export function useHODSessions(status?: string, enabled = true) {
  return useQuery({
    queryKey: QUERY_KEYS.HOD_SESSIONS(status),
    queryFn: () => hodApi.listSessions(status),
    enabled,
  })
}

export function useHODSession(sessionId: string) {
  return useQuery({
    queryKey: QUERY_KEYS.HOD_SESSION(sessionId),
    queryFn: () => hodApi.getSession(sessionId),
    enabled: !!sessionId,
    retry: false,
    staleTime: 0,
    // Don't let a focus/mount refetch clobber in-progress optimistic edits.
    refetchOnWindowFocus: false,
  })
}

export function useHODAssignableUsers(sessionId: string, enabled = true) {
  return useQuery({
    queryKey: QUERY_KEYS.HOD_ASSIGNABLE(sessionId),
    queryFn: () => hodApi.assignableUsers(sessionId),
    enabled: enabled && !!sessionId,
  })
}

/**
 * Curation mutations are optimistic + serialized:
 *  - `onMutate` updates the cached session the instant you click (pills/counters
 *    flip with zero latency, and every button stays interactive).
 *  - the network send is queued (one at a time) so concurrent clicks can't race.
 *  - we deliberately do NOT write the server response back per-call (that would
 *    flicker other questions mid-queue). The page does a single reconciling
 *    refetch once all writes settle (see HOD_WRITE_KEY / useIsMutating).
 */
function useOptimisticCuration<V>(
  sessionId: string,
  fn: (vars: V) => Promise<HODSession>,
  optimistic: (prev: HODSession, vars: V) => HODSession,
  errorMsg: string,
) {
  const qc = useQueryClient()
  const key = QUERY_KEYS.HOD_SESSION(sessionId)
  return useMutation({
    mutationKey: HOD_WRITE_KEY(sessionId),
    mutationFn: (vars: V) => serializeWrite(sessionId, () => fn(vars)),
    onMutate: async (vars: V) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<HODSession>(key)
      if (prev) qc.setQueryData<HODSession>(key, optimistic(prev, vars))
    },
    onError: (err: { message?: string }) => toast.error(err?.message || errorMsg),
  })
}

const patchQuestion = (
  questions: HODQuestion[] | undefined,
  questionId: string,
  patch: Partial<HODQuestion>,
): HODQuestion[] => (questions || []).map((q) => (q.question_id === questionId ? { ...q, ...patch } : q))

export function useReviewQuestion(sessionId: string) {
  return useOptimisticCuration<{ questionId: string; body: { review_status?: ReviewStatus; text?: string } }>(
    sessionId,
    ({ questionId, body }) => hodApi.reviewQuestion(sessionId, questionId, body),
    (prev, { questionId, body }) => ({
      ...prev,
      questions: patchQuestion(prev.questions, questionId, {
        ...(body.review_status ? { review_status: body.review_status } : {}),
        ...(body.text !== undefined ? { question: body.text } : {}),
      }),
    }),
    "Failed to update question",
  )
}

export function useAddQuestion(sessionId: string) {
  return useOptimisticCuration<string>(
    sessionId,
    (text) => hodApi.addQuestion(sessionId, text),
    (prev, text) => {
      const list = prev.questions || []
      const temp: HODQuestion = {
        question_id: `temp_${Date.now()}`, // reconciled to the real id on the settle refetch
        question: text,
        order: (list[list.length - 1]?.order ?? list.length) + 1,
        review_status: "pending",
      }
      return { ...prev, questions: [...list, temp] }
    },
    "Failed to add question",
  )
}

export function useRemoveQuestion(sessionId: string) {
  return useOptimisticCuration<string>(
    sessionId,
    (questionId) => hodApi.removeQuestion(sessionId, questionId),
    (prev, questionId) => ({
      ...prev,
      questions: (prev.questions || []).filter((q) => q.question_id !== questionId),
    }),
    "Failed to remove question",
  )
}

export function useApproveAll(sessionId: string) {
  return useOptimisticCuration<void>(
    sessionId,
    () => hodApi.approveAll(sessionId),
    (prev) => ({
      ...prev,
      questions: (prev.questions || []).map((q) =>
        (q.review_status || "pending") === "pending" ? { ...q, review_status: "approved" as ReviewStatus } : q,
      ),
    }),
    "Failed to approve questions",
  )
}

export function useAssignSession(sessionId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationKey: HOD_WRITE_KEY(sessionId),
    // Queue behind any in-flight curation writes so the server sees the final set.
    mutationFn: (body: { user_id: string; note?: string }) =>
      serializeWrite(sessionId, () => hodApi.assign(sessionId, body)),
    onSuccess: (session) => {
      qc.setQueryData(QUERY_KEYS.HOD_SESSION(sessionId), session)
      qc.invalidateQueries({ queryKey: ["hod", "sessions"] })
      // The assignee may be the HOD themselves, who is sent straight to the
      // department dashboard — without this it can still be inside the 60s
      // staleTime and render without the session just assigned.
      qc.invalidateQueries({ queryKey: ["dept", "dashboard"] })
      // Deliberately neutral: the HOD may have assigned the questions to
      // themselves rather than to a team member.
      toast.success("Questions assigned")
    },
    onError: (err: { message?: string }) => toast.error(err?.message || "Failed to assign questions"),
  })
}

export function useReviewAnswers(sessionId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { action: "approved" | "reopened"; review_notes?: string }) =>
      hodApi.reviewAnswers(sessionId, body),
    onSuccess: (session, vars) => {
      qc.setQueryData(QUERY_KEYS.HOD_SESSION(sessionId), session)
      qc.invalidateQueries({ queryKey: ["hod", "sessions"] })
      toast.success(vars.action === "approved" ? "Answers approved" : "Sent back for changes")
    },
    onError: (err: { message?: string }) => toast.error(err?.message || "Failed to submit review"),
  })
}

// ── The department's questions with the client (Spark-led sessions) ────────

/** Where the client step is up to. Polled every 60 s, like the kickoff shares,
 *  so a client's reply shows up without a refresh. */
export function useDeptClientShare(sessionId: string, enabled: boolean) {
  return useQuery({
    queryKey: QUERY_KEYS.HOD_CLIENT_SHARE(sessionId),
    queryFn: () => hodApi.clientShare(sessionId),
    // Only Spark staff have this step, so nobody else makes (or polls) the call.
    enabled: enabled && !!sessionId,
    refetchInterval: 60_000,
  })
}

export function useDeptClientHistory(sessionId: string, enabled: boolean) {
  return useQuery({
    queryKey: QUERY_KEYS.HOD_CLIENT_HISTORY(sessionId),
    queryFn: () => hodApi.clientShareHistory(sessionId),
    enabled: enabled && !!sessionId,
    // Fetched fresh every time the panel opens: the HOD's own question edits
    // add lines too, and the app's 60 s cache would show an old (even empty)
    // list right after them.
    staleTime: 0,
  })
}

/** One mutation on the client step. The server returns the new state, which
 *  goes straight into the cache. The session is refetched too: the client's
 *  changes are written onto its questions. */
function useClientShareAction<V>(
  sessionId: string,
  fn: (vars: V) => Promise<DepartmentShareState>,
  successMsg: string,
  errorMsg: string,
  afterSuccess?: (state: DepartmentShareState) => void,
) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: (state) => {
      qc.setQueryData(QUERY_KEYS.HOD_CLIENT_SHARE(sessionId), state)
      qc.invalidateQueries({ queryKey: QUERY_KEYS.HOD_SESSION(sessionId) })
      qc.invalidateQueries({ queryKey: QUERY_KEYS.HOD_CLIENT_HISTORY(sessionId) })
      if (afterSuccess) afterSuccess(state)
      else toast.success(successMsg)
    },
    onError: (err: { message?: string }) => toast.error(readableError(err?.message, errorMsg)),
  })
}

/** The server's message, except the raw validation text for a bad email
 *  ("body.client_email: value is not a valid email address…"). */
function readableError(message: string | undefined, fallback: string): string {
  if (!message) return fallback
  if (message.includes("client_email")) return "That email address isn't valid."
  return message
}

export function useShareWithClient(sessionId: string) {
  return useClientShareAction<string>(
    sessionId,
    // Queued behind any approve/reject still saving, like Assign: the server
    // sends the questions as stored, and once sent they're locked for good.
    (email) => serializeWrite(sessionId, () => hodApi.shareWithClient(sessionId, email)),
    "Sent to the client",
    "Couldn't send to the client",
  )
}

export function useApproveClientShare(sessionId: string) {
  return useClientShareAction<void>(
    sessionId,
    () => hodApi.approveClientShare(sessionId),
    "Client's answers approved",
    "Couldn't approve",
  )
}

export function useSendBackClientShare(sessionId: string) {
  return useClientShareAction<string>(
    sessionId,
    (comment) => hodApi.sendBackClientShare(sessionId, comment),
    "Sent back to the client",
    "Couldn't send it back",
  )
}

export function useRemindClient(sessionId: string) {
  return useClientShareAction<void>(
    sessionId,
    () => hodApi.remindClient(sessionId),
    "Reminder sent",
    "Couldn't send the reminder",
    // The reminder is counted even when the mailer fails, so say so rather
    // than "Reminder sent".
    (state) => {
      if (state.share?.email_status === "failed") {
        toast.warning("Reminder saved, but it couldn't be emailed — copy the link and send it yourself.")
      } else {
        toast.success("Reminder sent")
      }
    },
  )
}
