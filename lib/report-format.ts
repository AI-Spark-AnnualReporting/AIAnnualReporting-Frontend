import type { OutlineEntry } from "@/types"

// Preview-side formatting helpers that mirror the backend report renderer
// (report_render_service.py). The downloaded DOCX/PDF already drops the
// duplicate leading heading and right-aligns Arabic headings/numbers; these
// helpers let the on-screen preview match that output.

// Normalize a heading for comparison — mirror of the backend `_norm_heading`:
// lower-case, strip markdown markers (#/*/~), collapse whitespace, and trim
// surrounding punctuation so "## كلمة رئيس مجلس الإدارة" matches "كلمة رئيس مجلس الإدارة".
export function normHeading(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/[*~#]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[\s:.\-]+|[\s:.\-]+$/g, "")
}

// Remove a leading "# …" / "## …" heading that just repeats the section title.
// Section content is stored with its own leading heading echoing the title; the
// section header above already shows it, so the preview would otherwise show it
// twice. Returns the original content unchanged when the first heading differs.
export function stripDuplicateTitle(
  content: string,
  sectionTitle: string,
): string {
  const text = (content || "").replace(/^\s+/, "")
  const m = text.match(/^(#{1,6})\s+(.+?)\s*#*\s*(?:\n|$)/)
  if (m && normHeading(m[2]) === normHeading(sectionTitle)) {
    return text.slice(m[0].length).replace(/^\s+/, "")
  }
  return content
}

// Render Western digits as Arabic-Indic (٠١٢٣…) to match the report's section
// numbering for Arabic content.
export function toArabicDigits(s: string | number): string {
  return String(s).replace(/[0-9]/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)])
}

// ───── Canonical section numbering (mirrors the backend outline) ─────────

export interface OutlineBlock {
  l1: OutlineEntry
  subs: OutlineEntry[]
}

// Group a flat, document-order outline into top-level blocks: each level-1
// entry plus the deeper entries (sub-headings) that follow it, in order.
// Entries before any level-1 entry are ignored.
export function groupOutline(outline: OutlineEntry[]): OutlineBlock[] {
  const blocks: OutlineBlock[] = []
  for (const e of outline) {
    if (e.level <= 1) blocks.push({ l1: e, subs: [] })
    else if (blocks.length) blocks[blocks.length - 1].subs.push(e)
  }
  return blocks
}

export interface SectionNumbering {
  number: string | null
  subNumbers: string[]
}

// Map each body section (in document order) to its top-level number and the
// numbers of its sub-headings, by walking the grouped outline with a running
// pointer. Matching is by normalized title; the pointer only moves forward, so
// repeated titles still resolve to the right block. Falls back to the section's
// own `number` field (no sub-numbers) when there's no outline (older backend)
// or no matching entry — and leaves the pointer put so later sections still
// align. The Executive Summary block is skipped naturally: its title never
// matches a body section, so the pointer steps over it on the first lookup.
export function computeSectionNumbering(
  sections: { section_code: string; title: string; number?: string | number | null }[],
  outline: OutlineEntry[] | undefined,
): Map<string, SectionNumbering> {
  const result = new Map<string, SectionNumbering>()
  const blocks = outline ? groupOutline(outline) : []
  let bi = 0
  for (const s of sections) {
    let mi = bi
    while (mi < blocks.length && normHeading(blocks[mi].l1.title) !== normHeading(s.title)) mi++
    if (mi < blocks.length) {
      result.set(s.section_code, {
        number: blocks[mi].l1.number,
        subNumbers: blocks[mi].subs.map((e) => e.number),
      })
      bi = mi + 1
    } else {
      result.set(s.section_code, {
        number: s.number != null ? String(s.number) : null,
        subNumbers: [],
      })
    }
  }
  return result
}

// A "bold pseudo-heading": a line whose entire content is a single bold span
// (`**Foo**` or `__Foo__`). The AI sometimes emits these instead of real
// headings — they look like headings but carry no `#`. Returns the parts so the
// number can be slotted inside the bold markers; null for anything else,
// including prose that merely *contains* bold (e.g. "This is **bold** text" or
// "**Note:** ...", which don't start-and-end with one bold span).
function matchBoldHeading(
  line: string,
): { indent: string; marker: string; text: string; trail: string } | null {
  const m = line.match(/^(\s*)(\*\*|__)(.+?)(\*\*|__)([ \t]*)$/)
  if (!m) return null
  const [, indent, open, inner, close, trail] = m
  // One bold span only (markers match, inner doesn't reopen one), with real
  // content and no inner padding — mirrors CommonMark's strong-emphasis rule.
  if (open !== close || inner.includes(open)) return null
  if (!inner.trim() || inner !== inner.trim()) return null
  return { indent, marker: open, text: inner, trail }
}

// Prefix each heading line with its number, in document order. A heading is
// either a real ATX heading (`## Foo`) or a bold pseudo-heading (`**Foo**`) —
// both render as a visual heading, and the AI uses either style. The outline's
// sub-headings were computed FROM these same lines, so the k-th heading in the
// content maps to numbers[k] — no fragile title matching needed. Headings beyond
// the supplied numbers are left unprefixed. (A stray "#" inside a fenced code
// block would also match, but report content has no code blocks.)
//
// Note: any manual enumerator the AI typed ("### 1. Approval") is already
// stripped at the source by the backend renderer, so both the outline titles and
// this raw content arrive clean — the frontend only prepends the canonical
// number and never has to de-duplicate.
export function prefixHeadingNumbers(md: string, numbers: string[]): string {
  if (!numbers.length || !md) return md
  const atxRe = /^(\s{0,3}#{1,6}[ \t]+)(.*\S)([ \t]*#*[ \t]*)$/
  const lines = md.split("\n")
  let k = 0
  for (let i = 0; i < lines.length && k < numbers.length; i++) {
    const atx = lines[i].match(atxRe)
    if (atx) {
      lines[i] = `${atx[1]}${numbers[k++]}  ${atx[2]}${atx[3]}`
      continue
    }
    const bold = matchBoldHeading(lines[i])
    if (bold) {
      // Number goes inside the markers so it shares the heading's bold weight.
      lines[i] = `${bold.indent}${bold.marker}${numbers[k++]}  ${bold.text}${bold.marker}${bold.trail}`
    }
  }
  return lines.join("\n")
}

// A trimmed line that looks like a GFM table row: starts with "|" and has at
// least two pipes (so a header/data row, not a stray "a | b" in prose).
function isPipeRow(line: string): boolean {
  const t = line.trim()
  return t.startsWith("|") && (t.match(/\|/g) || []).length >= 2
}

// A GFM delimiter row, e.g. "| --- | :--: |". Every cell is dashes with
// optional leading/trailing colons.
function isDelimiterRow(line: string): boolean {
  const cells = line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|")
  return cells.length > 0 && cells.every((c) => /^\s*:?-+:?\s*$/.test(c))
}

function cellCount(line: string): number {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").length
}

// remark-gfm only renders a pipe table when its header is immediately followed
// by a delimiter row ("| --- | --- |"). The AI-generated section content omits
// that row, so the preview would otherwise show the table as a run of literal
// "|" text. The backend report renderer inserts the delimiter; this mirrors it
// for the on-screen preview. Tables that already have a delimiter row, and lone
// pipe lines, are left untouched.
export function normalizeMarkdownTables(content: string): string {
  if (!content || content.indexOf("|") === -1) return content
  const lines = content.split("\n")
  const out: string[] = []
  let i = 0
  while (i < lines.length) {
    if (isPipeRow(lines[i])) {
      // Gather the contiguous block of pipe rows.
      let j = i
      while (j < lines.length && isPipeRow(lines[j])) j++
      const block = lines.slice(i, j)
      if (block.length >= 2 && !isDelimiterRow(block[1])) {
        // GFM is lenient about a missing blank line before a table, but adding
        // one keeps the header from being absorbed into preceding prose.
        if (out.length && out[out.length - 1].trim() !== "") out.push("")
        out.push(block[0])
        const n = Math.max(cellCount(block[0]), 1)
        out.push("| " + Array(n).fill("---").join(" | ") + " |")
        for (let k = 1; k < block.length; k++) out.push(block[k])
      } else {
        for (const b of block) out.push(b)
      }
      i = j
    } else {
      out.push(lines[i])
      i++
    }
  }
  return out.join("\n")
}
