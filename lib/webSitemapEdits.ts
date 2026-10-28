/**
 * Every edit the sitemap editor can make, as plain functions.
 *
 * Each one takes a sitemap and returns a NEW sitemap; nothing is changed in
 * place, so React sees every edit and "unsaved changes" is a simple compare.
 * Tested in webSitemapEdits.test.ts.
 */
import type { WebSection, WebSitemap, WebSitemapGroup, WebSitemapPage } from "./api/webSitemap"

/** A short random id, only so the editor can tell rows apart. */
export function newId(prefix: string): string {
  return prefix + Math.random().toString(36).slice(2, 10)
}

/** Copy the sitemap's groups and pages, so an edit can change the copy freely. */
function copySitemap(sitemap: WebSitemap): WebSitemap {
  const groups = sitemap.groups.map((group) => ({
    ...group,
    pages: group.pages.map((page) => ({ ...page, section_codes: [...page.section_codes] })),
  }))
  return { ...sitemap, home: { ...sitemap.home }, groups }
}

/** Where a page sits: its group's index and its own index. Null when not found. */
function findPage(sitemap: WebSitemap, pageId: string): { g: number; p: number } | null {
  for (let g = 0; g < sitemap.groups.length; g++) {
    const p = sitemap.groups[g].pages.findIndex((page) => page.id === pageId)
    if (p !== -1) return { g, p }
  }
  return null
}

/** Swap two items of a list, if both indexes are inside it. */
function swap<T>(list: T[], a: number, b: number): void {
  if (a < 0 || b < 0 || a >= list.length || b >= list.length) return
  const keep = list[a]
  list[a] = list[b]
  list[b] = keep
}

export function renameHome(sitemap: WebSitemap, title: string): WebSitemap {
  const next = copySitemap(sitemap)
  next.home.title = title
  return next
}

export function renameGroup(sitemap: WebSitemap, groupId: string, title: string): WebSitemap {
  const next = copySitemap(sitemap)
  for (const group of next.groups) {
    if (group.id === groupId) group.title = title
  }
  return next
}

export function renamePage(sitemap: WebSitemap, pageId: string, title: string): WebSitemap {
  const next = copySitemap(sitemap)
  const at = findPage(next, pageId)
  if (at) next.groups[at.g].pages[at.p].title = title
  return next
}

/** Move a group one place up (-1) or down (+1). */
export function moveGroup(sitemap: WebSitemap, groupId: string, step: -1 | 1): WebSitemap {
  const next = copySitemap(sitemap)
  const index = next.groups.findIndex((group) => group.id === groupId)
  if (index !== -1) swap(next.groups, index, index + step)
  return next
}

/** Move a page one place up (-1) or down (+1) inside its group. */
export function movePage(sitemap: WebSitemap, pageId: string, step: -1 | 1): WebSitemap {
  const next = copySitemap(sitemap)
  const at = findPage(next, pageId)
  if (at) swap(next.groups[at.g].pages, at.p, at.p + step)
  return next
}

/** Move a page to the end of another group. */
export function movePageToGroup(sitemap: WebSitemap, pageId: string, groupId: string): WebSitemap {
  const next = copySitemap(sitemap)
  const at = findPage(next, pageId)
  const target = next.groups.find((group) => group.id === groupId)
  if (!at || !target) return sitemap
  const [page] = next.groups[at.g].pages.splice(at.p, 1)
  target.pages.push(page)
  return next
}

/**
 * Move a page into a gap of a group (drag-and-drop).
 *
 * `gapIndex` counts the gaps in the target group AS IT IS NOW, before the page
 * is taken out: gap 0 is above the first page, gap N is below the last. When
 * the page moves down inside its own group, taking it out shifts every later
 * page up by one, so the insert position shifts with them.
 */
export function movePageTo(
  sitemap: WebSitemap,
  pageId: string,
  groupId: string,
  gapIndex: number,
): WebSitemap {
  const next = copySitemap(sitemap)
  const at = findPage(next, pageId)
  const target = next.groups.find((group) => group.id === groupId)
  if (!at || !target) return sitemap
  const sameGroup = next.groups[at.g].id === groupId
  let insertAt = gapIndex
  if (sameGroup && at.p < gapIndex) insertAt = gapIndex - 1
  const [page] = next.groups[at.g].pages.splice(at.p, 1)
  insertAt = Math.max(0, Math.min(insertAt, target.pages.length))
  target.pages.splice(insertAt, 0, page)
  return next
}

/** Add a report section as a new page in a gap of a group (drag from the tray). */
export function addSectionAsPage(
  sitemap: WebSitemap,
  sectionCode: string,
  title: string,
  groupId: string,
  gapIndex: number,
): WebSitemap {
  if (isSectionUsed(sitemap, sectionCode)) return sitemap
  const next = copySitemap(sitemap)
  const target = next.groups.find((group) => group.id === groupId)
  if (!target) return sitemap
  const insertAt = Math.max(0, Math.min(gapIndex, target.pages.length))
  target.pages.splice(insertAt, 0, {
    id: newId("p"),
    title,
    section_codes: [sectionCode],
    hidden: false,
  })
  return next
}

