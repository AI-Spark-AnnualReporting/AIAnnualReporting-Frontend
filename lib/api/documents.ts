import apiClient from "./client"
import { ContentLanguage } from "@/types"

export interface DocumentLanguageCheckResponse {
  success: boolean
  matches: boolean
  detected_language: ContentLanguage | "ambiguous" | "unknown"
  expected_language: ContentLanguage
}

export interface DocumentDownloadResponse {
  document_id: string
  filename: string
  download_url: string
  expires_in: number
}

export const documentsApi = {
  /**
   * GET /documents/{id}/download — a short-lived signed URL. Fetch it fresh on
   * each download; do not cache it, it expires.
   */
  getDownloadUrl: async (documentId: string): Promise<DocumentDownloadResponse> => {
    const { data } = await apiClient.get<DocumentDownloadResponse>(
      `/documents/${documentId}/download`,
    )
    return data
  },

  // Check whether a picked document is in the expected language WITHOUT
  // uploading it — lets the UI warn the moment a file is attached instead of
  // only after the user clicks the final submit button. Mirrors the backend's
  // upload-time language gate, so the verdict here matches what enforcement
  // would later decide.
  checkLanguage: async (
    file: File,
    expectedLanguage: ContentLanguage,
  ): Promise<DocumentLanguageCheckResponse> => {
    const formData = new FormData()
    formData.append("file", file)
    formData.append("expected_language", expectedLanguage)
    // Delete the instance-level JSON Content-Type so axios sets the multipart
    // boundary itself. Modest timeout — extraction only, no storage/embedding.
    const { data } = await apiClient.post<DocumentLanguageCheckResponse>(
      "/documents/check-language",
      formData,
      { headers: { "Content-Type": undefined }, timeout: 60000 },
    )
    return data
  },

  // Delete a stored document by id (DELETE /documents/{id}). Used to detach an
  // uploaded strategic-brief doc when the PM removes it without replacing —
  // otherwise the doc stays on the cycle and generate-brief keeps using it.
  remove: async (documentId: string): Promise<void> => {
    await apiClient.delete(`/documents/${documentId}`)
  },
}
