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
