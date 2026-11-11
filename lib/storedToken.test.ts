/**
 * Self-check for the "only throw away the token you checked" rule. No framework — run it with:
 *   node lib/storedToken.test.ts
 *
 * Uses a fake localStorage, so it needs no browser.
 */

import assert from "node:assert/strict"
import { getStoredToken, isStillStoredToken, tokenFromAuthHeader } from "./storedToken.ts"

/** Install a simple in-memory localStorage on globalThis. */
function installFakeStorage(): Map<string, string> {
  const store = new Map<string, string>()
  ;(globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  } as Storage
  return store
}

/** Install a localStorage whose every call throws (private mode / disabled). */
function installBrokenStorage(): void {
  const fail = () => {
    throw new Error("storage disabled")
  }
  ;(globalThis as unknown as { localStorage: unknown }).localStorage = {
    getItem: fail,
    setItem: fail,
    removeItem: fail,
  }
}

// Same token still saved → the check's result applies (today's behaviour).
let store = installFakeStorage()
store.set("access_token", "OLD")
assert.equal(isStillStoredToken("OLD"), true)

// A newer sign-in saved another token → the old check must not touch the session.
store.set("access_token", "NEW")
assert.equal(isStillStoredToken("OLD"), false)

// Request sent with no token while a new one is saved → stale, leave it alone.
assert.equal(isStillStoredToken(null), false)

// Nothing sent and nothing saved → a real sign-out, the clean-up still runs.
store = installFakeStorage()
assert.equal(isStillStoredToken(null), true)
assert.equal(getStoredToken(), null)

// Storage that throws → no crash.
installBrokenStorage()
assert.equal(getStoredToken(), null)
assert.equal(isStillStoredToken(null), true)

// Reading the token back out of a request header.
assert.equal(tokenFromAuthHeader("Bearer abc.def"), "abc.def")
assert.equal(tokenFromAuthHeader(undefined), null)
assert.equal(tokenFromAuthHeader("Basic xyz"), null)
assert.equal(tokenFromAuthHeader(42), null)

console.log("storedToken: all checks passed")
