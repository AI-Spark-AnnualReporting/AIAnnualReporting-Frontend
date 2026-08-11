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
  items: readonly { role: AreaRole }[],
  min: number = MIN_SELECTED_AREAS,
  max: number = MAX_SELECTED_AREAS,
): boolean {
  if (items.length === 0) return true
  const selected = items.filter((a) => a.role !== "none")
  if (selected.length === 0) return true
  const primaries = selected.filter((a) => a.role === "primary").length
  return primaries === 1 && selected.length >= min && selected.length <= max
}
