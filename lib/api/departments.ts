import apiClient from "./client"
import { Department } from "@/types"

export interface CreateDepartmentPayload {
  department_code: string
  department_name: string
  description?: string
}

export interface UpdateDepartmentPayload {
  department_name?: string
  description?: string
  initial_prompt?: string
  system_prompt?: string
  is_active?: boolean
}

export interface DepartmentsResponse {
  success: boolean
  departments: Department[]
  total: number
}

export const departmentsApi = {
  list: async (): Promise<DepartmentsResponse> => {
    const { data } = await apiClient.get("/admin/departments")
    return data
  },

  get: async (deptId: string): Promise<{ success: boolean; department: Department }> => {
    const { data } = await apiClient.get(`/admin/departments/${deptId}`)
    // Backend may return either { success, department } or the bare Department object.
    if (data && typeof data === "object" && "department" in data) {
      return data
    }
    return { success: true, department: data as Department }
  },

  create: async (payload: CreateDepartmentPayload) => {
    const { data } = await apiClient.post("/admin/departments", payload)
    return data
  },

  update: async (deptId: string, payload: UpdateDepartmentPayload) => {
    const { data } = await apiClient.put(`/admin/departments/${deptId}`, payload)
    return data
  },

  assignUsers: async (deptId: string, userIds: string[]) => {
    const { data } = await apiClient.post(`/admin/departments/${deptId}/users`, { user_ids: userIds })
    return data
  },
}
