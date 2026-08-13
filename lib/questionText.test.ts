/**
 * Self-check for the question topic split. No framework — run it with:
 *   node lib/questionText.test.ts
 */

import assert from "node:assert/strict"
import { joinQuestion, splitQuestion } from "./questionText.ts"

assert.deepEqual(
  splitQuestion("Workforce Demographics — What is the breakdown of employees?"),
  { topic: "Workforce Demographics", question: "What is the breakdown of employees?" },
)

// En dash too — the generator isn't consistent about which it uses.
assert.deepEqual(splitQuestion("Training – How many joined?"), {
  topic: "Training",
  question: "How many joined?",
})

// A spaced hyphen splits too — that's what people actually type.
assert.deepEqual(splitQuestion("Training - How many joined?"), {
  topic: "Training",
  question: "How many joined?",
})

// …but a hyphen inside the topic doesn't.
assert.deepEqual(splitQuestion("Non-financial risks — Which are material?"), {
  topic: "Non-financial risks",
  question: "Which are material?",
})

// No prefix → text stays whole.
assert.deepEqual(splitQuestion("What is the headcount?"), {
  topic: null,
  question: "What is the headcount?",
})

// A dash deep inside a sentence isn't a topic prefix.
const long = "How has the diversity and inclusion strategy evolved over the years — and why?"
assert.equal(splitQuestion(long).topic, null)

// Dangling dash with nothing after it isn't a split either.
assert.equal(splitQuestion("Workforce Demographics —").topic, null)

// join → split is a round trip; an empty topic leaves the question bare.
const joined = joinQuestion(" Governance ", " Who signs off? ")
assert.equal(joined, "Governance — Who signs off?")
assert.deepEqual(splitQuestion(joined), { topic: "Governance", question: "Who signs off?" })
assert.equal(joinQuestion("", "Who signs off?"), "Who signs off?")

console.log("questionText: ok")
