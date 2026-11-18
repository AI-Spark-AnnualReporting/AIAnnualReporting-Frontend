/**
 * Self-check for the "AI features are unavailable" toast trigger. No framework — run it with:
 *   node lib/aiCreditsToast.test.ts
 *
 * sonner's toast() works outside React (it only queues), so this calls the real one and
 * watches the module's own "last shown" bookkeeping through repeated calls.
 */

import assert from "node:assert/strict"
import { toast } from "sonner"
import {
  checkAiCreditsHeader,
  isAiCreditsRefusal,
  resetAiCreditsToastForTests,
  showAiCreditsRefusal,
} from "./aiCreditsToast.ts"

let shown = 0
const realError = toast.error
;(toast as unknown as { error: (...a: unknown[]) => unknown }).error = (...args: unknown[]) => {
  shown += 1
  return realError(...(args as Parameters<typeof realError>))
}

// fetch Headers
resetAiCreditsToastForTests()
checkAiCreditsHeader(new Headers({ "X-AI-Credits": "exhausted" }))
assert.equal(shown, 1, "fetch Headers with the flag shows the toast")

// many failing calls → still one toast
checkAiCreditsHeader(new Headers({ "X-AI-Credits": "exhausted" }))
checkAiCreditsHeader({ "x-ai-credits": "exhausted" })
assert.equal(shown, 1, "repeat calls within 5 minutes are de-duplicated")

// axios gives a plain object (or AxiosHeaders) with lower-cased names
resetAiCreditsToastForTests()
checkAiCreditsHeader({ "x-ai-credits": "exhausted" })
assert.equal(shown, 2, "axios-style headers object shows the toast")

// normal responses and missing headers stay quiet and never throw
resetAiCreditsToastForTests()
checkAiCreditsHeader(new Headers({ "content-type": "application/json" }))
checkAiCreditsHeader(undefined)
checkAiCreditsHeader(null)
assert.equal(shown, 2, "no flag, no toast")

// The company's own AI credits: Centriyon's 403 messages are recognised...
const notEnough = "Not enough AI credits (balance -95). Ask your admin to buy more."
const minimum = "Custom template needs at least 60 AI credits to start; you have 45. Ask your admin to buy more."
const noPlan = "No active subscription, so AI features are off. Ask your admin."
assert.ok(isAiCreditsRefusal(403, notEnough), "balance at or below zero")
assert.ok(isAiCreditsRefusal(403, minimum), "under the action's minimum")
assert.ok(isAiCreditsRefusal(403, noPlan), "no subscription")
// ...and nothing else is
assert.ok(!isAiCreditsRefusal(403, "Only project managers can do this"), "other 403s")
assert.ok(!isAiCreditsRefusal(500, notEnough), "not a 403")
assert.ok(!isAiCreditsRefusal(403, undefined), "no message")

// showing it: a toast with Centriyon's own words
const before = shown
showAiCreditsRefusal(403, notEnough)
assert.equal(shown, before + 1, "credits refusal shows a toast")
showAiCreditsRefusal(404, "Cycle not found")
assert.equal(shown, before + 1, "other errors show no credits toast")

console.log("aiCreditsToast: all checks passed")
