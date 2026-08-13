/**
 * Self-check for the areas-of-focus save rule. No framework — run it with:
 *   node lib/areasOfFocus.test.ts
 *
 * It exists because this rule is a MIRROR of the server's validator
 * (app/schemas/brief.py). If the two drift apart the PM either sees 422s on a
 * legal choice, or edits get thrown away on an illegal one.
 */

import assert from "node:assert/strict"
import { roleSelectionSaveable, type AreaOfFocus, type AreaRole } from "./areasOfFocus.ts"

const areas = (...roles: AreaRole[]): AreaOfFocus[] =>
  roles.map((role, i) => ({ slogan: `slogan ${i}`, sub_slogans: [], role }))

// Untouched states are saveable — generation returns 5 areas all "none", and
// the PM must be able to save slogan edits before choosing.
assert.equal(roleSelectionSaveable([]), true, "empty list")
assert.equal(roleSelectionSaveable(areas("none", "none", "none", "none", "none")), true, "all none")

// A complete choice: exactly one primary, 2-5 selected.
assert.equal(roleSelectionSaveable(areas("primary", "secondary")), true, "min selection")
assert.equal(
  roleSelectionSaveable(areas("primary", "secondary", "secondary", "secondary", "secondary")),
  true,
  "max selection",
)
assert.equal(
  roleSelectionSaveable(areas("none", "secondary", "primary", "none")),
  true,
  "unselected areas alongside a valid choice",
)

// Half-made choices are rejected.
assert.equal(roleSelectionSaveable(areas("secondary", "secondary")), false, "no primary")
assert.equal(roleSelectionSaveable(areas("primary", "primary", "secondary")), false, "two primaries")
assert.equal(roleSelectionSaveable(areas("primary", "none", "none")), false, "only one selected")
assert.equal(
  roleSelectionSaveable(areas("primary", "secondary", "secondary", "secondary", "secondary", "secondary")),
  false,
  "six selected",
)

// Concept messages reuse the rule with min 1 — one primary on its own is a
// complete choice there, but must still be the only primary.
assert.equal(roleSelectionSaveable(areas("primary", "none"), 1), true, "min 1: lone primary")
assert.equal(roleSelectionSaveable(areas("secondary", "none"), 1), false, "min 1: still needs a primary")
assert.equal(
  roleSelectionSaveable(areas("primary", "primary"), 1),
  false,
  "min 1: still rejects two primaries",
)
// The default bounds are unchanged by the override existing.
assert.equal(roleSelectionSaveable(areas("primary", "none")), false, "default min still 2")

console.log("roleSelectionSaveable: all checks passed")
