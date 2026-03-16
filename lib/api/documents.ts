import apiClient from "./client"

export const documentsApi = {
  upload: async (file: File, purpose?: string) => {
    const formData = new FormData()
    formData.append("file", file)
    if (purpose) formData.append("purpose", purpose)
    const { data } = await apiClient.post("/documents/upload", formData, {
      headers: { "Content-Type": undefined },
      timeout: 120000,
    })
    return data
  },

  list: async () => {
    const { data } = await apiClient.get("/documents/")
    return data
  },

  get: async (documentId: string) => {
    const { data } = await apiClient.get(`/documents/${documentId}`)
    return data
  },

  getText: async (documentId: string) => {
    const { data } = await apiClient.get(`/documents/${documentId}/text`)
    return data
  },

  delete: async (documentId: string) => {
    const { data } = await apiClient.delete(`/documents/${documentId}`)
    return data
  },
}
