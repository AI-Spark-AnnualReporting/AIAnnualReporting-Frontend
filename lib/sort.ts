// Framework-free sorting primitives shared by the cycle/session list pages.
// Kept pure (no React) so the comparator is trivially testable and reusable —
// mirrors the lib/section-filters.ts convention.

export type SortDirection = "asc" | "desc"

export interface SortField<T> {
  /** Stable id used in UI + state. */
  key: string
  /** Human label shown on the sort rail. */
  label: string
  /** Direction applied when this field is first selected. */
  defaultDirection: SortDirection
  /** Pull the comparable primitive off a row. */
  accessor: (item: T) => number | string | null | undefined
  /** How to interpret the accessor's value when comparing. */
  type: "date" | "number" | "string"
}

export interface SortState {
  key: string
  direction: SortDirection
}

// Normalise a raw value into something comparable, or `null` when it's missing
// (undefined / empty / unparseable). Missing values are sorted last regardless
// of direction, so a card with no deadline never jumps to the top.
function toComparable(
  value: number | string | null | undefined,
  type: SortField<unknown>["type"],
): number | string | null {
  if (value === null || value === undefined || value === "") return null
  if (type === "date") {
    const t = Date.parse(String(value))
    return Number.isNaN(t) ? null : t
  }
  if (type === "number") {
    const n = Number(value)
    return Number.isNaN(n) ? null : n
  }
  return String(value)
}

/** Non-mutating sort — always returns a new array, leaving react-query data intact. */
export function sortItems<T>(items: T[], fields: SortField<T>[], state: SortState): T[] {
  const field = fields.find((f) => f.key === state.key)
  if (!field) return items
  const dir = state.direction === "asc" ? 1 : -1

  return [...items].sort((a, b) => {
    const av = toComparable(field.accessor(a), field.type)
    const bv = toComparable(field.accessor(b), field.type)

    // Missing always sinks to the bottom, in both directions.
    if (av === null && bv === null) return 0
    if (av === null) return 1
    if (bv === null) return -1

    if (typeof av === "string" && typeof bv === "string") {
      return av.localeCompare(bv) * dir
    }
    return ((av as number) - (bv as number)) * dir
  })
}

export function defaultDirectionFor<T>(fields: SortField<T>[], key: string): SortDirection {
  return fields.find((f) => f.key === key)?.defaultDirection ?? "desc"
}
