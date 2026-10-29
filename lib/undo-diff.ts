import { diffWords } from "diff"

/* The Undo pop-up's change marks: green for text an undo brings back, red for
 * text it removes (not crossed out: on the "Now" side that text is still there).
 *
 * The marks can't go into the markdown as <ins>/<del> tags: a tag near the
 * start makes ProsePreview treat the whole text as HTML, and a tag before a
 * "- " or "## " breaks that line's list or heading. So the markdown gets
 * invisible private-use characters instead, which markdown leaves alone, and
 * rehypeChangeMarks turns them into <ins>/<del> after the markdown is built. */
const BACK_OPEN = ""
const BACK_CLOSE = ""
const GONE_OPEN = ""
const GONE_CLOSE = ""

// A list, heading or quote marker at the start of a line. It stays outside a
// mark, so the line still reads as a list item, heading or quote.
const LINE_MARKER = /^\s*(?:#{1,6}\s+|[-*+]\s+|\d+[.)]\s+|>\s*)?/

/** Wrap one changed run of text in marks, line by line, keeping each line's
 *  markdown marker outside. `atLineStart` = the run begins a new line. */
function wrapRun(run: string, open: string, close: string, atLineStart: boolean): string {
  const lines = run.split("\n")
  const out: string[] = []
  lines.forEach((line, i) => {
    const marker = i > 0 || atLineStart ? (line.match(LINE_MARKER)?.[0] ?? "") : ""
    const rest = line.slice(marker.length)
    out.push(rest.trim() ? `${marker}${open}${rest}${close}` : line)
  })
  return out.join("\n")
}

/**
 * The text after the undo, with the text it removes put back in, each change
 * wrapped in marks for ProsePreview's `changeMarks`.
 *
 * @param now   The section as it reads now.
 * @param after The section as it will read after the undo.
 * @param side  "now" = only the text that goes (red), "after" = only the text
 *              that comes back (green), "both" = both in one text.
 * @returns Markdown with marks; the chosen side's text unchanged when it is
 *          HTML, whose tags the marks could split.
 */
export function markChanges(
  now: string,
  after: string,
  side: "both" | "now" | "after" = "both",
): string {
  if (/<[a-z][\s\S]*>/i.test(now.slice(0, 200) + after.slice(0, 200))) {
    return side === "now" ? now : after
  }
  let out = ""
  for (const part of diffWords(now, after)) {
    const atLineStart = out === "" || out.endsWith("\n")
    if (part.added) {
      if (side !== "now") out += wrapRun(part.value, BACK_OPEN, BACK_CLOSE, atLineStart)
    } else if (part.removed) {
      if (side !== "after") out += wrapRun(part.value, GONE_OPEN, GONE_CLOSE, atLineStart)
    }
    else out += part.value
  }
  return out
}

// Minimal hast shapes - just what the walk needs.
type HastNode = { type: string; value?: string; children?: HastNode[] }

/** One piece of text: plain, or inside a <ins>/<del> mark. */
function piece(value: string, mode: "" | "ins" | "del"): HastNode {
  const text = { type: "text", value }
  if (!mode) return text
  return {
    type: "element",
    tagName: mode,
    properties: {
      className:
        mode === "ins"
          ? ["rounded", "bg-green-100", "px-0.5", "text-green-800", "no-underline"]
          : ["rounded", "bg-red-100", "px-0.5", "text-red-700", "no-underline"],
    },
    children: [text],
  } as HastNode
}

/* A rehype step that turns the marks from markChanges into <ins>/<del>. A
 * mark can start in one text node and end in another (a change across bold
 * text or two paragraphs), so the walk carries the open mark from node to node
 * in reading order. */
export function rehypeChangeMarks() {
  return (tree: HastNode) => {
    let mode: "" | "ins" | "del" = ""
    const walk = (node: HastNode) => {
      if (!node.children) return
      const next: HastNode[] = []
      for (const child of node.children) {
        if (child.type !== "text") {
          walk(child)
          next.push(child)
          continue
        }
        for (const bit of (child.value ?? "").split(/([-])/)) {
          if (bit === BACK_OPEN) mode = "ins"
          else if (bit === GONE_OPEN) mode = "del"
          else if (bit === BACK_CLOSE || bit === GONE_CLOSE) mode = ""
          else if (bit) next.push(piece(bit, mode))
        }
      }
      node.children = next
    }
    walk(tree)
  }
}
