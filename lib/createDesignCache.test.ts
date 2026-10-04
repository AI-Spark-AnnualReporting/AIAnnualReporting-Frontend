/**
 * Self-check for the render cache. No framework — run it with:
 *   node lib/createDesignCache.test.ts
 *
 * The cache deliberately outlives the components that fill it, so the only
 * things standing between it and a leak are the LRU cap and the two explicit
 * revokes. Those are what this pins.
 */

import assert from "node:assert/strict"
import {
  cacheKey, evict, getOrRender, lastFailure, maxEntries, peek, revokeAll,
  revokeCycle, revokeSection, size,
} from "./createDesignCache.ts"

let made = 0
// Renders return every sheet of a unit, as data URIs — nothing to revoke.
const blob = () => Promise.resolve([`data:image/png;base64,p${++made}`])

async function main() {
  revokeAll()

  // Keys are per section, page AND template.
  assert.equal(cacheKey("c", "ceo_review", 2, "kpi_stat_grid"), "c|ceo_review|2|kpi_stat_grid")
  assert.notEqual(cacheKey("c", "s", 1, "a"), cacheKey("c", "s", 2, "a"))

  // A hit costs no second render.
  let renders = 0
  const k = cacheKey("c", "s", 1, "t")
  const first = await getOrRender(k, async () => { renders += 1; return blob() })
  const second = await getOrRender(k, async () => { renders += 1; return blob() })
  assert.equal(renders, 1)
  assert.deepEqual(first, second)
  assert.deepEqual(peek(k), first)

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
  assert.deepEqual(both[0], both[1])

  // The LRU cap revokes what it evicts. Counted against the cap the MODULE
  // declares, not a number copied beside it: this assertion was written when
  // the cap was 40 and went on failing quietly after it was raised to hold a
  // whole pre-drawn report, which left every check below it unreached.
  revokeAll()
  const cap = maxEntries()
  for (let i = 0; i < cap + 5; i += 1) {
    await getOrRender(cacheKey("c", "s", i, "t"), blob)
  }
  assert.equal(size(), cap, `cache grew to ${size()}`)
  assert.equal(peek(cacheKey("c", "s", 0, "t")), undefined,
    "the oldest entry survived the cap")

  // Re-extracting a section drops every picture of it, and nothing else.
  revokeAll()
  await getOrRender(cacheKey("c", "alpha", 1, "t"), blob)
  await getOrRender(cacheKey("c", "alpha", 2, "t"), blob)
  await getOrRender(cacheKey("c", "beta", 1, "t"), blob)
  revokeSection("c", "alpha")
  assert.equal(size(), 1)
  assert.ok(peek(cacheKey("c", "beta", 1, "t")))

  // A section whose name prefixes another is not caught by mistake.
  revokeAll()
  await getOrRender(cacheKey("c", "risk", 1, "t"), blob)
  await getOrRender(cacheKey("c", "risk_management", 1, "t"), blob)
  revokeSection("c", "risk")
  assert.equal(size(), 1)
  assert.ok(peek(cacheKey("c", "risk_management", 1, "t")))

  // Choosing a cover picks the opener EVERY section prints, and no key
  // carries it — so the whole cycle has to go, and only that cycle.
  revokeAll()
  await getOrRender(cacheKey("cyc", "alpha", 1, "t"), blob)
  await getOrRender(cacheKey("cyc", "beta", 1, "t"), blob)
  await getOrRender(cacheKey("cyc", "beta", 1, "other"), blob)
  await getOrRender(cacheKey("other-cycle", "alpha", 1, "t"), blob)
  revokeCycle("cyc")
  assert.equal(size(), 1, "revokeCycle did not drop every render of its cycle")
  assert.ok(peek(cacheKey("other-cycle", "alpha", 1, "t")),
    "revokeCycle reached into another cycle")

  // A cycle id that prefixes another is not caught by mistake.
  revokeAll()
  await getOrRender(cacheKey("cyc", "a", 1, "t"), blob)
  await getOrRender(cacheKey("cyc-2", "a", 1, "t"), blob)
  revokeCycle("cyc")
  assert.equal(size(), 1)
  assert.ok(peek(cacheKey("cyc-2", "a", 1, "t")))

  // A remembered FAILURE is a cached answer too: leaving it behind means the
  // section that failed under the old cover keeps replaying that error under
  // the new one.
  revokeAll()
  const stale = cacheKey("cyc", "gamma", 1, "t")
  try {
    await getOrRender(stale, async () => { throw new Error("engine down") })
  } catch { /* expected */ }
  assert.equal(lastFailure(stale), "engine down")
  revokeCycle("cyc")
  assert.equal(lastFailure(stale), undefined,
    "revokeCycle left a remembered failure behind")

  // A failure is remembered, so an unrelated re-render does not relaunch a
  // browser for a key that just failed — and evict() is what clears it.
  revokeAll()
  const bad = cacheKey("c", "s", 9, "t")
  let attempts = 0
  for (const _ of [1, 2]) {
    try {
      await getOrRender(bad, async () => { attempts += 1; throw new Error("engine down") })
    } catch { /* expected */ }
  }
  assert.equal(attempts, 1, "a failed key was retried without an evict")
  assert.equal(lastFailure(bad), "engine down")
  evict(bad)
  await getOrRender(bad, async () => { attempts += 1; return blob() })
  assert.equal(attempts, 2, "evict did not clear the failure")

  console.log("createDesignCache: all checks passed")
}

await main()
