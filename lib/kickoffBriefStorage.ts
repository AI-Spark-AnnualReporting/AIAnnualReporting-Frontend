import { GenerateBriefAnswer } from "@/lib/api/pm"

/**
 * Hands the Strategic Brief questionnaire's answers from Step 1 to Step 2
 * across a client-side navigation, entirely in sessionStorage (there is no
 * backend endpoint to store in-progress answers).
 *
 * Two keys per cycle:
 *  - `answers`: the payload itself. Kept around (not deleted) so "Regenerate"
 *    on the review screen can resend it after the initial auto-generate.
 *  - `trigger`: a one-shot flag. Consumed (and removed) by Step 2's mount
 *    effect so a plain page reload never re-fires generation — it falls back to
 *    whatever the cycle already has persisted instead.
 *
 *    Set only when Step 1 actually wants a NEW brief. Once a brief exists,
 *    going forward again must not silently rewrite it (and with it the areas of
 *    focus and every concept message hanging off them) — Step 2 has an explicit
 *    Regenerate button for when that is the intent.
 */
const answersKey = (cycleId: string) => `kickoff-answers-${cycleId}`
const triggerKey = (cycleId: string) => `kickoff-trigger-${cycleId}`

export function storeKickoffAnswers(
  cycleId: string,
  answers: GenerateBriefAnswer[],
  { generate = true }: { generate?: boolean } = {},
) {
  sessionStorage.setItem(answersKey(cycleId), JSON.stringify(answers))
  // Kept either way so Step 2's Regenerate has something to resend.
  if (generate) sessionStorage.setItem(triggerKey(cycleId), "1")
  else sessionStorage.removeItem(triggerKey(cycleId))
}

export function readKickoffAnswers(cycleId: string): GenerateBriefAnswer[] | null {
  const raw = sessionStorage.getItem(answersKey(cycleId))
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

/** Returns true exactly once per Step 1 submission, then clears itself. */
export function consumeKickoffTrigger(cycleId: string): boolean {
  const pending = sessionStorage.getItem(triggerKey(cycleId)) === "1"
  sessionStorage.removeItem(triggerKey(cycleId))
  return pending
}
