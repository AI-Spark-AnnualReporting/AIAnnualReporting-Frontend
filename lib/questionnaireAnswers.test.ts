/**
 * Self-check for the questionnaire answer round-trip. No framework — run it with:
 *   node lib/questionnaireAnswers.test.ts
 *
 * It exists because this is parsing that fails SILENTLY. The wire format joins
 * every chip and every typed answer into one comma-separated string, so reading
 * it back is guesswork. Get it wrong and the PM reviewing a client's submission
 * sees a form of unselected chips with the answer nowhere on screen — no error,
 * no warning, just a page that looks like the client never replied.
 */

import assert from "node:assert/strict"
import {
  buildAnswersPayload,
  splitAnswer,
  valueFromAnswers,
  type QuestionnaireValue,
} from "./questionnaireAnswers.ts"

type Q = { id: string; text: string; source: string; options?: string[] | null }

const AUDIENCE = [
  "Investors and shareholders",
  "Industry analysts",
  "Customers and clients",
]

// ── splitAnswer ────────────────────────────────────────────────────────────

{
  const a = splitAnswer("Investors and shareholders", AUDIENCE)
  assert.deepEqual(a.selected, ["Investors and shareholders"])
  assert.deepEqual(a.custom, [])
}

{
  // The case from the screenshot: two chips, joined. Both must light up.
  const a = splitAnswer("Investors and shareholders, Customers and clients", AUDIENCE)
  assert.deepEqual(a.selected, ["Investors and shareholders", "Customers and clients"])
  assert.deepEqual(a.custom, [])
}

{
  // Typed-in answers are pills, never `text` — the read-only view doesn't
  // render `text` for a chip question, so anything left there is invisible.
  const a = splitAnswer("Industry analysts, Sovereign wealth funds", AUDIENCE)
  assert.deepEqual(a.selected, ["Industry analysts"])
  assert.deepEqual(a.custom, ["Sovereign wealth funds"])
  assert.equal(a.text, "")
}

{
  // An option containing a comma must survive. Splitting on ", " first would
  // shred this into two pieces that match nothing.
  const opts = ["Investors, analysts and lenders", "Employees"]
  const a = splitAnswer("Investors, analysts and lenders, Employees", opts)
  assert.deepEqual(a.selected, ["Investors, analysts and lenders", "Employees"])
  assert.deepEqual(a.custom, [])
}

{
  // One option being a prefix of another must not let the short one win.
  const opts = ["Growth", "Growth in new markets"]
  const a = splitAnswer("Growth in new markets", opts)
  assert.deepEqual(a.selected, ["Growth in new markets"])
}

{
  assert.deepEqual(splitAnswer("", AUDIENCE), { selected: [], custom: [], text: "" })
}

// ── round trip ─────────────────────────────────────────────────────────────

{
  const questions: Q[] = [
    { id: "t1", text: "Audience?", source: "template", options: AUDIENCE },
    { id: "t7", text: "Anything else?", source: "template", options: null },
  ]
  const before: QuestionnaireValue = {
    answers: {
      0: { selected: ["Industry analysts"], custom: ["Regulators"], text: "" },
      1: { selected: [], custom: [], text: "Keep it short." },
    },
    rejected: {},
  }

  const wire = buildAnswersPayload(questions as never, before)
  assert.deepEqual(wire, [
    { question_id: "t1", answer: "Industry analysts, Regulators" },
    { question_id: "t7", answer: "Keep it short." },
  ])

  const after = valueFromAnswers(questions as never, wire)
  assert.deepEqual(after.answers[0].selected, ["Industry analysts"])
  assert.deepEqual(after.answers[0].custom, ["Regulators"])
  assert.equal(after.answers[1].text, "Keep it short.")
  assert.deepEqual(after.rejected, {}, "nothing was skipped")
}

// ── skipped questions ──────────────────────────────────────────────────────

{
  // A question the client rejected is simply absent from the payload. Reading
  // it back as "rejected" is what makes the skip visible to the PM instead of
  // looking like an ordinary blank.
  const questions: Q[] = [
    { id: "t1", text: "Audience?", source: "template", options: AUDIENCE },
    { id: "t2", text: "Skipped one", source: "template", options: AUDIENCE },
    { id: "t3", text: "Also skipped", source: "template", options: null },
  ]
  const v = valueFromAnswers(questions as never, [
    { question_id: "t1", answer: "Industry analysts" },
  ])
  assert.equal(v.rejected[1], true)
  assert.equal(v.rejected[2], true)
  assert.equal(v.rejected[0], undefined)

  // And a skipped question must not be re-sent on the way back out.
  const wire = buildAnswersPayload(questions as never, v)
  assert.deepEqual(wire, [{ question_id: "t1", answer: "Industry analysts" }])
}

console.log("questionnaireAnswers: all checks passed")
