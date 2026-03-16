import apiClient from "./client"
import { LoginResponse, User } from "@/types"

export interface LoginPayload {
  email: string
  password: string
}

export interface ChangePasswordPayload {
  current_password: string
  new_password: string
}

export interface ResetPasswordRequestPayload {
  email: string
}

export interface ResetPasswordConfirmPayload {
  token: string
  new_password: string
}

export const authApi = {
  login: async (payload: LoginPayload): Promise<LoginResponse> => {
    const { data } = await apiClient.post("/auth/login", payload)
    return data
  },

  me: async (): Promise<User> => {
    const { data } = await apiClient.get("/auth/me")
    return data
  },

  refresh: async (refreshToken: string) => {
    const { data } = await apiClient.post("/auth/refresh", {
      refresh_token: refreshToken,
    })
    return data
  },

  logout: async () => {
    const { data } = await apiClient.post("/auth/logout")
    return data
  },

  changePassword: async (payload: ChangePasswordPayload) => {
    const { data } = await apiClient.post("/auth/change-password", payload)
    return data
  },

  requestPasswordReset: async (payload: ResetPasswordRequestPayload) => {
    const { data } = await apiClient.post("/auth/password-reset/request", payload)
    return data
  },

  confirmPasswordReset: async (payload: ResetPasswordConfirmPayload) => {
    const { data } = await apiClient.post("/auth/password-reset/confirm", payload)
    return data
  },
}
