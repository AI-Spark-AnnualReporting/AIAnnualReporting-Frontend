/**
 * Minimal Server-Sent Events frame parser.
 *
 * This app has exactly one streaming endpoint, and the browser's native
 * EventSource cannot be used for it: EventSource sends no Authorization
 * header, and every call here is authenticated with a bearer token. So the
 * stream is read with fetch + a ReadableStream reader, which hands back raw
 * bytes and leaves the framing to us.
 *
 * Kept dependency-free and side-effect-free so it can be self-checked with:
 *   node lib/sseFrames.test.ts
 */

export interface SseFrame {
  event: string
  data: string
}

/**
 * Split whatever has been decoded so far into complete frames.
 *
 * A network chunk can end anywhere, including halfway through a frame, so the
 * caller keeps `rest` and prepends it to the next chunk. Dropping it would
 * silently lose whichever frame straddled the boundary — and because the lost
 * frame is usually the big one (`result`), the failure looks like the server
 * never answered.
 */
export function parseSseFrames(buffer: string): {
  frames: SseFrame[]
  rest: string
} {
  const parts = buffer.replace(/\r\n/g, "\n").split("\n\n")
  // The last element is either an incomplete frame or "" when the buffer
  // happened to end on a separator. Either way it is not ours to emit yet.
  const rest = parts.pop() ?? ""
  const frames: SseFrame[] = []

  for (const part of parts) {
    let event = "message"
    const data: string[] = []

    for (const line of part.split("\n")) {
      // A line opening with ":" is a comment — which is exactly what the
      // server's keep-alive heartbeat is, so this is what skips it.
      if (!line || line.startsWith(":")) continue

      const colon = line.indexOf(":")
      const field = colon === -1 ? line : line.slice(0, colon)
      let value = colon === -1 ? "" : line.slice(colon + 1)
      // One optional space after the colon belongs to the framing, not the
      // payload. Leaving it in corrupts every JSON.parse downstream.
      if (value.startsWith(" ")) value = value.slice(1)

      if (field === "event") event = value
      // Per the spec, repeated data fields are joined with newlines.
      else if (field === "data") data.push(value)
    }

    if (data.length) frames.push({ event, data: data.join("\n") })
  }

  return { frames, rest }
}
