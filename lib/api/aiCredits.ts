import apiClient from "./client"
import type { AiCreditStatus } from "@/lib/aiCreditStatus"

export const aiCreditsApi = {
  /** Which AI steps the company can start right now (read-only). */
  status: async (): Promise<AiCreditStatus> => {
    const { data } = await apiClient.get("/ai-credits/status")
    return data
  },
}
