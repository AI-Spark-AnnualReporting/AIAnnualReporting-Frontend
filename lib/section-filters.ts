// Sections the report generates for itself, rather than sections a PM works
// on: the table of contents, composed at render time from the live section
// list, and the cover, which the Report design popup owns (template, brand
// colours, typography, logo). Neither is written, uploaded, or locked by hand,
// so both are hidden from the plan screen and the builder rail — including in
// cycles whose rows were created before the design popup took the cover over,
// so every cycle looks the same.
export function isReportGeneratedSection(s: {
  section_code: string
  title: string
}): boolean {
  return (
    /^(toc|table[-_ ]?of[-_ ]?contents)$/i.test(s.section_code) ||
    /table of contents/i.test(s.title) ||
    /^cover$/i.test(s.section_code)
  )
}

// Whether a section would appear in the assembled report. Mirrors the backend
// assembly-readiness rule, which is about CONTENT rather than locks: auto
// sections are rendered by the report itself, an attach section's document IS
// its content, and everything else needs something written.
//
// Locks are gone from this: the whole report is signed off in one step at the
// end, so a section no longer has to be stamped before it counts.
export function isSectionReady(s: {
  mode: string
  content?: string | null
  attachment?: unknown
}): boolean {
  if (s.mode === "auto") return true
  if ((s.content ?? "").trim()) return true
  return !!s.attachment
}
