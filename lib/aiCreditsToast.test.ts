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
  resetAiCreditsToastForTests,
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

console.log("aiCreditsToast: all checks passed")
