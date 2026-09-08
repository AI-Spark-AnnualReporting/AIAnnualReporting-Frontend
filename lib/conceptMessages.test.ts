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
