/**
 * Self-check for turning validation findings into Build-page fixes. Run with:
 *   npx tsx lib/validation-fixes.test.ts
 *
 * The Build page's banner and rail counts come from findingsBySection, so a
 * finding filed under the wrong section sends the PM to fix the wrong text.
 */

import assert from "node:assert/strict"

import type { ReportValidation } from "@/lib/api/pm"
import {
  bannedWordsInstruction,
  buildFixHref,
  findingsBySection,
  highlightRegex,
  highlightsBySection,
  isFixedFinding,
  redundancyInstruction,
} from "./validation-fixes"

const validation = {
  figures_total: 10,
  figures_traced: 9,
  untraced: [{ section_code: "ops", title: "Operations", value: "94" }],
  instruction_text: [{ section_code: "env", title: "Environment", line: "Please insert the figure.", marker: "please insert" }],
  voice: [
    { section_code: "chair", title: "Chairman", phrase: "leverage" },
    { section_code: "audit", title: "Auditor", phrase: "robust" },
  ],
  preferred_words: {},
  conflicts: [{
    measure: "employees",
    detail: "2,380 vs 2,215",
    sections: [
      { section_code: "people", title: "People", value: "2380" },
      { section_code: "executive_summary", title: "Executive Summary", value: "2215" },
    ],
  }],
  redundancy: [{ sections: ["ceo", "strategy"], detail: "Both describe the hub." }],
  brief_gaps: [{ ask: "Explain the roadmap", detail: "" }],
  emphasis: null,
  coverage: {
    sections_checked: 6,
    excluded: [{ section_code: "audit", title: "Auditor", purpose: "", concept: false, tone: false }],
    primary: null,
    secondary: [],
    secondary_any: { sections: 0, percent: 0 },
    tone: null,
  },
  sections_unchecked: [],
  sections: {},
  validated_at: "2026-10-13T00:00:00Z",
} as ReportValidation

const found = findingsBySection(validation)

// Each finding lands in its own section.
assert.equal(found.ops.length, 1)
assert.equal(found.env.length, 1)
assert.equal(found.chair.length, 1)
assert.equal(found.people.length, 1)
assert.equal(found.executive_summary.length, 1)
assert.equal(found.ceo.length, 1)
assert.equal(found.strategy.length, 1)

// A disagreeing figure names where the other number is.
assert.equal(found.people[0], "Figure that disagrees: employees, 2380 here vs 2215 in Executive Summary")
// A section that disagrees with itself gets one line saying so.
const selfConflict = findingsBySection({
  ...validation,
  conflicts: [{
    measure: "saudi value share",
    detail: "",
    sections: [
      { section_code: "ops", title: "Operations", value: "50" },
      { section_code: "ops", title: "Operations", value: "56" },
    ],
  }],
} as ReportValidation)
assert.equal(
  selfConflict.ops.filter((line) => line.includes("saudi")).join("|"),
  "Figure that disagrees within this section: saudi value share, 50 vs 56",
)

// A repetition names the other section it is shared with.
assert.ok(found.ceo[0].includes("also made in strategy"))

// A banned word in a section the house style doesn't govern is not a finding there.
assert.equal(found.audit, undefined)

// A brief gap belongs to no section.
assert.equal(Object.values(found).flat().some((line) => line.includes("roadmap")), false)

// The link carries the section, and the instruction only when given.
assert.equal(buildFixHref("c1", "ops"), "/pm/cycles/c1/build?section=ops&from=validation")
const href = buildFixHref("c1", "chair", bannedWordsInstruction(["leverage"]))
const params = new URLSearchParams(href.split("?")[1])
assert.equal(params.get("section"), "chair")
assert.ok(params.get("fix")?.includes('"leverage"'))

// A by-hand to-do travels as `todo`, never as `fix`, so it stays out of the refine box.
const todo = new URLSearchParams(buildFixHref("c1", "ops", "Add X by hand", true).split("?")[1])
assert.equal(todo.get("todo"), "Add X by hand")
assert.equal(todo.get("fix"), null)

// Highlights: what the Build preview marks in each section.
const marks = highlightsBySection(validation)
const matchesIn = (code: string, text: string) =>
  [...text.matchAll(highlightRegex(marks[code])!)].map((m) => m[0])

// A banned word, whole words only and any case.
assert.deepEqual(matchesIn("chair", "We Leverage scale; deleverage is fine."), ["Leverage"])
// A placeholder line, shown without its list marker.
assert.deepEqual(matchesIn("env", "Please insert the figure."), ["Please insert the figure."])
// A figure as written, never inside a longer number.
assert.deepEqual(matchesIn("people", "Staff: 2,380 (2380 FTE), not 12,380."), ["2,380", "2380"])
assert.deepEqual(matchesIn("ops", "Utilisation 94% vs 194 sites."), ["94"])
// A section with nothing to mark gets no pattern; repetition marks nothing.
assert.equal(highlightRegex(marks["nothing"]), null)
assert.equal(marks.ceo, undefined)

// The finding a Fix came from is spotted in the banner list, so it isn't shown twice.
const banned = bannedWordsInstruction(["in summary"])
assert.equal(isFixedFinding('Word the house style rules out: "in summary"', banned), true)
assert.equal(isFixedFinding('Word the house style rules out: "led to"', banned), false)
const repeat = redundancyInstruction(["CEO's Message"], "Both cover strategy.")
assert.equal(isFixedFinding("Repeats a point also made in CEO's Message: Both cover strategy.", repeat), true)
// A bare figure is too short to match safely.
assert.equal(isFixedFinding("Figure with no recorded source: 94", "Utilisation 94%"), false)

console.log("validation-fixes: all checks passed")
