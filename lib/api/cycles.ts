import apiClient from "./client"
import {
  Cycle,
  CycleOverview,
  CompanyProfile,
  Sector,
  CycleReportSection,
  ResolveSectionsResponse,
} from "@/types"

export interface CreateCyclePayload {
  cycle_name: string
  fiscal_year: number
  start_date: string
  end_date: string
  submission_deadline: string
  project_manager_id?: string
  kickoff_brief?: string
  company_profile: CompanyProfile
  sector: Sector
  is_shariah?: boolean
  has_subsidiaries?: boolean
  has_sukuk?: boolean
}

export interface UpdateCyclePayload extends Partial<CreateCyclePayload> {}

export interface CyclesResponse {
  success: boolean
  cycles: Cycle[]
  total: number
}

// Each assignment links one department to one responsible user for a cycle
export interface AssignmentCreate {
  department_id: string
  user_id: string
}

export interface BulkAssignmentRequest {
  assignments: AssignmentCreate[]
}

export const cyclesApi = {
  list: async (status?: string): Promise<CyclesResponse> => {
    const params = status ? `?status=${status}` : ""
    const { data } = await apiClient.get(`/admin/cycles${params}`)
    return data
  },

  get: async (cycleId: string): Promise<Cycle> => {
    const { data } = await apiClient.get(`/admin/cycles/${cycleId}`)
    return data
  },

  create: async (payload: CreateCyclePayload) => {
    const { data } = await apiClient.post("/admin/cycles", payload)
    return data
  },

  update: async (cycleId: string, payload: UpdateCyclePayload) => {
    const { data } = await apiClient.put(`/admin/cycles/${cycleId}`, payload)
    return data
  },

  // Step 1 before activation: assign departments + responsible users to the cycle
  assignDepartments: async (cycleId: string, payload: BulkAssignmentRequest) => {
    const { data } = await apiClient.post(
      `/admin/cycles/${cycleId}/assign-departments`,
      payload
    )
    return data
  },

  // Step 2: activate the cycle (no body — uses pre-assigned departments)
  // generate_questions=true tells the backend to auto-generate AI questions on activation
  activate: async (cycleId: string, generateQuestions = true) => {
    const { data } = await apiClient.post(
      `/admin/cycles/${cycleId}/activate?generate_questions=${generateQuestions}`
    )
    return data
  },

  uploadKickoffDocs: async (cycleId: string, files: File[]) => {
    const formData = new FormData()
    files.forEach((file) => formData.append("files", file))
    // Do NOT set Content-Type manually — axios + FormData sets it with the correct boundary automatically
    const { data } = await apiClient.post(
      `/admin/cycles/${cycleId}/upload-kickoff`,
      formData
    )
    return data
  },

  overview: async (cycleId: string): Promise<CycleOverview> => {
    const { data } = await apiClient.get(`/admin/cycles/${cycleId}/overview`)
    return data
  },

  delete: async (cycleId: string) => {
    const { data } = await apiClient.delete(`/admin/cycles/${cycleId}`)
    return data
  },

  // Resolve the cycle's report-section list from its company profile.
  // Idempotent — safe to call again after a profile change (no duplicates).
  resolveSections: async (cycleId: string): Promise<ResolveSectionsResponse> => {
    const { data } = await apiClient.post(`/admin/cycles/${cycleId}/resolve-sections`)
    return data
  },

  getSections: async (cycleId: string): Promise<CycleReportSection[]> => {
    const { data } = await apiClient.get(`/admin/cycles/${cycleId}/sections`)
    return data.sections
  },
}
