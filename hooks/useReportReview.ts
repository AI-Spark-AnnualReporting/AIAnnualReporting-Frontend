import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { QUERY_KEYS } from "@/lib/constants"
import { reportReviewApi } from "@/lib/api/reportReview"

type MutationError = { message?: string }

/** One cache entry per report: the English report and its Arabic translation. */
function reviewKey(cycleId: string, arabic: boolean) {
  return [...QUERY_KEYS.PM_REPORT_REVIEW(cycleId), arabic ? "arabic" : "english"]
}

/** The client review state for one cycle's English report (or Arabic translation).
 *
 *  Re-read on focus and every minute: the client answers from their own
 *  browser, so nothing else would tell this page the report came back. */
export function useReportReview(cycleId: string, enabled = true, arabic = false) {
  return useQuery({
    queryKey: reviewKey(cycleId, arabic),
    queryFn: () => reportReviewApi.state(cycleId, arabic),
    enabled: enabled && !!cycleId,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  })
}

/** Everything that changes when the report goes to, or comes back from, the client. */
function useRefreshReview(cycleId: string) {
  const qc = useQueryClient()
  return () => {
    // The prefix key covers both the English and the Arabic entry.
    qc.invalidateQueries({ queryKey: QUERY_KEYS.PM_REPORT_REVIEW(cycleId) })
    qc.invalidateQueries({ queryKey: QUERY_KEYS.PM_REPORT_APPROVAL(cycleId) })
    qc.invalidateQueries({ queryKey: QUERY_KEYS.PM_FINAL_REPORT(cycleId) })
  }
}

export function useShareReportWithClient(cycleId: string, arabic = false) {
  const refresh = useRefreshReview(cycleId)
  return useMutation({
    mutationFn: (body: { email: string; message?: string }) =>
      reportReviewApi.share(cycleId, body, arabic),
    onSuccess: (result) => {
      refresh()
      // A failed email still makes the link; the warning tells Spark to copy it.
      if (result.share.email_status === "failed") {
        toast.warning("The link was made but the email didn't send. Copy the link and send it yourself.")
      } else {
        toast.success(result.message)
      }
    },
    onError: (err: MutationError) =>
      toast.error(err?.message || "Couldn't share the report with the client."),
  })
}

export function useResendReportLink(cycleId: string, arabic = false) {
  const refresh = useRefreshReview(cycleId)
  return useMutation({
    mutationFn: () => reportReviewApi.resend(cycleId, arabic),
    onSuccess: (result) => {
      refresh()
      toast.success(result.message)
    },
    onError: (err: MutationError) => toast.error(err?.message || "Couldn't resend the link."),
  })
}

/** What changed between two versions. Only fetched while Compare is open. */
export function useCompareVersions(
  cycleId: string,
  from: number | null,
  to: number | null,
  arabic = false,
) {
  return useQuery({
    queryKey: [...reviewKey(cycleId, arabic), "compare", from, to],
    queryFn: () => reportReviewApi.compare(cycleId, from as number, to as number, arabic),
    enabled: !!cycleId && from !== null && to !== null && from !== to,
  })
}

export function useDownloadVersionWord(cycleId: string, arabic = false) {
  return useMutation({
    mutationFn: (versionNo: number) => reportReviewApi.downloadWord(cycleId, versionNo, arabic),
    onError: (err: MutationError) => toast.error(err?.message || "Couldn't make the Word file."),
  })
}
