"use client"

// One slim amber bar under the top bar, on every page, while any AI step can't
// start (balance below its minimum, at 0 or below, or no plan). The buttons
// stay greyed out; this makes sure the reason is always visible, even for
// toolbar buttons whose hover text a disabled button never shows.
// Plan: Centriton/.claude/plans/ai-credits-before-start.md

import { AlertTriangle } from "lucide-react"
import { useAiCreditStatus } from "@/hooks/useAiStep"
import { anyStepBlocked } from "@/lib/aiCreditStatus"

export const AI_CREDITS_BANNER_TEXT =
  "You don't have enough AI credits. Contact your admin."

export function AiCreditsBanner() {
  const { data } = useAiCreditStatus()
  if (!anyStepBlocked(data)) return null
  return (
    <div role="status" className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-8 py-2 text-xs font-medium text-amber-800">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
      {AI_CREDITS_BANNER_TEXT}
    </div>
  )
}
