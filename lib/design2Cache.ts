/**
 * Cache of rendered page images, keyed by (section, page, template).
 *
 * Every render is a cold Chromium launch on the server, so comparing two
 * templates and going back to the first should not cost a second one. That is
 * the whole reason this module exists.
 *
 * It deliberately does NOT revoke on unmount, which is the opposite of the
 * discipline the old Design2 dialog used — correct there, because nothing was
 * cached. Here the URLs must outlive the component or the cache is pointless.
 * What bounds it instead: an LRU cap that revokes what it evicts, a
 * revokeSection() for when a section's blocks change underneath us, and a
 * revokeAll() on page unload.
 */

const MAX_ENTRIES = 40

// Injectable so the self-check can run under Node, where URL.createObjectURL
// does not exist.
let create: (blob: Blob) => string =
  typeof URL !== "undefined" && URL.createObjectURL
    ? (blob) => URL.createObjectURL(blob)
    : () => {
        throw new Error("createObjectURL unavailable")
      }
let revoke: (url: string) => void =
  typeof URL !== "undefined" && URL.revokeObjectURL ? (url) => URL.revokeObjectURL(url) : () => {}

/** Test seam. Not used by the app. */
export function __setObjectUrlImpl(
  c: (blob: Blob) => string,
  r: (url: string) => void,
): void {
  create = c
  revoke = r
}

// Map preserves insertion order, which is what makes it an LRU: re-reading an
// entry deletes and re-sets it, moving it to the end.
const cache = new Map<string, string>()
const inflight = new Map<string, Promise<string>>()

export function cacheKey(
  cycleId: string,
  sectionCode: string,
  unitIndex: number,
  templateKey: string,
): string {
  return `${cycleId}|${sectionCode}|${unitIndex}|${templateKey}`
}

export function peek(key: string): string | undefined {
  const url = cache.get(key)
  if (url === undefined) return undefined
  cache.delete(key)
  cache.set(key, url)
  return url
}

function put(key: string, url: string): string {
  const existing = cache.get(key)
  if (existing && existing !== url) revoke(existing)
  cache.delete(key)
  cache.set(key, url)
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value as string | undefined
    if (oldest === undefined) break
    const stale = cache.get(oldest)
    cache.delete(oldest)
    if (stale) revoke(stale)
  }
  return url
}

/**
 * The cached image for this key, rendering it if we do not have it.
 *
 * Concurrent callers for the same key share one request — without this, a
 * double-click on a card launches two browsers for one picture.
 */
export async function getOrRender(
  key: string,
  render: () => Promise<Blob>,
): Promise<string> {
  const hit = peek(key)
  if (hit) return hit

  const pending = inflight.get(key)
  if (pending) return pending

  const promise = render()
    .then((blob) => put(key, create(blob)))
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
      const url = cache.get(key)
      cache.delete(key)
      if (url) revoke(url)
    }
  }
}

export function revokeAll(): void {
  for (const url of cache.values()) revoke(url)
  cache.clear()
}

export function size(): number {
  return cache.size
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", revokeAll)
}
