/**
 * Cache of rendered page images, keyed by (section, page, template).
 *
 * Every render is a cold Chromium launch on the server, so comparing two
 * templates and going back to the first should not cost a second one. That is
 * the whole reason this module exists.
 *
 * Entries deliberately outlive the components that fill them — that is the
 * whole point, and it is safe because the images are data URIs rather than
 * object URLs, so there is nothing to revoke. What bounds the map is an LRU
 * cap, a revokeSection() for when a section's blocks change underneath us,
 * and a clear on page unload.
 *
 * It also remembers failures. Without that, a render that failed is retried
 * on every unrelated cache write, and each retry is a cold browser launch.
 */

// Big enough to hold a whole pre-drawn report. A cache that evicts what the
// pre-warm just put in it is worse than no pre-warm at all: the section you
// click would be the one that fell out. Nineteen sections plus five contents
// designs plus the alternatives for whatever is open already passes 40.
const MAX_ENTRIES = 240

// Nothing to revoke: renders come back as data URIs, so a cached entry is a
// plain string and the only reason to bound the map is memory.

// Map preserves insertion order, which is what makes it an LRU: re-reading an
// entry deletes and re-sets it, moving it to the end.
const cache = new Map<string, string[]>()
const inflight = new Map<string, Promise<string[]>>()
// A key that failed. Without this a failed render is retried on every
// unrelated cache write, and each retry is a cold browser launch.
const failed = new Map<string, string>()

export function cacheKey(
  cycleId: string,
  sectionCode: string,
  unitIndex: number,
  templateKey: string,
): string {
  return `${cycleId}|${sectionCode}|${unitIndex}|${templateKey}`
}

export function peek(key: string): string[] | undefined {
  const url = cache.get(key)
  if (url === undefined) return undefined
  cache.delete(key)
  cache.set(key, url)
  return url
}

function put(key: string, pages: string[]): string[] {
  cache.delete(key)
  cache.set(key, pages)
  // Data URIs need no revoking, but they are large, so the cap still earns
  // its place.
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value as string | undefined
    if (oldest === undefined) break
    cache.delete(oldest)
  }
  return pages
}

/** Why this key last failed, if it did. */
export function lastFailure(key: string): string | undefined {
  return failed.get(key)
}

/** Forget a key so the next request really re-renders it. */
export function evict(key: string): void {
  cache.delete(key)
  failed.delete(key)
}

/**
 * The cached image for this key, rendering it if we do not have it.
 *
 * Concurrent callers for the same key share one request — without this, a
 * double-click on a card launches two browsers for one picture.
 */
export async function getOrRender(
  key: string,
  render: () => Promise<string[]>,
): Promise<string[]> {
  const hit = peek(key)
  if (hit) return hit

  const why = failed.get(key)
  if (why) throw new Error(why)

  const pending = inflight.get(key)
  if (pending) return pending

  const promise = render()
    .then((pages) => put(key, pages))
    .catch((e) => {
      failed.set(key, (e as Error)?.message || "The page could not be rendered.")
      throw e
    })
    .finally(() => inflight.delete(key))
  inflight.set(key, promise)
  return promise
}

/**
 * Drop every render of one section.
 *
 * Called after a re-extract: the blocks changed, so every picture of them is
 * now a picture of something that no longer exists.
 */
export function revokeSection(cycleId: string, sectionCode: string): void {
  const prefix = `${cycleId}|${sectionCode}|`
  for (const key of [...cache.keys()]) {
    if (key.startsWith(prefix)) {
      cache.delete(key)
      failed.delete(key)
    }
  }
}

export function revokeAll(): void {
  cache.clear()
  failed.clear()
}

export function size(): number {
  return cache.size
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", revokeAll)
}


/**
 * Put pages in without rendering them.
 *
 * The pre-warm draws many pages in one batch request, so it arrives holding
 * results the cache has never seen — `getOrRender` cannot express that,
 * because it owns the fetch. Priming is the same write `getOrRender` performs
 * on success, exposed.
 *
 * A key already present or already in flight is left alone: the pre-warm must
 * never overwrite a render the user is actively waiting on.
 */
export function prime(key: string, pages: string[]): void {
  if (!pages.length || cache.has(key) || inflight.has(key)) return
  failed.delete(key)
  cache.set(key, pages)
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value
    if (oldest === undefined) break
    cache.delete(oldest)
  }
}

/** Is this page already drawn? Drives the rail's readiness dot. */
export function has(key: string): boolean {
  return cache.has(key)
}
