import apiClient from "./client"
import { User } from "@/types"

// Centriyon SSO: SAR no longer issues its own tokens. The only auth endpoints
// SAR talks to are /auth/me (hydrate the user from the Centriyon JWT) and
// /auth/logout (best-effort server-side cleanup before redirecting to
// Centriyon). Login, registration, refresh, password reset, and password
// change all live in Centriyon.
export const authApi = {
  me: async (): Promise<User> => {
    const { data } = await apiClient.get("/auth/me")
    return data
  },

  logout: async () => {
    const { data } = await apiClient.post("/auth/logout")
    return data
  },
}
