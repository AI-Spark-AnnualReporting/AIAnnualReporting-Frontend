// Which AI steps the company can start right now — Centriyon's answer, read
// through GET /ai-credits/status. Pure, so `node lib/aiCreditStatus.test.ts`
// can check it. Plan: Centriton/.claude/plans/ai-credits-before-start.md

/** One AI step's key, e.g. "annual.design.custom_template". */
export type AiStep =
  | "annual.brief" | "annual.questions" | "annual.outline" | "annual.section" | "annual.department_draft"
  | "annual.sitemap" | "annual.refine"
  | "annual.assemble" | "annual.translate" | "annual.validate" | "annual.design.extract"
  | "annual.design.sketch" | "annual.design.custom_template" | "annual.design.adjust"
  | "annual.documents" | "annual.extract_answers" | "annual.chat"

export interface AiStepStatus {
  minimum: number
  allowed: boolean
  reason: string | null
}

export interface AiCreditStatus {
  applies: boolean                       // false: Spark staff / on-premises — never blocked
  balance: number | null                 // the company admin only
  actions: Record<string, AiStepStatus>
}

/**
 * Why this step can't start, or null when it may (or when we don't know: the
 * click is still checked by the backend, so an unknown status never blocks).
 */
export function stepBlockReason(status: AiCreditStatus | null | undefined, step: AiStep): string | null {
  if (!status || !status.applies) return null
  const found = status.actions[step]
  if (!found || found.allowed) return null
  return found.reason || "Not enough AI credits for this step. Ask your admin to buy more."
}

/** True when at least one AI step can't start right now (never on unknown status). */
export function anyStepBlocked(status: AiCreditStatus | null | undefined): boolean {
  if (!status || !status.applies) return false
  return Object.values(status.actions).some((step) => !step.allowed)
}
