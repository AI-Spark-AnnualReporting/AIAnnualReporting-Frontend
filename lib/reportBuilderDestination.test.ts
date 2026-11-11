/**
 * Self-check for pickReportBuilderDestination. No framework — run it with:
 *   node lib/reportBuilderDestination.test.ts
 */

import assert from "node:assert/strict"
import { pickReportBuilderDestination } from "./reportBuilderDestination.ts"

const id = "c1"

// Fresh cycle: plan screen, through the findings first.
let d = pickReportBuilderDestination(id, {})
assert.equal(d.href, "/pm/cycles/c1/plan")
assert.equal(d.needsFindingsStep, true)

// Findings consented, plan still open: plan screen, no findings step.
d = pickReportBuilderDestination(id, { findings_locked: true })
assert.equal(d.screen, "plan")
assert.equal(d.needsFindingsStep, false)

// Plan locked, findings consented: straight into the builder.
d = pickReportBuilderDestination(id, { plan_locked: true, findings_locked: true })
assert.equal(d.href, "/pm/cycles/c1/build")
assert.equal(d.label, "Continue Report Builder")
assert.equal(d.needsFindingsStep, false)

// Plan locked, findings never consented (older cycles): builder, after findings.
d = pickReportBuilderDestination(id, { plan_locked: true })
assert.equal(d.screen, "build")
assert.equal(d.needsFindingsStep, true)

// Assembled: the final screen, even with the plan still open, no findings step.
d = pickReportBuilderDestination(id, { report_assembled: true })
assert.equal(d.href, "/pm/cycles/c1/report")
assert.equal(d.label, "View Report")
assert.equal(d.needsFindingsStep, false)

// Assembled and approved.
d = pickReportBuilderDestination(id, {
  plan_locked: true, findings_locked: true, report_assembled: true, report_approved: true,
})
assert.equal(d.screen, "report")
assert.equal(d.label, "View Approved Report")

// Approved but never assembled (a sibling cycle's shared row): NOT the final screen.
d = pickReportBuilderDestination(id, { plan_locked: true, findings_locked: true, report_approved: true })
assert.equal(d.screen, "build")

console.log("reportBuilderDestination: all checks passed")
