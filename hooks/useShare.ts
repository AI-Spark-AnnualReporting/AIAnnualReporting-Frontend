import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { shareApi, ShareStage } from "@/lib/api/share"

/** Every gate's state for one cycle.
 *
 *  Polled, not static: the client submits from their own browser with nothing
 *  to tell this one, so a PM sitting on the kickoff screen would otherwise stare
 *  at a stale "waiting" card until they reloaded. Same 60s cadence the
 *  notification bell uses. */
export function useCycleShares(cycleId: string) {
  return useQuery({
    queryKey: ["pm", "cycle", cycleId, "shares"],
    queryFn: () => shareApi.list(cycleId),
    enabled: !!cycleId,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  })
}

export function useCreateShare(cycleId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { stage: ShareStage; client_email: string; client_name?: string }) =>
      shareApi.create(cycleId, body),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["pm", "cycle", cycleId, "shares"] })
      // The backend distinguishes "link made and emailed" from "link made, mail
      // failed" — surfacing that as a warning is what tells the PM to copy the
      // link rather than sit waiting for a reply that can't come.
      if (result.share.email_status === "sent") toast.success(result.message)
      else toast.warning(result.message)
    },
    onError: (err: { message?: string }) =>
      toast.error(err?.message || "Couldn't share this with the client."),
  })
}

export function useApproveShare(cycleId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (stage: ShareStage) => shareApi.approve(cycleId, stage),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pm", "cycle", cycleId, "shares"] })
      // The gate opening changes what the cycle screens allow, so the cycle
      // itself is refetched too. On the brief gate it has also just gained
      // its areas of focus and concept messages, which live on the cycle.
      // No success toast: every approve is followed straight away by a
      // full-screen loader, which already says it worked.
      qc.invalidateQueries({ queryKey: ["pm", "cycle", cycleId] })
    },
    onError: (err: { message?: string }) =>
      toast.error(err?.message || "Couldn't approve the client's response."),
  })
}

export function useSendBackShare(cycleId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ stage, comment }: { stage: ShareStage; comment: string }) =>
      shareApi.sendBack(cycleId, stage, comment),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["pm", "cycle", cycleId, "shares"] })
      toast.success(result.message)
    },
    onError: (err: { message?: string }) =>
      toast.error(err?.message || "Couldn't send it back to the client."),
  })
}

export function useEscalateShare(cycleId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (stage: ShareStage) => shareApi.escalate(cycleId, stage),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["pm", "cycle", cycleId, "shares"] })
      toast.success(result.message)
    },
    onError: (err: { message?: string }) =>
      toast.error(err?.message || "Couldn't send the reminder."),
  })
}

/** Rebuild the areas of focus from the signed-off brief.
 *
 *  Only reachable when approving the brief failed to produce them. The
 *  approval has already happened and cannot be repeated, so this is the PM's
 *  only way off an empty card. */
export function useGenerateAreas(cycleId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => shareApi.generateAreas(cycleId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pm", "cycle", cycleId] })
      toast.success("Areas of focus generated from the approved brief.")
    },
    onError: (err: { message?: string }) =>
      toast.error(err?.message || "Couldn't generate the areas of focus."),
  })
}
