import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { knowledgeBaseApi, KBListParams } from "@/lib/api/knowledge-base"
import { toast } from "sonner"

export function useKBDocuments(params: KBListParams = {}) {
  return useQuery({
    queryKey: ["kb-documents", params],
    queryFn: () => knowledgeBaseApi.list(params),
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
