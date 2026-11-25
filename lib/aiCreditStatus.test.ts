/**
 * Self-check for stepBlockReason. No framework — run it with:
 *   node lib/aiCreditStatus.test.ts
 */

import assert from "node:assert/strict"
import { anyStepBlocked, stepBlockReason, type AiCreditStatus } from "./aiCreditStatus.ts"

const status: AiCreditStatus = {
  applies: true,
  balance: null,
  actions: {
    "annual.design.custom_template": { minimum: 60, allowed: false, reason: "Needs 60 AI credits; you have 50." },
    "annual.chat": { minimum: 1, allowed: true, reason: null },
    "annual.translate": { minimum: 20, allowed: false, reason: null },
  },
}

assert.equal(stepBlockReason(status, "annual.design.custom_template"), "Needs 60 AI credits; you have 50.")
assert.equal(stepBlockReason(status, "annual.chat"), null, "allowed step is not blocked")
assert.equal(stepBlockReason(status, "annual.translate"),
  "Not enough AI credits for this step. Ask your admin to buy more.", "a missing reason gets the plain one")
assert.equal(stepBlockReason(status, "annual.brief"), null, "a step Centriyon didn't list is not blocked")
assert.equal(stepBlockReason({ ...status, applies: false }, "annual.design.custom_template"), null,
  "Spark staff / on-premises are never blocked")
assert.equal(stepBlockReason(null, "annual.design.custom_template"), null, "unknown status never blocks")

// The banner: shown when any step is blocked, never on unknown status or for Spark staff / on-prem.
assert.equal(anyStepBlocked(status), true, "a blocked step shows the banner")
assert.equal(anyStepBlocked({ ...status, actions: { "annual.chat": { minimum: 1, allowed: true, reason: null } } }), false,
  "nothing blocked: no banner")
assert.equal(anyStepBlocked({ ...status, applies: false }), false, "Spark staff / on-premises: no banner")
assert.equal(anyStepBlocked(null), false, "unknown status: no banner")

console.log("aiCreditStatus: all checks passed")
