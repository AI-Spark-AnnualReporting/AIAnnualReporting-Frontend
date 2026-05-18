import apiClient from "./client"
import { KBDocument, KBListResponse, KBDownloadResponse } from "@/types"

export const knowledgeBaseApi = {
  /**
   * GET /documents/ — lists ALL documents owned by the current user.
   * This endpoint takes no query params and is not paginated, so the
   * Knowledge Base screen does purpose-filtering, search and pagination
   * client-side. Response shape: { success, documents, total }.
   */
  list: async (): Promise<KBListResponse> => {
    const { data } = await apiClient.get("/documents/")
    return data
  },

  get: async (documentId: string): Promise<KBDocument> => {
    const { data } = await apiClient.get(`/documents/${documentId}`)
    return data
  },

  // GET /documents/{id}/download — returns a { download_url, filename, ... } payload
  getDownloadUrl: async (documentId: string): Promise<KBDownloadResponse> => {
    const { data } = await apiClient.get(`/documents/${documentId}/download`)
    return data
  },

  delete: async (documentId: string): Promise<void> => {
    await apiClient.delete(`/documents/${documentId}`)
  },
}
