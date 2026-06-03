// Detects the auto-rendered Table of Contents section. The ToC is generated
// client-side from the live section list at render time, so the PM should
// never see it as a row to plan, lock, or scroll past.
export function isTableOfContentsSection(s: {
  section_code: string
  title: string
}): boolean {
  return (
    /^(toc|table[-_ ]?of[-_ ]?contents)$/i.test(s.section_code) ||
    /table of contents/i.test(s.title)
  )
}

// Whether a section counts as "ready" for assembly progress. Mirrors the
// backend assembly-readiness rule: auto sections are system-rendered, and the
// cover is always ready (its image is optional — a text cover is generated when
// none is uploaded). Everything else must be locked.
export function isSectionReady(s: {
  section_code: string
  mode: string
  status: string
}): boolean {
  return (
    s.status === "locked" ||
    s.mode === "auto" ||
    s.section_code === "cover"
  )
}
