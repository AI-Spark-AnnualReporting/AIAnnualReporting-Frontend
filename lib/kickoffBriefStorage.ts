import { GenerateBriefAnswer } from "@/lib/api/pm"

/**
 * Hands the Strategic Brief questionnaire's answers from Step 1 to Step 2
 * across a client-side navigation, entirely in sessionStorage (there is no
 * backend endpoint to store in-progress answers).
 *
 * Two keys per cycle:
 *  - `answers`: the payload itself. Kept around (not deleted) so "Regenerate"
 *    on the review screen can resend it after the initial auto-generate.
 *  - `trigger`: a one-shot flag. Present only right after Step 1's "Generate
 *    brief" click; consumed (and removed) by Step 2's mount effect so a plain
 *    page reload never re-fires generation — it falls back to whatever the
 *    cycle already has persisted instead.
 */
const answersKey = (cycleId: string) => `kickoff-answers-${cycleId}`
const triggerKey = (cycleId: string) => `kickoff-trigger-${cycleId}`

export function storeKickoffAnswers(cycleId: string, answers: GenerateBriefAnswer[]) {
  sessionStorage.setItem(answersKey(cycleId), JSON.stringify(answers))
  sessionStorage.setItem(triggerKey(cycleId), "1")
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
