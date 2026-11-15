/**
 * Self-check for refresh tokens in SAR (lib/api/session). No framework — run it with:
 *   node lib/api/session.test.ts
 *
 * Fake localStorage and fetch, so it needs no browser and no server.
 * Plan: Centriton/.claude/plans/refresh-token.md
 */

import assert from "node:assert/strict"
import {
  clearSession,
  fetchWithRefresh,
  getStoredRefreshToken,
  refreshSession,
  revokeRefreshToken,
  saveSession,
  startSessionFromHandoff,
} from "./session.ts"

const store = new Map<string, string>()
;(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => void store.set(key, value),
  removeItem: (key: string) => void store.delete(key),
  clear: () => store.clear(),
  key: () => null,
  length: 0,
} as Storage

type Call = { url: string; init: RequestInit }
let calls: Call[] = []
let answer: (call: Call) => Response | Promise<Response> = () => json(500, {})

globalThis.fetch = (async (url: string, init: RequestInit = {}) => {
  const call = { url: String(url), init }
  calls.push(call)
  return answer(call)
}) as typeof fetch

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
}

function bearerOf(call: Call): string | null {
  return new Headers(call.init.headers).get("Authorization")
}

const isRefresh = (call: Call) => call.url.endsWith("/auth/refresh")

function reset(): void {
  store.clear()
  calls = []
}

// ── The hand-off token is swapped at once for this app's own pair.
reset()
answer = () => json(200, { access_token: "A1", refresh_token: "R1" })
assert.equal(await startSessionFromHandoff("HANDOFF"), true)
assert.deepEqual(JSON.parse(String(calls[0].init.body)), { refresh_token: "HANDOFF" })
assert.equal(store.get("access_token"), "A1")
assert.equal(getStoredRefreshToken(), "R1")

// ── A used or expired hand-off token is refused → no session.
reset()
answer = () => json(401, { detail: "Invalid refresh token" })
assert.equal(await startSessionFromHandoff("USED"), false)
assert.equal(store.get("access_token"), undefined)

// ── Saving a session clears the retired SAR `refresh_token` key.
reset()
store.set("refresh_token", "OLD-SAR-FORMAT")
saveSession("A1", "R1")
assert.equal(store.get("refresh_token"), undefined)
clearSession()
assert.equal(store.size, 0)

// ── 401 → refresh → the request is sent again with the new token.
reset()
saveSession("A-old", "R1")
answer = (call) => {
  if (isRefresh(call)) return json(200, { access_token: "A-new", refresh_token: "R2" })
  return bearerOf(call) === "Bearer A-new" ? json(200, {}) : json(401, {})
}
let res = await fetchWithRefresh("http://sar.test/stream", { headers: { Authorization: "Bearer A-old" } })
assert.equal(res.status, 200)
assert.equal(store.get("access_token"), "A-new")
assert.equal(getStoredRefreshToken(), "R2")

// ── Three 401s at once share ONE refresh (each refresh kills the last token).
reset()
saveSession("A-old", "R1")
const outcomes = await Promise.all([refreshSession("A-old"), refreshSession("A-old"), refreshSession("A-old")])
assert.deepEqual(outcomes, ["ok", "ok", "ok"])
assert.equal(calls.filter(isRefresh).length, 1)

// ── Another tab already renewed → no second refresh.
reset()
saveSession("A-from-other-tab", "R9")
assert.equal(await refreshSession("A-old"), "ok")
assert.equal(calls.length, 0)

// ── Refused refresh token → "expired": the caller signs out (401 returned as is).
reset()
saveSession("A-old", "R-dead")
answer = () => json(401, {})
res = await fetchWithRefresh("http://sar.test/x", { headers: { Authorization: "Bearer A-old" } })
assert.equal(res.status, 401)
assert.equal(await refreshSession("A-old"), "expired")

// ── Centriyon unreachable → "unavailable": the session is kept, nobody signs out.
reset()
saveSession("A-old", "R1")
answer = (call) => {
  if (isRefresh(call)) throw new TypeError("Failed to fetch")
  return json(401, {})
}
await assert.rejects(
  fetchWithRefresh("http://sar.test/x", { headers: { Authorization: "Bearer A-old" } }),
  /renew your session/,
)
assert.equal(store.get("access_token"), "A-old")
assert.equal(getStoredRefreshToken(), "R1")

// ── No refresh token at all → "expired", without calling Centriyon.
reset()
store.set("access_token", "A-old")
assert.equal(await refreshSession("A-old"), "expired")
assert.equal(calls.length, 0)

// ── Logout ends the session at Centriyon.
reset()
saveSession("A1", "R1")
answer = () => json(200, { logged_out: true })
revokeRefreshToken()
assert.ok(calls[0].url.endsWith("/auth/logout"))
assert.deepEqual(JSON.parse(String(calls[0].init.body)), { refresh_token: "R1" })

console.log("session.test.ts: all checks passed")
