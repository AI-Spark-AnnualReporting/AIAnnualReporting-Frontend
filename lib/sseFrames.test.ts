/**
 * Self-check for the SSE frame parser. No framework — run it with:
 *   node lib/sseFrames.test.ts
 *
 * It exists because this parser sits between the network and every piece of
 * Create Design's progress UI, and its failure mode is silent: a frame lost on a
 * chunk boundary does not throw, it just never arrives. The usual symptom is
 * a run that shows four steps and then hangs forever, which looks like a
 * backend problem and is not.
 */

import assert from "node:assert/strict"
import { parseSseFrames } from "./sseFrames.ts"

// --- one complete frame ------------------------------------------------------
{
  const { frames, rest } = parseSseFrames(
    'event: step\ndata: {"index":0}\n\n',
  )
  assert.equal(frames.length, 1)
  assert.equal(frames[0].event, "step")
  assert.equal(frames[0].data, '{"index":0}')
  assert.equal(rest, "")
}

// --- a frame split across two chunks -----------------------------------------
// The whole reason `rest` exists. A reader that dropped it would lose the
// `result` frame, which is the biggest one and therefore the likeliest to
// straddle a boundary.
{
  const first = parseSseFrames('event: result\ndata: {"a":1')
  assert.equal(first.frames.length, 0, "incomplete frame must not be emitted")

  const second = parseSseFrames(first.rest + '23}\n\n')
  assert.equal(second.frames.length, 1)
  assert.equal(second.frames[0].data, '{"a":123}')
}

// --- several frames in one chunk ---------------------------------------------
{
  const { frames } = parseSseFrames(
    'event: step\ndata: {"index":0}\n\nevent: note\ndata: {"text":"hi"}\n\n',
  )
  assert.deepEqual(
    frames.map((f) => f.event),
    ["step", "note"],
  )
}

// --- heartbeats are skipped ---------------------------------------------------
// The server sends a bare comment every 15s during the model call so the
// connection is not dropped. It carries no data and must not surface.
{
  const { frames } = parseSseFrames(
    ': keep-alive\n\nevent: done\ndata: {"ok":true}\n\n',
  )
  assert.equal(frames.length, 1)
  assert.equal(frames[0].event, "done")
}

// --- CRLF line endings ---------------------------------------------------------
{
  const { frames } = parseSseFrames(
    'event: step\r\ndata: {"index":3}\r\n\r\n',
  )
  assert.equal(frames.length, 1)
  assert.equal(frames[0].data, '{"index":3}')
}

// --- repeated data fields join with newlines ----------------------------------
{
  const { frames } = parseSseFrames("event: note\ndata: line one\ndata: line two\n\n")
  assert.equal(frames[0].data, "line one\nline two")
}

// --- only one leading space is framing, the rest is payload -------------------
{
  const { frames } = parseSseFrames("event: note\ndata:  two spaces\n\n")
  assert.equal(frames[0].data, " two spaces")
}

// --- a frame with no event name defaults to "message" -------------------------
{
  const { frames } = parseSseFrames('data: {"x":1}\n\n')
  assert.equal(frames[0].event, "message")
}

// --- trailing partial is preserved verbatim -----------------------------------
{
  const { frames, rest } = parseSseFrames(
    'event: step\ndata: {"index":0}\n\nevent: note\ndata: {"tex',
  )
  assert.equal(frames.length, 1)
  assert.equal(rest, 'event: note\ndata: {"tex')
}

console.log("sseFrames: all checks passed")
