"use client"

// Is this AI step affordable right now? Screens grey out its button with the
// reason when it isn't. The click is still checked by the backend, so a stale
// or failed status never lets anything run that shouldn't.
// Plan: Centriton/.claude/plans/ai-credits-before-start.md

import { useQuery } from "@tanstack/react-query"
import { aiCreditsApi } from "@/lib/api/aiCredits"
import { stepBlockReason, type AiStep } from "@/lib/aiCreditStatus"

export const AI_CREDIT_STATUS_KEY = ["ai-credit-status"]

// ponytail: re-read every minute and on tab focus rather than after each AI
// job; another user's spending shows up within a minute. The click-time check
// covers the gap.
const REFRESH_MS = 60_000

/** Shared by every button on the screen: one request, cached by React Query. */
export function useAiCreditStatus() {
  return useQuery({
    queryKey: AI_CREDIT_STATUS_KEY,
    queryFn: aiCreditsApi.status,
    staleTime: REFRESH_MS / 2,
    refetchInterval: REFRESH_MS,
    refetchOnWindowFocus: true,
    retry: false,
  })
}

/** {blocked, reason} for one AI step. */
export function useAiStep(step: AiStep): { blocked: boolean; reason: string | null } {
  const { data } = useAiCreditStatus()
  const reason = stepBlockReason(data, step)
  return { blocked: reason !== null, reason }
}
