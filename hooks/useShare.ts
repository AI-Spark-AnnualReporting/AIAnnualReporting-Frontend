import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { CycleShares, shareApi, ShareStage } from "@/lib/api/share"

/** One gate's history. Fetched only while the History panel is open, and
 *  fresh each time it opens. */
export function useKickoffHistory(cycleId: string, stage: ShareStage, open: boolean) {
  return useQuery({
    queryKey: ["pm", "cycle", cycleId, "history", stage],
    queryFn: () => shareApi.history(cycleId, stage),
    enabled: open && !!cycleId,
    staleTime: 0,
  })
}

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
    onSuccess: (result, stage) => {
      // Write the approved share into the cache straight away. The caller
      // moves on at once (the brief gate goes to step 3), and step 3 checks
      // "is the brief approved?" — read from a cache still saying
      // "responded" while the refetch was in flight, it sent Spark back to
      // step 2 showing the old status.
      qc.setQueryData<CycleShares>(["pm", "cycle", cycleId, "shares"], (old) =>
        old ? { ...old, [stage]: result.share } : old,
      )
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
