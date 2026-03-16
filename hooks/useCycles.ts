import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { cyclesApi, CreateCyclePayload, UpdateCyclePayload, BulkAssignmentRequest } from "@/lib/api/cycles"
import { toast } from "sonner"

export function useCycles(status?: string) {
  return useQuery({
    queryKey: ["cycles", { status }],
    queryFn: () => cyclesApi.list(status),
  })
}

export function useCycle(cycleId: string) {
  return useQuery({
    queryKey: ["cycle", cycleId],
    queryFn: () => cyclesApi.get(cycleId),
    enabled: !!cycleId,
  })
}

export function useCycleOverview(cycleId: string) {
  return useQuery({
    queryKey: ["cycle", cycleId, "overview"],
    queryFn: () => cyclesApi.overview(cycleId),
    enabled: !!cycleId,
    staleTime: 0,
    refetchInterval: 15_000, // poll so async session-creation after activation is reflected
    refetchIntervalInBackground: false,
  })
}

export function useCreateCycle() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateCyclePayload) => cyclesApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cycles"] })
      toast.success("Cycle created successfully")
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message || "Failed to create cycle")
    },
  })
}

export function useUpdateCycle() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ cycleId, data }: { cycleId: string; data: UpdateCyclePayload }) =>
      cyclesApi.update(cycleId, data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["cycle", vars.cycleId] })
      qc.invalidateQueries({ queryKey: ["cycles"] })
      toast.success("Cycle updated successfully")
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message || "Failed to update cycle")
    },
  })
}

export function useUploadKickoffDocs() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ cycleId, files }: { cycleId: string; files: File[] }) =>
      cyclesApi.uploadKickoffDocs(cycleId, files),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["cycle", vars.cycleId] })
      toast.success("Documents uploaded successfully")
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message || "Failed to upload documents")
    },
  })
}

export function useAssignDepartments() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ cycleId, payload }: { cycleId: string; payload: BulkAssignmentRequest }) =>
      cyclesApi.assignDepartments(cycleId, payload),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["cycle", vars.cycleId] })
      qc.invalidateQueries({ queryKey: ["cycle", vars.cycleId, "overview"] })
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message || "Failed to assign departments")
    },
  })
}

export function useDeleteCycle() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (cycleId: string) => cyclesApi.delete(cycleId),
    onSuccess: (_, cycleId) => {
      qc.invalidateQueries({ queryKey: ["cycles"] })
      qc.removeQueries({ queryKey: ["cycle", cycleId] })
      toast.success("Cycle deleted")
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message || "Failed to delete cycle")
    },
  })
}

export function useActivateCycle() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ cycleId, generateQuestions }: { cycleId: string; generateQuestions?: boolean }) =>
      cyclesApi.activate(cycleId, generateQuestions ?? true),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["cycle", vars.cycleId] })
      qc.invalidateQueries({ queryKey: ["cycles"] })
      toast.success("Cycle activated! Sessions are being created.")
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message || "Failed to activate cycle")
    },
  })
}
