/**
 * Areas-of-focus shape + the selection rule, kept free of any import so it can
 * be exercised directly (`node lib/areasOfFocus.test.ts`). Re-exported from
 * lib/api/pm.ts — import from there, not from here.
 */

export type AreaRole = "primary" | "secondary" | "none"

export interface AreaOfFocus {
  slogan: string
  sub_slogans: string[]
  summary?: string
  role: AreaRole
}

export const MIN_SELECTED_AREAS = 2
export const MAX_SELECTED_AREAS = 5

/** How many areas may sit on the page at once — not the same limit.
 *
 *  MAX_SELECTED_AREAS is how many may be MARKED USED, and the server enforces
 *  it. This one only governs the Add button. They used to be the same number,
 *  which meant a cycle (generation always writes 5) had no room for anyone to
 *  add their own, on either side. The extras sit as "Not used" and are already
 *  kept out of the report. */
export const MAX_AREAS_ON_PAGE = 8

/**
 * Mirrors the server's validator (app/schemas/brief.py — `validate_areas`).
 * A save that fails this is rejected with a 422, so callers must gate on it
 * rather than fire and surface an error.
 *
 * Valid means either untouched (nothing at all, or every role "none") or a
 * COMPLETE choice: exactly one primary and 2-5 items selected. A half-made
 * choice — selected items with no primary, or two primaries — is not
 * persistable.
 *
 * Takes anything with a `role`, because concept messages carry the same rule —
 * they just allow a single selection, hence the `min` override. The defaults
 * are the areas-of-focus bounds the SERVER enforces; don't pass anything else
 * for that list or the client will send saves the server rejects.
 */
export function roleSelectionSaveable(
  items: readonly { role?: AreaRole }[],
  min: number = MIN_SELECTED_AREAS,
  max: number = MAX_SELECTED_AREAS,
): boolean {
  if (items.length === 0) return true
  const selected = items.filter((a) => roleOf(a) !== "none")
  if (selected.length === 0) return true
  const primaries = selected.filter((a) => roleOf(a) === "primary").length
  return primaries === 1 && selected.length >= min && selected.length <= max
}

/** A freshly generated area has NO `role` key at all — the generator doesn't
 *  write one, and the server's model fills the default in only once it parses.
 *  Reading it raw, `undefined !== "none"` counted every untouched area as
 *  selected, so a brand-new set looked like "5 chosen, no primary" — invalid,
 *  for entirely the wrong reason. */
function roleOf(area: { role?: AreaRole }): AreaRole {
  return area.role ?? "none"
}

/**
 * Has a COMPLETE choice actually been made: exactly one primary, and 2-5 used.
 *
 * Different question from `roleSelectionSaveable`, which also accepts an
 * untouched set — that one asks "will the server store this", and the answer
 * for a set nobody has touched is yes. This asks "has someone decided", which
 * is what the client is there to do and what kickoff refuses to start without.
 */
export function roleSelectionComplete(
  items: readonly { role?: AreaRole }[],
  min: number = MIN_SELECTED_AREAS,
  max: number = MAX_SELECTED_AREAS,
): boolean {
  const selected = items.filter((a) => roleOf(a) !== "none")
  if (selected.length === 0) return false
  const primaries = selected.filter((a) => roleOf(a) === "primary").length
  return primaries === 1 && selected.length >= min && selected.length <= max
}
