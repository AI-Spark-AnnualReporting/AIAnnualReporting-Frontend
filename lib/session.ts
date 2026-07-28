// Department session rules that more than one page needs to agree on.
// Kept here (rather than re-derived per page) because the flow is non-linear:
// the workspace, outline, and draft pages must lock at exactly the same moment,
// or the user finds a door that opens from one side only.

import type { Session, SessionStatus } from "@/types"

// Statuses in which the department user may still change answers, outline
// titles, and the draft. Status-only by design: generating a draft is not a
// commitment, submitting is — so nothing here keys off draft existence.
// `assigned`/`hod_curation` are excluded: the questions aren't with the user yet.
// `not_started` is included because the backend flips status on first save.
const EDITABLE_STATUSES: readonly SessionStatus[] = [
  "not_started",
  "in_progress",
  "reopened",
]

/** True while the department user can still change anything in the session. */
export function canEditSession(status: SessionStatus | undefined): boolean {
  return !!status && EDITABLE_STATUSES.includes(status)
}

/** True once the report is with the PM (or approved) — terminal for the dept user. */
export function isSessionSubmitted(status: SessionStatus | undefined): boolean {
  return status === "submitted" || status === "approved"
}

// Structural, not `Session`, so PM/HOD session shapes can pass through without
// coupling to the full interface.
type DraftFields = Pick<
  Session,
  "draft_content" | "ai_generated_draft" | "final_submission"
>

/**
 * The working copy of the draft — what the editor should show.
 *
 * Order matters, and `??` (not `||`) matters: an empty string is a real value,
 * meaning "the user deliberately cleared this", and must not fall through.
 *
 *   draft_content    — live edits, and the AI output that seeded them
 *   final_submission — nulled draft_content means this was submitted; on reopen
 *                      this is the text the user actually sent, so it wins over
 *                      the stale raw AI output below
 *   ai_generated_draft — last resort / provenance
 */
export function draftContent(session: DraftFields | undefined): string {
  return (
    session?.draft_content ??
    session?.final_submission ??
    session?.ai_generated_draft ??
    ""
  )
}

/** True when a draft exists in any form — gates the "Draft" navigation affordance. */
export function hasDraft(session: DraftFields | undefined): boolean {
  return draftContent(session).trim().length > 0
}

// ── Staleness ───────────────────────────────────────────────────────────────
// The flow is non-linear, so "I edited my answers after this was built" is a
// normal thing to do rather than an error — but nothing downstream rebuilds
// itself, so the user has to be told. Both clocks must be present to compare:
// sessions predating these fields have neither and correctly show no warning.

type StaleFields = Pick<
  Session,
  "answers_updated_at" | "outline_generated_at" | "draft_generated_at"
>

function answersNewerThan(
  session: StaleFields | undefined,
  builtAt: string | null | undefined
): boolean {
  const answersAt = session?.answers_updated_at
  if (!answersAt || !builtAt) return false
  const a = Date.parse(answersAt)
  const b = Date.parse(builtAt)
  if (Number.isNaN(a) || Number.isNaN(b)) return false
  return a > b
}

/** True when answers changed after the outline was generated. */
export function isOutlineStale(session: StaleFields | undefined): boolean {
  return answersNewerThan(session, session?.outline_generated_at)
}

/** True when answers changed after the draft was generated. */
export function isDraftStale(session: StaleFields | undefined): boolean {
  return answersNewerThan(session, session?.draft_generated_at)
}
