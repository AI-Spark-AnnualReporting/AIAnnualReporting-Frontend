/**
 * Self-check for the sitemap edit helpers. No framework — run it with:
 *   node lib/webSitemapEdits.test.ts
 *
 * Pinned: every edit returns a new sitemap and leaves the old one alone;
 * merge and split keep every section; only empty groups and pages delete;
 * sections on no page are found.
 */

import assert from "node:assert/strict"
import type { WebSitemap } from "./api/webSitemap.ts"
import {
  addGroup, addPage, addSectionAsPage, addSectionToPage, allPages, deleteGroup, deletePage, mergePage, moveGroup, movePage,
  movePageTo, movePageToGroup, removeSectionFromPage, renameGroup, renameHome, renamePage,
  sectionsNotOnSite, splitSection, toggleHidden,
} from "./webSitemapEdits.ts"

function sample(): WebSitemap {
  return {
    home: { title: "Home" },
    groups: [
      { id: "g1", title: "Leadership", pages: [
        { id: "p1", title: "Chairman", section_codes: ["chairman"], hidden: false },
        { id: "p2", title: "CEO", section_codes: ["ceo"], hidden: false },
      ] },
      { id: "g2", title: "Numbers", pages: [
        { id: "p3", title: "Figures", section_codes: ["kpis"], hidden: false },
      ] },
    ],
  }
}

function codes(sitemap: WebSitemap): string[] {
  return allPages(sitemap).flatMap(({ page }) => page.section_codes)
}

// Renames, and the original is untouched.
{
  const before = sample()
  const after = renamePage(renameGroup(renameHome(before, "Start"), "g1", "Leaders"), "p1", "Chair")
  assert.equal(after.home.title, "Start")
  assert.equal(after.groups[0].title, "Leaders")
  assert.equal(after.groups[0].pages[0].title, "Chair")
  assert.equal(before.home.title, "Home")
  assert.equal(before.groups[0].pages[0].title, "Chairman")
}

// Moving groups and pages; moving past the edge does nothing.
{
  assert.deepEqual(moveGroup(sample(), "g2", -1).groups.map((g) => g.id), ["g2", "g1"])
  assert.deepEqual(moveGroup(sample(), "g1", -1).groups.map((g) => g.id), ["g1", "g2"])
  assert.deepEqual(movePage(sample(), "p1", 1).groups[0].pages.map((p) => p.id), ["p2", "p1"])
  const moved = movePageToGroup(sample(), "p1", "g2")
  assert.deepEqual(moved.groups[0].pages.map((p) => p.id), ["p2"])
  assert.deepEqual(moved.groups[1].pages.map((p) => p.id), ["p3", "p1"])
}

// Hide toggles.
{
  const hidden = toggleHidden(sample(), "p2")
  assert.equal(hidden.groups[0].pages[1].hidden, true)
  assert.equal(toggleHidden(hidden, "p2").groups[0].pages[1].hidden, false)
}

// Merge then split keeps every section.
{
  const merged = mergePage(sample(), "p3", "p2")
  assert.deepEqual(merged.groups[0].pages[1].section_codes, ["ceo", "kpis"])
  assert.equal(merged.groups[1].pages.length, 0)
  assert.deepEqual(codes(merged).sort(), ["ceo", "chairman", "kpis"])
  const split = splitSection(merged, "p2", "kpis", "Figures")
  assert.deepEqual(split.groups[0].pages[1].section_codes, ["ceo"])
  assert.deepEqual(split.groups[0].pages[2].section_codes, ["kpis"])
  const same = sample()
  assert.equal(mergePage(same, "p1", "p1"), same)
  // A one-section page cannot be split.
  const single = sample()
  assert.equal(splitSection(single, "p1", "chairman", "x"), single)
}

// Only empty groups and pages delete.
{
  const s = sample()
  assert.equal(deleteGroup(s, "g1"), s)
  assert.equal(deletePage(s, "p1"), s)
  const withExtra = addPage(addGroup(s, "Extra"), "g1", "New page")
  const extraPage = withExtra.groups[0].pages[2]
  assert.deepEqual(extraPage.section_codes, [])
  assert.equal(deletePage(withExtra, extraPage.id).groups[0].pages.length, 2)
  const emptyGroup = withExtra.groups[2]
  assert.equal(deleteGroup(withExtra, emptyGroup.id).groups.length, 2)
}

// Sections on no page, and removing a stale code.
{
  const sections = [
    { section_code: "chairman", title: "Chairman" },
    { section_code: "esg", title: "ESG" },
  ]
  assert.deepEqual(sectionsNotOnSite(sample(), sections).map((s) => s.section_code), ["esg"])
  const removed = removeSectionFromPage(sample(), "p3", "kpis")
  assert.deepEqual(removed.groups[1].pages[0].section_codes, [])
  const added = addPage(sample(), "g2", "ESG", "esg")
  assert.deepEqual(added.groups[1].pages[1].section_codes, ["esg"])
}

// Drag move: gaps are counted before the page is taken out.
{
  const ids = (s: WebSitemap, g: number) => s.groups[g].pages.map((p) => p.id)
  // p1 down below p2 = gap 2 in its own group.
  assert.deepEqual(ids(movePageTo(sample(), "p1", "g1", 2), 0), ["p2", "p1"])
  // p2 up to the top = gap 0.
  assert.deepEqual(ids(movePageTo(sample(), "p2", "g1", 0), 0), ["p2", "p1"])
  // Dropping a page in the gap right next to it changes nothing.
  assert.deepEqual(ids(movePageTo(sample(), "p1", "g1", 1), 0), ["p1", "p2"])
  // Into another group, between nothing and Figures.
  const across = movePageTo(sample(), "p1", "g2", 0)
  assert.deepEqual(ids(across, 0), ["p2"])
  assert.deepEqual(ids(across, 1), ["p1", "p3"])
  // A huge gap index is clamped to the end.
  assert.deepEqual(ids(movePageTo(sample(), "p1", "g2", 99), 1), ["p3", "p1"])
  assert.deepEqual(codes(across).sort(), ["ceo", "chairman", "kpis"])
}

// Tray chips: a new page in a gap, or onto a page; never a duplicate.
{
  const asPage = addSectionAsPage(sample(), "esg", "ESG", "g1", 1)
  assert.deepEqual(asPage.groups[0].pages[1].section_codes, ["esg"])
  assert.equal(asPage.groups[0].pages[1].title, "ESG")
  const onPage = addSectionToPage(sample(), "esg", "p3")
  assert.deepEqual(onPage.groups[1].pages[0].section_codes, ["kpis", "esg"])
  const s = sample()
  assert.equal(addSectionAsPage(s, "ceo", "CEO", "g2", 0), s)
  assert.equal(addSectionToPage(s, "ceo", "p3"), s)
}

console.log("webSitemapEdits: all checks passed")
