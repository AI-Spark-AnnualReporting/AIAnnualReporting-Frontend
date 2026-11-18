import { toast } from "sonner"

// The backends add this header to every response while the OpenAI account is out of
// credit (AIAnnualReporting/app/core/ai_credits.py and Centriton/ai_credits.py). It is
// detected at their HTTP client, so it arrives even when the AI call that hit the limit
// swallowed its own error — and on the next poll of a background job.
export const AI_CREDITS_HEADER = "x-ai-credits"
const EXHAUSTED_VALUE = "exhausted"

// Many calls fail at once when the credit runs out; one toast is enough.
const REPEAT_AFTER_MS = 5 * 60 * 1000
let lastShownAt: number | null = null

export const AI_CREDITS_TITLE = "AI features are unavailable"
export const AI_CREDITS_MESSAGE =
  "AI features can't be used at the moment. Please contact the support team for help."

/** Show the "AI features are unavailable" toast, at most once every 5 minutes. */
export function showAiCreditsPausedToast(): void {
  const now = Date.now()
  if (lastShownAt !== null && now - lastShownAt < REPEAT_AFTER_MS) return
  lastShownAt = now
  toast.error(AI_CREDITS_TITLE, { id: "ai-credits", description: AI_CREDITS_MESSAGE })
}

type HeaderSource =
  | { get?: (name: string) => unknown }
  | Record<string, unknown>
  | null
  | undefined

/** Read one header from fetch Headers, AxiosHeaders or a plain object. */
function readHeader(headers: HeaderSource, name: string): unknown {
  if (!headers) return undefined
  const getter = (headers as { get?: (n: string) => unknown }).get
  if (typeof getter === "function") return getter.call(headers, name)
  return (headers as Record<string, unknown>)[name]
}

/** Show the toast when a backend response says the AI credits ran out. */
export function checkAiCreditsHeader(headers: HeaderSource): void {
  if (readHeader(headers, AI_CREDITS_HEADER) === EXHAUSTED_VALUE) {
    showAiCreditsPausedToast()
  }
}

/** Test-only: forget when the toast was last shown. */
export function resetAiCreditsToastForTests(): void {
  lastShownAt = null
}

// ── The company's own AI credits (Centriyon plans) ──────────────────────
// Different from the toast above (Spark's OpenAI account is empty): here the
// company has used its plan's AI credits. Centriyon refuses the AI action with
// a 403 whose message says so, e.g.
//   "Not enough AI credits (balance -95). Ask your admin to buy more."
//   "Custom template needs at least 60 AI credits to start; you have 45. ..."
//   "No active subscription, so AI features are off. Ask your admin."
// Matched by wording because the 403 has no other marker; the wording lives in
// Centriton/credit_usage.py (require_credits).
export const NOT_ENOUGH_CREDITS_TITLE = "Not enough AI credits"
const CREDITS_REFUSAL_WORDS = /AI credits|AI features are off/i

/** True when a failed request is Centriyon refusing an AI action for credits. */
export function isAiCreditsRefusal(status: number | undefined, message: string | null | undefined): boolean {
  return status === 403 && !!message && CREDITS_REFUSAL_WORDS.test(message)
}

/**
 * Show Centriyon's credits message as a toast, so it is seen even on screens
 * that show their own generic error. One toast at a time (same id), so a
 * page with several AI calls doesn't stack them.
 */
export function showAiCreditsRefusal(status: number | undefined, message: string | null | undefined): void {
  if (!isAiCreditsRefusal(status, message)) return
  toast.error(NOT_ENOUGH_CREDITS_TITLE, { id: "ai-credits-refused", description: message ?? "" })
}
