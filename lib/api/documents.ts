import apiClient from "./client"
import { ContentLanguage } from "@/types"

export interface DocumentLanguageCheckResponse {
  success: boolean
  matches: boolean
  detected_language: ContentLanguage | "ambiguous" | "unknown"
  expected_language: ContentLanguage
}

export const documentsApi = {
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
}
