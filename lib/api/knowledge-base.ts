import apiClient from "./client"
import {
  KBDocumentDetail,
  KBDocumentText,
  KBDownloadResponse,
  KBListResponse,
  DocumentPurpose,
} from "@/types"

// Knowledge Base router is mounted at /api/v1/knowledge-base. apiClient's
// baseURL already includes /api/v1, so paths here start at /knowledge-base.

export interface KBListParams {
  document_purpose?: DocumentPurpose
  page?: number
  page_size?: number
}

export const knowledgeBaseApi = {
  /**
   * GET /knowledge-base/documents — server-paginated, server-role-scoped list.
   * Filter by document_purpose only; pagination is server-side. The response
   * carries uploader_name/department_name/cycle_name resolved server-side, so
   * no client-side joins are needed. Use `total` for the pager.
   */
  list: async (params: KBListParams = {}): Promise<KBListResponse> => {
    const { data } = await apiClient.get("/knowledge-base/documents", { params })
    return data
  },

  // GET /knowledge-base/documents/{id} — single-document metadata (incl. word_count).
  get: async (documentId: string): Promise<KBDocumentDetail> => {
    const { data } = await apiClient.get(`/knowledge-base/documents/${documentId}`)
    return data
  },

  // GET /knowledge-base/documents/{id}/text — extracted plain text.
  getText: async (documentId: string): Promise<KBDocumentText> => {
    const { data } = await apiClient.get(
      `/knowledge-base/documents/${documentId}/text`
    )
    return data
  },

  /**
   * GET /knowledge-base/documents/{id}/download — returns a short-lived signed
   * URL. Fetch it fresh on each download; do not cache (it expires).
   */
  getDownloadUrl: async (documentId: string): Promise<KBDownloadResponse> => {
    const { data } = await apiClient.get(
      `/knowledge-base/documents/${documentId}/download`
    )
    return data
  },
}

// Note: the API exposes DELETE /knowledge-base/documents/{id} (admin only),
// but document deletion is intentionally not surfaced in the frontend.
