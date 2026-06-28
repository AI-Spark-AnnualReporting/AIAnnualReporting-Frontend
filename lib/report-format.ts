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
