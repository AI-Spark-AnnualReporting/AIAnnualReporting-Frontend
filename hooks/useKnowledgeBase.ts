import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { knowledgeBaseApi } from "@/lib/api/knowledge-base"
import { cyclesApi } from "@/lib/api/cycles"
import { pmApi } from "@/lib/api/pm"
import { departmentApi } from "@/lib/api/department"
import { useAuth } from "@/contexts/AuthContext"
import { toast } from "sonner"

export function useKBDocuments() {
  return useQuery({
    queryKey: ["kb-documents"],
    queryFn: () => knowledgeBaseApi.list(),
  })
}

/**
 * Resolves a `cycle_id -> cycle_name` map. GET /documents/ only returns
 * `cycle_id`, so cycle names are fetched from the role-appropriate cycles
 * endpoint and joined client-side. Falls back to an empty map on error so a
 * cycles failure never blocks the document list.
 */
export function useKBCycleNames() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ["kb-cycle-names", user?.role],
    enabled: !!user,
    queryFn: async (): Promise<Record<string, string>> => {
      const map: Record<string, string> = {}
      try {
        if (user?.role === "admin") {
          const { cycles } = await cyclesApi.list()
          cycles.forEach((c) => {
            map[c.id] = c.cycle_name
          })
        } else if (user?.role === "project_manager") {
          const { cycles } = await pmApi.getCycles()
          cycles.forEach((c) => {
            map[c.cycle_id] = c.cycle_name
          })
        } else {
          const dash = await departmentApi.dashboard()
          dash.assignments.forEach((a) => {
            map[a.cycle_id] = a.cycle_name
          })
        }
      } catch {
        // Degrade gracefully — cycle headers fall back to "Uncategorized".
      }
      return map
    },
  })
}

export function useDeleteKBDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (documentId: string) => knowledgeBaseApi.delete(documentId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["kb-documents"] })
      toast.success("Document deleted")
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message || "Failed to delete document")
    },
  })
}
