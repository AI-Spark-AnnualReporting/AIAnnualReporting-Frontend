/**
 * Self-check for the render cache. No framework — run it with:
 *   node lib/design2Cache.test.ts
 *
 * The cache deliberately outlives the components that fill it, so the only
 * things standing between it and a leak are the LRU cap and the two explicit
 * revokes. Those are what this pins.
 */

import assert from "node:assert/strict"
import {
  __setObjectUrlImpl, cacheKey, getOrRender, peek, revokeAll, revokeSection, size,
} from "./design2Cache.ts"

let made = 0
const revoked: string[] = []
__setObjectUrlImpl(() => `blob:${++made}`, (u) => { revoked.push(u) })

const blob = () => Promise.resolve({} as Blob)

async function main() {
  revokeAll()
  revoked.length = 0

  // Keys are per section, page AND template.
  assert.equal(cacheKey("c", "ceo_review", 2, "kpi_stat_grid"), "c|ceo_review|2|kpi_stat_grid")
  assert.notEqual(cacheKey("c", "s", 1, "a"), cacheKey("c", "s", 2, "a"))

  // A hit costs no second render.
  let renders = 0
  const k = cacheKey("c", "s", 1, "t")
  const first = await getOrRender(k, async () => { renders += 1; return blob() })
  const second = await getOrRender(k, async () => { renders += 1; return blob() })
  assert.equal(renders, 1)
  assert.equal(first, second)
  assert.equal(peek(k), first)

  // Two simultaneous callers share one request — a double-click must not
  // launch two browsers.
  revokeAll()
  renders = 0
  const k2 = cacheKey("c", "s", 2, "t")
  const both = await Promise.all([
    getOrRender(k2, async () => { renders += 1; return blob() }),
    getOrRender(k2, async () => { renders += 1; return blob() }),
  ])
  assert.equal(renders, 1)
  assert.equal(both[0], both[1])

  // The LRU cap revokes what it evicts.
  revokeAll()
  revoked.length = 0
  for (let i = 0; i < 45; i += 1) {
    await getOrRender(cacheKey("c", "s", i, "t"), blob)
  }
  assert.ok(size() <= 40, `cache grew to ${size()}`)
  assert.ok(revoked.length >= 5, `evictions were not revoked (${revoked.length})`)

  // Re-extracting a section drops every picture of it, and nothing else.
  revokeAll()
  revoked.length = 0
  await getOrRender(cacheKey("c", "alpha", 1, "t"), blob)
  await getOrRender(cacheKey("c", "alpha", 2, "t"), blob)
  await getOrRender(cacheKey("c", "beta", 1, "t"), blob)
  revokeSection("c", "alpha")
  assert.equal(size(), 1)
  assert.equal(revoked.length, 2)
  assert.ok(peek(cacheKey("c", "beta", 1, "t")))

  // A section whose name prefixes another is not caught by mistake.
  revokeAll()
  await getOrRender(cacheKey("c", "risk", 1, "t"), blob)
  await getOrRender(cacheKey("c", "risk_management", 1, "t"), blob)
  revokeSection("c", "risk")
  assert.equal(size(), 1)
  assert.ok(peek(cacheKey("c", "risk_management", 1, "t")))

  console.log("design2Cache: all checks passed")
}

await main()
