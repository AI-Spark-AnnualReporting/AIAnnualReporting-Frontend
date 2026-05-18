import apiClient from "./client"
import { KBDocument, KBListResponse, KBDownloadResponse } from "@/types"

export interface KBListParams {
  document_purpose?: string
  page?: number
  page_size?: number
}

export const knowledgeBaseApi = {
  list: async (params: KBListParams = {}): Promise<KBListResponse> => {
    const query = new URLSearchParams()
    if (params.document_purpose) query.set("document_purpose", params.document_purpose)
    if (params.page) query.set("page", String(params.page))
    if (params.page_size) query.set("page_size", String(params.page_size))
    const qs = query.toString()
    const { data } = await apiClient.get(`/knowledge-base/documents${qs ? `?${qs}` : ""}`)
    return data
  },

  get: async (documentId: string): Promise<KBDocument> => {
    const { data } = await apiClient.get(`/knowledge-base/documents/${documentId}`)
    return data
  },

  getDownloadUrl: async (documentId: string): Promise<KBDownloadResponse> => {
    const { data } = await apiClient.get(`/knowledge-base/documents/${documentId}/download`)
    return data
  },

  delete: async (documentId: string): Promise<void> => {
    await apiClient.delete(`/knowledge-base/documents/${documentId}`)
  },
}
