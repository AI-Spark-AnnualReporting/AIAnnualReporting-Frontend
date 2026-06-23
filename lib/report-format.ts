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
