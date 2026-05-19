import { useQuery, keepPreviousData } from "@tanstack/react-query"
import { knowledgeBaseApi, KBListParams } from "@/lib/api/knowledge-base"

/**
 * Server-paginated document list. Pass `page`, `page_size` and an optional
 * `document_purpose`; role-scoping and pagination are enforced server-side.
 * `keepPreviousData` keeps the current page visible while the next one loads.
 */
export function useKBDocuments(params: KBListParams) {
  return useQuery({
    queryKey: ["kb-documents", params],
    queryFn: () => knowledgeBaseApi.list(params),
    placeholderData: keepPreviousData,
  })
}

/** Extracted plain text for one document. Disabled until a documentId is given. */
export function useKBDocumentText(documentId: string | null) {
  return useQuery({
    queryKey: ["kb-document-text", documentId],
    enabled: !!documentId,
    queryFn: () => knowledgeBaseApi.getText(documentId!),
  })
}
