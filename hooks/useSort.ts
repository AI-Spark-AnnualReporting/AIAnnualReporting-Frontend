import { useCallback, useState } from "react"
import {
  SortField,
  SortState,
  defaultDirectionFor,
  sortItems,
} from "@/lib/sort"

/**
 * Owns the sort state + the one interaction rule shared by every list page:
 * clicking the ACTIVE field flips direction; clicking a DIFFERENT field
 * switches to it and adopts that field's default direction.
 */
export function useSort<T>(fields: SortField<T>[], initial?: SortState) {
  const [state, setState] = useState<SortState>(
    initial ?? { key: fields[0].key, direction: fields[0].defaultDirection },
  )

  const onSelect = useCallback(
    (key: string) => {
      setState((prev) =>
        prev.key === key
          ? { key, direction: prev.direction === "asc" ? "desc" : "asc" }
          : { key, direction: defaultDirectionFor(fields, key) },
      )
    },
    [fields],
  )

  const sort = useCallback(
    (items: T[]) => sortItems(items, fields, state),
    [fields, state],
  )

  return { state, onSelect, sort }
}
