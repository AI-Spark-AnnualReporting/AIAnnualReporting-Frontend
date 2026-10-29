/**
 * Run async work with a ceiling on how much is in flight.
 *
 * Both callers here are fan-outs over a whole report: extracting every
 * section through GPT-4.1, and rendering every chosen page through a browser
 * that launches cold each time. Unbounded Promise.all over either risks rate
 * limits and starves anything else using the same service, and a single
 * failure then looks like many.
 *
 * Pure — self-checked with `node lib/concurrency.test.ts`.
 */

export interface MapOptions {
  signal?: AbortSignal
  /** Called after each item settles, successfully or not. */
  onSettled?: (done: number, total: number) => void
}

export type Settled<T> =
  | { status: "fulfilled"; value: T }
  | { status: "rejected"; reason: unknown }

/**
 * Like Promise.allSettled, but at most `limit` calls are running at once.
 *
 * Results keep the input order regardless of completion order, so a caller can
 * zip them back against the list it passed in. Never rejects: a thrown item
 * becomes a `rejected` entry, because one bad section must not abandon the
 * other ten.
 */
export async function mapWithConcurrency<TIn, TOut>(
  items: readonly TIn[],
  limit: number,
  fn: (item: TIn, index: number) => Promise<TOut>,
  options: MapOptions = {},
): Promise<Settled<TOut>[]> {
  const results = new Array<Settled<TOut>>(items.length)
  const width = Math.max(1, Math.floor(limit))
  let next = 0
  let done = 0

  async function worker(): Promise<void> {
    for (;;) {
      // Checked between items, not mid-flight: an in-flight request cannot be
      // recalled, and on the server side the work lands anyway.
      if (options.signal?.aborted) return
      const index = next++
      if (index >= items.length) return
      try {
        results[index] = { status: "fulfilled", value: await fn(items[index], index) }
      } catch (reason) {
        results[index] = { status: "rejected", reason }
      }
      done += 1
      options.onSettled?.(done, items.length)
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(width, items.length) }, () => worker()),
  )
  return results
}
