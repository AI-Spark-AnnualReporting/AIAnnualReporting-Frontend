/**
 * Self-check for the concept-message primary rule. No framework — run it with:
 *   node lib/conceptMessages.test.ts
 *
 * It exists because two screens now read this rule: the kickoff editor, where
 * picking a primary writes BOTH a `role` tag and a move to the top, and the
 * read-only brief page, which only reads. The fallback-to-position half is what
 * keeps messages written before the `role` field shipped from showing no
 * primary at all.
 */

import assert from "node:assert/strict"
import { primaryIndexOf } from "./conceptMessages.ts"
import type { ConceptMessage } from "./api/pm.ts"

const msgs = (...roles: (ConceptMessage["role"] | undefined)[]): ConceptMessage[] =>
  roles.map((role, i) => ({ title: `title ${i}`, description: "body", role }))

// The tag wins wherever it sits — the list is stored primary-first, but a
// refine can return it in another order and the tag is the stronger signal.
assert.equal(primaryIndexOf(msgs("primary", "secondary")), 0, "tagged first")
assert.equal(primaryIndexOf(msgs("secondary", "primary")), 1, "tagged second")
assert.equal(primaryIndexOf(msgs("secondary", "secondary", "primary")), 2, "tagged last")

// No tag at all — pre-`role` messages. Position decides, and generation
// already returns them primary-area-first.
assert.equal(primaryIndexOf(msgs(undefined, undefined)), 0, "untagged falls back to position")
assert.equal(primaryIndexOf(msgs("secondary", "secondary")), 0, "all secondary falls back too")

// Empty list: -1, so `i === primaryIndexOf(list)` can never be true for a row
// that isn't there.
assert.equal(primaryIndexOf([]), -1, "empty list")

// Two primaries shouldn't happen (the editor tags the others secondary), but
// the first one wins rather than the rule throwing.
assert.equal(primaryIndexOf(msgs("primary", "primary")), 0, "first of two primaries")

console.log("primaryIndexOf: all checks passed")

// ── 3 areas x 3 concept messages ──
import {
  areasMissingPrimaryMessage,
  blankAreaMessages,
  hasBlankUsedMessage,
  isGrouped,
  messagesOfArea,
  removeAreaMessages,
  setMessageRole,
} from "./conceptMessages"

const g = (area_index: number, role: "primary" | "secondary" | "none", title = "T") =>
  ({ title, description: "copy", area_index, role })

const nine = [0, 1, 2].flatMap((a) => [g(a, "none"), g(a, "none"), g(a, "none")])
assert.ok(isGrouped(nine), "area_index marks the new shape")
assert.ok(!isGrouped(msgs("primary")), "old messages are not grouped")
assert.deepEqual(messagesOfArea(nine, 1).map((x) => x.position), [3, 4, 5], "area 2 = positions 3-5")

const picked = setMessageRole(setMessageRole(nine, 3, "primary"), 4, "primary")
assert.equal(picked[3].role, "secondary", "a new primary demotes the old one in the same area")
assert.equal(picked[4].role, "primary")
assert.equal(setMessageRole(picked, 0, "primary")[4].role, "primary", "other areas untouched")

const removed = removeAreaMessages(nine, 0)
assert.equal(removed.length, 6)
assert.deepEqual([...new Set(removed.map((m) => m.area_index))], [0, 1], "indexes close the gap")

assert.equal(blankAreaMessages(2).length, 3)
assert.ok(!hasBlankUsedMessage(blankAreaMessages(2)), "blank but unused is fine")
assert.ok(hasBlankUsedMessage([{ title: "", description: "", area_index: 0, role: "secondary" }]))

const areas = [
  { slogan: "Lead", role: "primary" },
  { slogan: "Used", role: "secondary" },
  { slogan: "Dropped", role: "none" },
]
assert.deepEqual(areasMissingPrimaryMessage(areas, setMessageRole(nine, 0, "primary")), ["Used"])

console.log("conceptMessages: grouped checks passed")
