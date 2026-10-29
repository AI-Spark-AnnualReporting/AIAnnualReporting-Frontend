/**
 * Self-check for the "you changed this since they sent it" warning. Run with:
 *   npx tsx lib/shareDrift.test.ts
 *
 * It exists because a false negative here is silent and irreversible: Spark
 * approves on the client's behalf, the client's own link keeps showing the
 * version THEY sent, and nothing anywhere records that the two differ.
 */

import assert from "node:assert/strict"
import { driftSinceResponse } from "./shareDrift"

const sent = {
  strategic_brief: "The brief as they sent it.",
  areas_of_focus: [
    { slogan: "Transforming Tomorrow", role: "primary" as const },
    { slogan: "Global Presence", role: "secondary" as const },
  ],
  concept_messages: [
    { title: "Driving Innovation", description: "Para one." },
    { title: "Transforming Horizons", description: "Para two." },
  ],
}

// Nothing touched.
assert.deepEqual(driftSinceResponse(sent as never, sent as never), [])

// Whitespace is not an edit anyone made on purpose.
assert.deepEqual(
  driftSinceResponse(sent as never, {
    ...sent,
    strategic_brief: "  The brief as they sent it.  ",
  } as never),
  [],
)

// A role change is the CLIENT's own mark, not a Spark edit — never flagged.
assert.deepEqual(
  driftSinceResponse(sent as never, {
    ...sent,
    areas_of_focus: [
      { slogan: "Transforming Tomorrow", role: "secondary" },
      { slogan: "Global Presence", role: "primary" },
    ],
  } as never),
  [],
)

// The case this was built for: a card refine moved both halves.
const afterRefine = driftSinceResponse(sent as never, {
  ...sent,
  areas_of_focus: [
    { slogan: "Safety First", role: "primary" },
    { slogan: "Global Presence", role: "secondary" },
  ],
  concept_messages: [
    { title: "Ensuring Safety", description: "Rewritten." },
    { title: "Transforming Horizons", description: "Para two." },
  ],
} as never)
assert.equal(afterRefine.length, 2)
assert.ok(afterRefine[0].startsWith("Area 1"))
assert.ok(afterRefine[1].startsWith("Concept message 1"))

// A body-only edit counts: the title looking unchanged is exactly the case a
// reader would miss on their own.
const bodyOnly = driftSinceResponse(sent as never, {
  ...sent,
  concept_messages: [
    { title: "Driving Innovation", description: "Completely different text." },
    { title: "Transforming Horizons", description: "Para two." },
  ],
} as never)
assert.equal(bodyOnly.length, 1)
assert.ok(bodyOnly[0].startsWith("Concept message 1"))

// The brief alone.
assert.deepEqual(
  driftSinceResponse(sent as never, {
    ...sent,
    strategic_brief: "Reworded by hand.",
  } as never),
  ["The strategic brief"],
)

// Nothing to compare against yet — no warning, not a crash.
assert.deepEqual(driftSinceResponse(undefined, sent as never), [])
assert.deepEqual(driftSinceResponse(sent as never, undefined), [])

console.log("shareDrift: all checks passed")
