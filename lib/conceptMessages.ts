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

/* ────────────────────────────────────────────────────────────────────────────
   3 areas x 3 concept messages (new cycles).

   Each message carries `area_index` and its role is chosen WITHIN its area:
   one primary per used area, the others secondary or "none". Old cycles have no
   area_index anywhere and keep the one-message-per-area position link — every
   caller checks isGrouped first. Mirrors app/utils/concept_groups.py.
──────────────────────────────────────────────────────────────────────────── */

export const MESSAGES_PER_AREA = 3

/** True when the messages use the 3-per-area shape. */
export const isGrouped = (list: ConceptMessage[]): boolean =>
  list.some((m) => typeof m.area_index === "number")

/** One area's messages, each with its position in the full list. */
export function messagesOfArea(
  list: ConceptMessage[],
  areaIndex: number,
): { message: ConceptMessage; position: number }[] {
  const out: { message: ConceptMessage; position: number }[] = []
  list.forEach((message, position) => {
    if (message.area_index === areaIndex) out.push({ message, position })
  })
  return out
}

/** Set one message's role. Picking a new primary turns the area's old primary
 *  into secondary, so an area never has two. */
export function setMessageRole(
  list: ConceptMessage[],
  position: number,
  role: "primary" | "secondary" | "none",
): ConceptMessage[] {
  const areaIndex = list[position]?.area_index
  return list.map((m, k) => {
    if (k === position) return { ...m, role }
    if (role === "primary" && m.area_index === areaIndex && m.role === "primary") {
      return { ...m, role: "secondary" }
    }
    return m
  })
}

/** Drop a removed area's messages and close the gap in area_index. */
export function removeAreaMessages(list: ConceptMessage[], areaIndex: number): ConceptMessage[] {
  return list
    .filter((m) => m.area_index !== areaIndex)
    .map((m) =>
      typeof m.area_index === "number" && m.area_index > areaIndex
        ? { ...m, area_index: m.area_index - 1 }
        : m,
    )
}

/** Three blank, unused messages for a newly added area. */
export function blankAreaMessages(areaIndex: number): ConceptMessage[] {
  return Array.from({ length: MESSAGES_PER_AREA }, () => ({
    title: "",
    description: "",
    area_index: areaIndex,
    role: "none" as const,
  }))
}

/** Slogans of USED areas that still have no primary message. */
export function areasMissingPrimaryMessage(
  areas: { slogan: string; role?: string }[],
  list: ConceptMessage[],
): string[] {
  const missing: string[] = []
  areas.forEach((area, index) => {
    if ((area.role ?? "none") === "none") return
    const hasPrimary = list.some((m) => m.area_index === index && m.role === "primary")
    if (!hasPrimary) missing.push(area.slogan || `Area ${index + 1}`)
  })
  return missing
}

/** A used message with no title or text. Unused ("none") ones may stay blank. */
export const hasBlankUsedMessage = (list: ConceptMessage[]): boolean =>
  list.some(
    (m) =>
      (m.role ?? "secondary") !== "none" &&
      (!m.title?.trim() || !m.description?.trim()),
  )
