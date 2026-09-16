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

// Whether a section counts as "ready" for assembly progress. Mirrors the
// backend assembly-readiness rule: auto sections are system-rendered, so they
// need no lock. Everything else must be locked.
export function isSectionReady(s: { mode: string; status: string }): boolean {
  return s.status === "locked" || s.mode === "auto"
}
