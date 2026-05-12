import apiClient from "./client"
import { User, AdminStats } from "@/types"

export interface CreateUserPayload {
  email: string
  password: string
  full_name: string
  role: string
  department?: string
  phone?: string
}

export interface UpdateUserPayload {
  full_name?: string
  department?: string
  status?: string
  role?: string
}

export interface UsersFilters {
  page?: number
  page_size?: number
  role?: string
  status?: string
  department?: string
  department_id?: string
}

export interface UsersResponse {
  success: boolean
  users: User[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

export const usersApi = {
  list: async (filters: UsersFilters = {}): Promise<UsersResponse> => {
    const params = new URLSearchParams()
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== "") params.set(key, String(value))
    })
    const { data } = await apiClient.get(`/admin/users?${params}`)
    return data
  },

  get: async (userId: string): Promise<{ success: boolean; user: User }> => {
    const { data } = await apiClient.get(`/admin/users/${userId}`)
    return data
  },

  create: async (payload: CreateUserPayload) => {
    // Step 1: Register via /auth/register (creates user with proper UUID, status=pending)
    // POST /admin/users has a known backend UUID bug; /auth/register works correctly.
    const { data: registerData } = await apiClient.post("/auth/register", payload)
    const userId: string | undefined = registerData?.user_id || registerData?.id

    // Step 2: Auto-activate so the user is ready immediately (admin-created = trusted)
    if (userId) {
      const { data: activateData } = await apiClient.post(`/admin/users/${userId}/activate`)
      return activateData
    }
    return registerData
  },

  update: async (userId: string, payload: UpdateUserPayload) => {
    const { data } = await apiClient.put(`/admin/users/${userId}`, payload)
    return data
  },

  activate: async (userId: string) => {
    const { data } = await apiClient.post(`/admin/users/${userId}/activate`)
    return data
  },

  delete: async (userId: string) => {
    const { data } = await apiClient.delete(`/admin/users/${userId}`)
    return data
  },

  stats: async (): Promise<{ success: boolean } & AdminStats> => {
    const { data } = await apiClient.get("/admin/users/stats")
    return data
  },

  adminStats: async () => {
    const { data } = await apiClient.get("/admin/stats")
    return data
  },
}
