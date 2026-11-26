/**
 * Self-check for copyTextToClipboard. No framework — run it with:
 *   node lib/copyText.test.ts
 *
 * Node has no browser, so this fakes the few bits of `navigator` and
 * `document` the helper touches: the clipboard API and execCommand('copy').
 */

import assert from "node:assert/strict"
import { copyTextToClipboard } from "./copyText.ts"

type FakeTextarea = { value: string; style: Record<string, string>; [key: string]: unknown }

let execCommandResult = true
let execCommandCalls = 0
let lastCopiedValue = ""
let attachedTextareas = 0
let focusedElement: unknown = null

/** A fake textarea: just enough for the hidden-textarea fallback. */
function makeFakeTextarea(): FakeTextarea {
  const textarea: FakeTextarea = {
    value: "",
    style: {},
    setAttribute: () => {},
    focus: () => { focusedElement = textarea },
    select: () => {},
    setSelectionRange: () => {},
  }
  return textarea
}

/** A fake button that can hold focus, to check focus goes back to it. */
const fakeButton = {
  closest: () => null,
  focus: () => { focusedElement = fakeButton },
}

const fakeDocument = {
  get activeElement() { return focusedElement },
  body: {
    appendChild: () => { attachedTextareas += 1 },
    removeChild: () => { attachedTextareas -= 1 },
  },
  createElement: () => makeFakeTextarea(),
  execCommand: () => {
    execCommandCalls += 1
    lastCopiedValue = (focusedElement as FakeTextarea).value
    return execCommandResult
  },
}

/** Set the fake clipboard API (or undefined for "plain http, no API"). */
function setClipboard(value: unknown): void {
  Object.defineProperty(globalThis, "navigator", { value: { clipboard: value }, configurable: true })
}

Object.defineProperty(globalThis, "document", { value: fakeDocument, configurable: true })

/** Clear the counters between checks. */
function reset(): void {
  execCommandResult = true
  execCommandCalls = 0
  lastCopiedValue = ""
  attachedTextareas = 0
  focusedElement = fakeButton
}

// 1. Clipboard API works -> used, no fallback.
reset()
let written = ""
setClipboard({ writeText: async (text: string) => { written = text } })
assert.equal(await copyTextToClipboard("link-123"), true)
assert.equal(written, "link-123")
assert.equal(execCommandCalls, 0)

// 2. No clipboard API (plain http) -> hidden textarea fallback copies it.
reset()
setClipboard(undefined)
assert.equal(await copyTextToClipboard("link-123"), true)
assert.equal(lastCopiedValue, "link-123")
assert.equal(attachedTextareas, 0, "the hidden textarea is removed again")
assert.equal(focusedElement, fakeButton, "focus goes back to the button")

// 3. Clipboard API refuses -> fallback.
reset()
setClipboard({ writeText: async () => { throw new Error("denied") } })
assert.equal(await copyTextToClipboard("link-123"), true)
assert.equal(execCommandCalls, 1)

// 4. Both fail -> false.
reset()
setClipboard(undefined)
execCommandResult = false
assert.equal(await copyTextToClipboard("link-123"), false)

// 5. Empty text -> false, nothing tried.
reset()
setClipboard(undefined)
assert.equal(await copyTextToClipboard(""), false)
assert.equal(execCommandCalls, 0)

console.log("copyText: all checks passed")
