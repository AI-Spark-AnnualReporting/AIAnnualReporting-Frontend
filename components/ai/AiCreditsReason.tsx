"use client"

// The small amber line under an AI button the company can't afford right now.
// Renders nothing when the step may start. Plan: Centriton/.claude/plans/ai-credits-before-start.md

import { useAiStep } from "@/hooks/useAiStep"
import type { AiStep } from "@/lib/aiCreditStatus"

export function AiCreditsReason({ step, className = "" }: { step: AiStep; className?: string }) {
  const { reason } = useAiStep(step)
  if (!reason) return null
  return (
    <p role="status" className={`mt-1 text-xs text-amber-700 ${className}`}>
      {reason}
    </p>
  )
}
