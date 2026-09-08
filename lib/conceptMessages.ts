/**
 * Concept-message rules shared by the screen that edits them and the read-only
 * Strategic Brief page. It lived on the editing screen alone until the viewer
 * needed the identical answer to "which one is primary" — two copies of that
 * rule would disagree the moment one of them was touched.
 */

import type { ConceptMessage } from "@/lib/api/pm"

/**
 * Which message is primary. Prefers the explicit `role` tag and falls back to
 * position, so this works both before and after the backend starts returning
 * the field — no second frontend change needed when it lands.
 *
 * Returns -1 for an empty list, so a caller comparing an index never matches.
 */
export const primaryIndexOf = (list: ConceptMessage[]): number => {
  const tagged = list.findIndex((m) => m.role === "primary")
  if (tagged >= 0) return tagged
  return list.length > 0 ? 0 : -1
}
