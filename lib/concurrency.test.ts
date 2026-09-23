/**
 * Self-check for the concurrency limiter. No framework — run it with:
 *   node lib/concurrency.test.ts
 */

import assert from "node:assert/strict"
import { mapWithConcurrency } from "./concurrency.ts"

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms))

async function main() {
  // Order follows the input, not completion.
  const out = await mapWithConcurrency([30, 1, 20, 2], 2, async (ms, i) => {
    await tick(ms)
    return i
  })
  assert.deepEqual(out.map((r) => (r.status === "fulfilled" ? r.value : null)), [0, 1, 2, 3])

  // The ceiling actually holds.
  let live = 0
  let peak = 0
  await mapWithConcurrency(Array.from({ length: 12 }, (_, i) => i), 3, async () => {
    live += 1
    peak = Math.max(peak, live)
    await tick(5)
    live -= 1
  })
  assert.equal(peak, 3, `peak concurrency was ${peak}`)

  // One failure must not abandon the rest.
  const mixed = await mapWithConcurrency([1, 2, 3], 2, async (n) => {
    if (n === 2) throw new Error("boom")
    return n
  })
  assert.equal(mixed.filter((r) => r.status === "fulfilled").length, 2)
  assert.equal(mixed[1].status, "rejected")

  // Progress is reported once per settled item, failures included.
  const seen: number[] = []
  await mapWithConcurrency([1, 2, 3], 2, async (n) => {
    if (n === 2) throw new Error("boom")
    return n
  }, { onSettled: (d) => seen.push(d) })
  assert.deepEqual(seen.sort(), [1, 2, 3])

  // An already-aborted signal launches nothing.
  const ac = new AbortController()
  ac.abort()
  let ran = 0
  await mapWithConcurrency([1, 2, 3], 2, async () => { ran += 1 }, { signal: ac.signal })
  assert.equal(ran, 0)

  // Degenerate inputs.
  assert.deepEqual(await mapWithConcurrency([], 4, async () => 1), [])
  assert.equal((await mapWithConcurrency([1, 2], 0, async (n) => n)).length, 2)

  console.log("concurrency: all checks passed")
}

await main()
