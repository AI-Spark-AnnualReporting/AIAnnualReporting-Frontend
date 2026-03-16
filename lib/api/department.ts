import apiClient from "./client"
import { DepartmentDashboard, Session } from "@/types"

export interface SubmitAnswersPayload {
  answers: {
    question_id: string
    question: string
    answer: string
  }[]
}

export interface FinalizePayload {
  final_content: string
}

export interface AiAssistPayload {
  question_id: string
  question: string
  context?: string
}

export interface AdjustTonePayload {
  content: string
  target_tone: string
}

export interface ConversationPromptPayload {
  question_id: string
  question: string
  current_answer: string
  prompt: string
}

export const departmentApi = {
  dashboard: async (): Promise<DepartmentDashboard> => {
    const { data } = await apiClient.get("/department/dashboard")
    return data
  },

  getSession: async (sessionId: string): Promise<{ success: boolean; session: Session }> => {
    const { data } = await apiClient.get(`/department/sessions/${sessionId}`)
    return data
  },

  submitAnswers: async (sessionId: string, payload: SubmitAnswersPayload) => {
    const { data } = await apiClient.post(
      `/department/sessions/${sessionId}/answers`,
      payload
    )
    return data
  },

  generateDraft: async (sessionId: string) => {
    const { data } = await apiClient.post(
      `/department/sessions/${sessionId}/generate-draft`
    )
    return data
  },

  finalize: async (sessionId: string, payload: FinalizePayload) => {
    const { data } = await apiClient.post(
      `/department/sessions/${sessionId}/finalize`,
      payload
    )
    return data
  },

  uploadDocument: async (sessionId: string, file: File) => {
    const formData = new FormData()
    formData.append("file", file)
    // Must delete the instance-level "Content-Type: application/json" default so axios can
    // auto-set "multipart/form-data; boundary=..." from the FormData object.
    // Also raise timeout — backend performs text extraction + vector chunking which can take >30s.
    const { data } = await apiClient.post(
      `/department/sessions/${sessionId}/upload-document`,
      formData,
      {
        headers: { "Content-Type": undefined },
        timeout: 120000, // 2 min — allows time for text extraction + vectorisation
      }
    )
    return data
  },

  getAiSuggestion: async (sessionId: string, questionId: string) => {
    const { data } = await apiClient.get(
      `/department/sessions/${sessionId}/questions/${questionId}/suggestion`
    )
    return data
  },

  suggestAnswer: async (sessionId: string, payload: AiAssistPayload) => {
    const { data } = await apiClient.post(
      `/department/sessions/${sessionId}/suggest-answer`,
      payload
    )
    return data
  },

  conversationPrompt: async (sessionId: string, payload: ConversationPromptPayload) => {
    const { data } = await apiClient.post(
      `/department/sessions/${sessionId}/conversation`,
      payload
    )
    return data
  },

  adjustTone: async (sessionId: string, payload: AdjustTonePayload) => {
    const { data } = await apiClient.post(
      `/department/sessions/${sessionId}/adjust-tone`,
      payload
    )
    return data
  },
}