/** Add a report section to an existing page (drop a tray chip onto a page). */
export function addSectionToPage(
  sitemap: WebSitemap,
  sectionCode: string,
  pageId: string,
): WebSitemap {
  if (isSectionUsed(sitemap, sectionCode)) return sitemap
  const next = copySitemap(sitemap)
  const at = findPage(next, pageId)
  if (!at) return sitemap
  next.groups[at.g].pages[at.p].section_codes.push(sectionCode)
  return next
}

/** Whether a section is already on some page. */
function isSectionUsed(sitemap: WebSitemap, sectionCode: string): boolean {
  for (const group of sitemap.groups) {
    for (const page of group.pages) {
      if (page.section_codes.includes(sectionCode)) return true
    }
  }
  return false
}

export function toggleHidden(sitemap: WebSitemap, pageId: string): WebSitemap {
  const next = copySitemap(sitemap)
  const at = findPage(next, pageId)
  if (at) {
    const page = next.groups[at.g].pages[at.p]
    page.hidden = !page.hidden
  }
  return next
}

/** Put a page's sections at the end of another page, then remove the first page. */
export function mergePage(sitemap: WebSitemap, pageId: string, intoPageId: string): WebSitemap {
  if (pageId === intoPageId) return sitemap
  const next = copySitemap(sitemap)
  const from = findPage(next, pageId)
  const into = findPage(next, intoPageId)
  if (!from || !into) return sitemap
  const page = next.groups[from.g].pages[from.p]
  next.groups[into.g].pages[into.p].section_codes.push(...page.section_codes)
  next.groups[from.g].pages.splice(from.p, 1)
  return next
}

/** Take one section off a page and give it its own page, just below. */
export function splitSection(
  sitemap: WebSitemap,
  pageId: string,
  sectionCode: string,
  title: string,
): WebSitemap {
  const next = copySitemap(sitemap)
  const at = findPage(next, pageId)
  if (!at) return sitemap
  const page = next.groups[at.g].pages[at.p]
  if (page.section_codes.length < 2 || !page.section_codes.includes(sectionCode)) return sitemap
  page.section_codes = page.section_codes.filter((code) => code !== sectionCode)
  const newPage: WebSitemapPage = {
    id: newId("p"),
    title,
    section_codes: [sectionCode],
    hidden: false,
  }
  next.groups[at.g].pages.splice(at.p + 1, 0, newPage)
  return next
}

/** Take a section code off a page (used for sections the report no longer has). */
export function removeSectionFromPage(
  sitemap: WebSitemap,
  pageId: string,
  sectionCode: string,
): WebSitemap {
  const next = copySitemap(sitemap)
  const at = findPage(next, pageId)
  if (!at) return sitemap
  const page = next.groups[at.g].pages[at.p]
  page.section_codes = page.section_codes.filter((code) => code !== sectionCode)
  return next
}

export function addGroup(sitemap: WebSitemap, title: string): WebSitemap {
  const next = copySitemap(sitemap)
  const group: WebSitemapGroup = { id: newId("g"), title, pages: [] }
  next.groups.push(group)
  return next
}

/** Add a page to the end of a group. With no section code it is an empty extra page. */
export function addPage(
  sitemap: WebSitemap,
  groupId: string,
  title: string,
  sectionCode?: string,
): WebSitemap {
  const next = copySitemap(sitemap)
  const target = next.groups.find((group) => group.id === groupId)
  if (!target) return sitemap
  target.pages.push({
    id: newId("p"),
    title,
    section_codes: sectionCode ? [sectionCode] : [],
    hidden: false,
  })
  return next
}

/** Delete a group. Only an empty group can be deleted. */
export function deleteGroup(sitemap: WebSitemap, groupId: string): WebSitemap {
  const group = sitemap.groups.find((g) => g.id === groupId)
  if (!group || group.pages.length > 0) return sitemap
  const next = copySitemap(sitemap)
  next.groups = next.groups.filter((g) => g.id !== groupId)
  return next
}

/** Delete a page. Only a page with no sections on it can be deleted. */
export function deletePage(sitemap: WebSitemap, pageId: string): WebSitemap {
  const at = findPage(sitemap, pageId)
  if (!at || sitemap.groups[at.g].pages[at.p].section_codes.length > 0) return sitemap
  const next = copySitemap(sitemap)
  next.groups[at.g].pages.splice(at.p, 1)
  return next
}

/** Report sections that are on no page of the sitemap. */
export function sectionsNotOnSite(sitemap: WebSitemap, sections: WebSection[]): WebSection[] {
  const used = new Set<string>()
  for (const group of sitemap.groups) {
    for (const page of group.pages) {
      for (const code of page.section_codes) used.add(code)
    }
  }
  return sections.filter((section) => !used.has(section.section_code))
}

/** Every page of the sitemap with its group's title, for "Merge into…" lists. */
export function allPages(sitemap: WebSitemap): { page: WebSitemapPage; groupTitle: string }[] {
  const pages: { page: WebSitemapPage; groupTitle: string }[] = []
  for (const group of sitemap.groups) {
    for (const page of group.pages) pages.push({ page, groupTitle: group.title })
  }
  return pages
}
