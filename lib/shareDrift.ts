import type { AreaOfFocus } from "@/lib/areasOfFocus"
import type { ConceptMessage } from "@/lib/api/pm"
import type { ShareResponsePayload } from "@/lib/api/share"

/* ────────────────────────────────────────────────────────────────────────────
   What has changed since the client sent their version back.

   Refining and editing stay open while Spark reviews a response, which means
   the text can move between "they sent it" and "we approved it". Approving is
   the signature, so the person signing has to be told the two are no longer
   the same thing — the client's own link shows what THEY sent and will never
   show this change.

   Position is the link throughout: area N and message N belong together, and
   both lists are compared by index.
──────────────────────────────────────────────────────────────────────────── */

export interface CurrentBundle {
  strategic_brief?: string
  areas_of_focus?: AreaOfFocus[]
  concept_messages?: ConceptMessage[]
}

/** Trailing spaces and empty vs missing are not edits anyone made on purpose. */
const same = (a?: string | null, b?: string | null) =>
  (a ?? "").trim() === (b ?? "").trim()

/**
 * Plain-language list of what Spark changed after the client responded.
 *
 * Deliberately ignores the primary/secondary marks: those are the client's to
 * set and Spark's screen cannot change them, so a difference there would be
 * noise, not an edit.
 *
 * @param sent    What the client submitted (the share row's `response`).
 * @param current What is on the cycle now.
 * @returns One short phrase per change; empty when nothing moved.
 */
export function driftSinceResponse(
  sent: ShareResponsePayload | undefined,
  current: CurrentBundle | undefined,
): string[] {
  if (!sent || !current) return []

  const changes: string[] = []

  if (sent.strategic_brief !== undefined) {
    if (!same(sent.strategic_brief, current.strategic_brief)) {
      changes.push("The strategic brief")
    }
  }

  const sentAreas = sent.areas_of_focus ?? []
  const nowAreas = current.areas_of_focus ?? []
  if (sentAreas.length > 0 && sentAreas.length !== nowAreas.length) {
    changes.push("The number of areas of focus")
  }
  for (let i = 0; i < Math.min(sentAreas.length, nowAreas.length); i++) {
    if (!same(sentAreas[i]?.slogan, nowAreas[i]?.slogan)) {
      changes.push(`Area ${i + 1}: “${sentAreas[i]?.slogan ?? ""}”`)
    }
  }

  const sentMessages = sent.concept_messages ?? []
  const nowMessages = current.concept_messages ?? []
  for (let i = 0; i < Math.min(sentMessages.length, nowMessages.length); i++) {
    const titleMoved = !same(sentMessages[i]?.title, nowMessages[i]?.title)
    const bodyMoved = !same(sentMessages[i]?.description, nowMessages[i]?.description)
    if (titleMoved || bodyMoved) {
      changes.push(`Concept message ${i + 1}: “${sentMessages[i]?.title ?? ""}”`)
    }
  }

  return changes
}
