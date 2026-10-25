/**
 * Self-check for the orientation helpers. No framework — run it with:
 *   node lib/orientation.test.ts
 *
 * The thing worth pinning is that portrait and landscape never read each
 * other's picks, and never share a render-cache entry: a switch that showed
 * the portrait picture of a page under a landscape label would look like the
 * feature working while it was not.
 */

import assert from "node:assert/strict"
import { cacheKey } from "./createDesignCache.ts"
import {
  LANDSCAPE_COVER_KEYS,
  LANDSCAPE_COVER_NAMES,
  LANDSCAPE_DESIGN_KEY,
  LANDSCAPE_OPENER_KEYS,
  LANDSCAPE_OPENER_NAMES,
  LANDSCAPE_TEMPLATE_KEY,
  LANDSCAPE_TEMPLATE_KEYS,
  LANDSCAPE_TEMPLATE_NAMES,
  LANDSCAPE_TEMPLATE_SHORT_NAMES,
  LANDSCAPE_TOC_KEYS,
  LANDSCAPE_TOC_NAMES,
  PAGE_FORMAT_LABELS,
  PORTRAIT_OPENER_KEYS,
  PORTRAIT_OPENER_NAMES,
  countPicked,
  isLandscapeTemplateKey,
  keyForFormat,
  landscapeCoverKey,
  landscapeOpenerChoice,
  landscapeFormatOf,
  landscapeKeyToApply,
  landscapeOptions,
  landscapeTocKey,
  orientationOf,
  pageFormatOf,
  pageSize,
  pickedKey,
  portraitOpenerChoice,
  sectionOpenerChoice,
  sectionOpenerOptions,
  selectionForPageFormat,
} from "./orientation.ts"

// Copied from the engine (Centriton/page_templates.py KEYS and the KEYS of
// cover_templates.py, toc_templates.py, divider_templates.py) — the portrait
// menus a landscape key must never appear in.
const PORTRAIT_PAGE_KEYS = [
  "narrative_text_heavy",
  "narrative_with_stats",
  "kpi_stat_grid",
  "financial_table",
  "statement_letter",
  "executive_statement",
  "editorial_alternating",
  "editorial_movements",
  "editorial_columns",
  "statement_stat_rail",
  "stat_tiles",
  "data_tables",
]
const PORTRAIT_COVER_KEYS = ["statement", "band", "panel", "monolith"]
const PORTRAIT_TOC_KEYS = ["classic", "columns", "spread", "index", "brand_band"]
const PORTRAIT_DIVIDER_KEYS = ["rule", "banded", "full", "figure", "numeral", "split"]

// orientationOf: only an explicit "landscape" is landscape.
assert.equal(orientationOf({ orientation: "landscape" }), "landscape")
assert.equal(orientationOf({ orientation: "portrait" }), "portrait")
assert.equal(orientationOf({ orientation: null }), "portrait")
assert.equal(orientationOf({}), "portrait")
assert.equal(orientationOf(null), "portrait")
assert.equal(orientationOf(undefined), "portrait")
assert.equal(orientationOf({ orientation: "sideways" }), "portrait")
assert.equal(orientationOf({ orientation: "LANDSCAPE" }), "portrait")

// pickedKey: a page holding both picks gives each orientation its own.
const both = { template_key: "kpi_stat_grid", landscape_template_key: LANDSCAPE_TEMPLATE_KEY }
assert.equal(pickedKey(both, "portrait"), "kpi_stat_grid")
assert.equal(pickedKey(both, "landscape"), LANDSCAPE_TEMPLATE_KEY)

// A page extracted before landscape existed has no landscape field at all.
const portraitOnly = { template_key: "financial_table" }
assert.equal(pickedKey(portraitOnly, "portrait"), "financial_table")
assert.equal(pickedKey(portraitOnly, "landscape"), null)

// A landscape pick never leaks into portrait.
const landscapeOnly = { template_key: null, landscape_template_key: LANDSCAPE_TEMPLATE_KEY }
assert.equal(pickedKey(landscapeOnly, "portrait"), null)
assert.equal(pickedKey(landscapeOnly, "landscape"), LANDSCAPE_TEMPLATE_KEY)
assert.equal(pickedKey({ template_key: null, landscape_template_key: null }, "landscape"), null)

// countPicked: every page of every section with a design; none without.
const sections = [
  { design: { units: [both, portraitOnly] } },
  { design: null },
  { design: { units: [landscapeOnly, { template_key: null }] } },
  { design: { units: [] } },
]
assert.deepEqual(countPicked(sections, "portrait"), { picked: 2, total: 4 })
assert.deepEqual(countPicked(sections, "landscape"), { picked: 2, total: 4 })
assert.deepEqual(countPicked([], "portrait"), { picked: 0, total: 0 })
assert.deepEqual(
  countPicked([{ design: { units: [portraitOnly, portraitOnly] } }], "landscape"),
  { picked: 0, total: 2 },
)

// pageSize: A4 points, landscape is portrait turned sideways.
assert.deepEqual(pageSize("portrait"), { width: 595.28, height: 841.89 })
assert.deepEqual(pageSize("landscape"), { width: 841.89, height: 595.28 })
assert.ok(pageSize("portrait").height > pageSize("portrait").width)
assert.ok(pageSize("landscape").width > pageSize("landscape").height)

// The eleven landscape section templates, the default first. Copied from the
// engine's page_templates.LANDSCAPE_KEYS.
assert.deepEqual([...LANDSCAPE_TEMPLATE_KEYS], [
  "landscape_columns", "landscape_rail", "landscape_hero",
  "landscape_picture", "landscape_statement", "landscape_schedule", "landscape_essay",
  "landscape_tiles", "landscape_tables", "landscape_editorial", "landscape_portrait",
])
assert.equal(LANDSCAPE_TEMPLATE_KEYS[0], LANDSCAPE_TEMPLATE_KEY)

// The landscape covers and contents pages, the default first. Copied from the
// engine's cover_templates / toc_templates LANDSCAPE_KEYS.
assert.deepEqual([...LANDSCAPE_COVER_KEYS], ["landscape", "landscape_field", "landscape_quiet"])
assert.deepEqual([...LANDSCAPE_TOC_KEYS], ["landscape", "landscape_three", "landscape_spread"])
assert.equal(LANDSCAPE_COVER_KEYS[0], LANDSCAPE_DESIGN_KEY)
assert.equal(LANDSCAPE_TOC_KEYS[0], LANDSCAPE_DESIGN_KEY)
// The landscape openers, copied from the engine's divider_templates
// LANDSCAPE_KEYS. They follow the cover unless one is chosen on its own.
assert.deepEqual([...LANDSCAPE_OPENER_KEYS],
  ["landscape", "landscape_field", "landscape_numeral", "landscape_split"])
assert.equal(LANDSCAPE_OPENER_NAMES.landscape_split, "Split artwork")

// landscapeOpenerChoice: the saved choice, else null (follow the cover).
assert.equal(landscapeOpenerChoice(undefined), null)
assert.equal(landscapeOpenerChoice({}), null)
assert.equal(landscapeOpenerChoice({ landscape_divider_template_key: null }), null)
assert.equal(landscapeOpenerChoice({ landscape_divider_template_key: "landscape_split" }), "landscape_split")
assert.equal(landscapeOpenerChoice({ landscape_divider_template_key: "numeral" }), null,
  "a portrait or unknown key is not a choice")

// The portrait openers, copied from the engine's divider_templates KEYS, and
// the portrait choice read from its own field.
assert.deepEqual([...PORTRAIT_OPENER_KEYS], PORTRAIT_DIVIDER_KEYS)
assert.equal(PORTRAIT_OPENER_NAMES.split, "Split artwork")
assert.equal(portraitOpenerChoice(undefined), null)
assert.equal(portraitOpenerChoice(null), null)
assert.equal(portraitOpenerChoice({}), null)
assert.equal(portraitOpenerChoice({ divider_template_key: null }), null)
assert.equal(portraitOpenerChoice({ divider_template_key: "" }), null)
assert.equal(portraitOpenerChoice({ divider_template_key: "split" }), "split")
assert.equal(portraitOpenerChoice({ divider_template_key: "numeral" }), "numeral",
  "an opener chosen before this screen offered one still reads as chosen")
assert.equal(portraitOpenerChoice({ divider_template_key: "landscape_split" }), null,
  "a landscape or unknown key is not a choice")
// Each orientation reads only its own field.
const bothOpeners = { divider_template_key: "split", landscape_divider_template_key: "landscape_split" }
assert.equal(portraitOpenerChoice(bothOpeners), "split")
assert.equal(landscapeOpenerChoice(bothOpeners), "landscape_split")
const landscapeOpenerOnly = { divider_template_key: null, landscape_divider_template_key: "landscape_split" }
assert.equal(portraitOpenerChoice(landscapeOpenerOnly), null)

// landscapeOptions: one card per landscape template, nothing recommended.
const options = landscapeOptions()
assert.equal(options.length, 11)
assert.deepEqual(options.map((option) => option.key), [...LANDSCAPE_TEMPLATE_KEYS])
for (const option of options) {
  assert.deepEqual(option, {
    key: option.key,
    recommended: false,
    reason: null,
    counts: {},
    dropped: {},
  })
}
// A fresh list each call, so a caller editing one cannot change the next.
assert.notEqual(landscapeOptions(), landscapeOptions())
assert.notEqual(landscapeOptions()[0], landscapeOptions()[0])

// isLandscapeTemplateKey: the eleven, and nothing else.
for (const key of LANDSCAPE_TEMPLATE_KEYS) assert.ok(isLandscapeTemplateKey(key))
for (const key of PORTRAIT_PAGE_KEYS) assert.ok(!isLandscapeTemplateKey(key))
assert.ok(!isLandscapeTemplateKey(null))
assert.ok(!isLandscapeTemplateKey(undefined))
assert.ok(!isLandscapeTemplateKey(""))
assert.ok(!isLandscapeTemplateKey(LANDSCAPE_DESIGN_KEY))

// landscapeKeyToApply: the card on screen, else the page's pick, else the default.
const railPicked = { landscape_template_key: "landscape_rail" }
assert.equal(landscapeKeyToApply("landscape_hero", railPicked), "landscape_hero")
assert.equal(landscapeKeyToApply(null, railPicked), "landscape_rail")
assert.equal(landscapeKeyToApply(null, { landscape_template_key: null }), LANDSCAPE_TEMPLATE_KEY)
assert.equal(landscapeKeyToApply(null, {}), LANDSCAPE_TEMPLATE_KEY)
assert.equal(landscapeKeyToApply(null, null), LANDSCAPE_TEMPLATE_KEY)
// A portrait key is never applied to landscape, from either source.
assert.equal(landscapeKeyToApply("kpi_stat_grid", railPicked), "landscape_rail")
assert.equal(
  landscapeKeyToApply("kpi_stat_grid", { landscape_template_key: "kpi_stat_grid" }),
  LANDSCAPE_TEMPLATE_KEY,
)

// landscapeCoverKey / landscapeTocKey: the saved pick when valid, else the default.
assert.equal(landscapeCoverKey(null), LANDSCAPE_DESIGN_KEY)
assert.equal(landscapeCoverKey(undefined), LANDSCAPE_DESIGN_KEY)
assert.equal(landscapeCoverKey({}), LANDSCAPE_DESIGN_KEY)
assert.equal(landscapeCoverKey({ landscape_cover_template_key: null }), LANDSCAPE_DESIGN_KEY)
for (const key of LANDSCAPE_COVER_KEYS) {
  assert.equal(landscapeCoverKey({ landscape_cover_template_key: key }), key)
}
assert.equal(landscapeCoverKey({ landscape_cover_template_key: "statement" }), LANDSCAPE_DESIGN_KEY)
assert.equal(
  landscapeCoverKey({ landscape_cover_template_key: "landscape_three" }), LANDSCAPE_DESIGN_KEY)
// Each reads only its own field.
assert.equal(landscapeCoverKey({ landscape_toc_template_key: "landscape_three" }), LANDSCAPE_DESIGN_KEY)

assert.equal(landscapeTocKey(null), LANDSCAPE_DESIGN_KEY)
assert.equal(landscapeTocKey({}), LANDSCAPE_DESIGN_KEY)
for (const key of LANDSCAPE_TOC_KEYS) {
  assert.equal(landscapeTocKey({ landscape_toc_template_key: key }), key)
}
assert.equal(landscapeTocKey({ landscape_toc_template_key: "columns" }), LANDSCAPE_DESIGN_KEY)
assert.equal(landscapeTocKey({ landscape_toc_template_key: "landscape_field" }), LANDSCAPE_DESIGN_KEY)
assert.equal(landscapeTocKey({ landscape_cover_template_key: "landscape_field" }), LANDSCAPE_DESIGN_KEY)

// Every landscape key has a display name, and no two share one.
function assertNamesFor(keys: readonly string[], names: Record<string, string>, label: string) {
  assert.deepEqual(Object.keys(names).sort(), [...keys].sort(), `${label}: names cover exactly the keys`)
  const shown = keys.map((key) => names[key])
  assert.equal(new Set(shown).size, shown.length, `${label}: two keys share a name`)
  for (const name of shown) assert.ok(name && name.trim(), `${label}: an empty name`)
}
assertNamesFor(LANDSCAPE_TEMPLATE_KEYS, LANDSCAPE_TEMPLATE_NAMES, "section templates")
assertNamesFor(LANDSCAPE_TEMPLATE_KEYS, LANDSCAPE_TEMPLATE_SHORT_NAMES, "section short names")
assertNamesFor(LANDSCAPE_COVER_KEYS, LANDSCAPE_COVER_NAMES, "covers")
assertNamesFor(LANDSCAPE_TOC_KEYS, LANDSCAPE_TOC_NAMES, "contents pages")
assertNamesFor(LANDSCAPE_OPENER_KEYS, LANDSCAPE_OPENER_NAMES, "openers")
assert.equal(LANDSCAPE_TEMPLATE_SHORT_NAMES.landscape_rail, "Figure rail")
assert.equal(LANDSCAPE_TEMPLATE_NAMES.landscape_picture, "Landscape — picture spread")
assert.equal(LANDSCAPE_TEMPLATE_NAMES.landscape_statement, "Landscape — statement")
assert.equal(LANDSCAPE_TEMPLATE_NAMES.landscape_schedule, "Landscape — schedule")
assert.equal(LANDSCAPE_TEMPLATE_NAMES.landscape_essay, "Landscape — essay")
assert.equal(LANDSCAPE_TEMPLATE_NAMES.landscape_tiles, "Landscape — stat tiles")
assert.equal(LANDSCAPE_TEMPLATE_NAMES.landscape_tables, "Landscape — data tables")
assert.equal(LANDSCAPE_TEMPLATE_NAMES.landscape_editorial, "Landscape — editorial columns")
assert.equal(LANDSCAPE_TEMPLATE_NAMES.landscape_portrait, "Landscape — portrait + stats")
assert.equal(LANDSCAPE_TEMPLATE_SHORT_NAMES.landscape_picture, "Picture spread")
assert.equal(LANDSCAPE_TEMPLATE_SHORT_NAMES.landscape_statement, "Statement")
assert.equal(LANDSCAPE_TEMPLATE_SHORT_NAMES.landscape_schedule, "Schedule")
assert.equal(LANDSCAPE_TEMPLATE_SHORT_NAMES.landscape_essay, "Essay")
assert.equal(LANDSCAPE_TEMPLATE_SHORT_NAMES.landscape_tiles, "Stat tiles")
assert.equal(LANDSCAPE_TEMPLATE_SHORT_NAMES.landscape_tables, "Data tables")
assert.equal(LANDSCAPE_TEMPLATE_SHORT_NAMES.landscape_editorial, "Editorial columns")
assert.equal(LANDSCAPE_TEMPLATE_SHORT_NAMES.landscape_portrait, "Portrait + stats")

// The landscape keys are outside every portrait menu. This is what lets the
// render cache and the cover/contents preview queries go without an
// orientation in their keys: a different key IS a different entry.
for (const key of LANDSCAPE_TEMPLATE_KEYS) {
  assert.ok(!PORTRAIT_PAGE_KEYS.includes(key), `${key} collides with a portrait page`)
}
for (const key of LANDSCAPE_COVER_KEYS) {
  assert.ok(!PORTRAIT_COVER_KEYS.includes(key), `${key} collides with a portrait cover`)
}
for (const key of LANDSCAPE_TOC_KEYS) {
  assert.ok(!PORTRAIT_TOC_KEYS.includes(key), `${key} collides with a portrait contents page`)
}
for (const key of LANDSCAPE_OPENER_KEYS) {
  assert.ok(!PORTRAIT_DIVIDER_KEYS.includes(key), `${key} collides with a portrait opener`)
}

// …and so the same page, drawn in each orientation, never shares a cache key —
// nor do two landscape templates of the same page.
for (const portraitKey of PORTRAIT_PAGE_KEYS) {
  for (const landscapeKey of LANDSCAPE_TEMPLATE_KEYS) {
    const unit = { template_key: portraitKey, landscape_template_key: landscapeKey }
    const portraitCacheKey = cacheKey("cyc", "ceo_review", 1, pickedKey(unit, "portrait")!)
    const landscapeCacheKey = cacheKey("cyc", "ceo_review", 1, pickedKey(unit, "landscape")!)
    assert.notEqual(portraitCacheKey, landscapeCacheKey,
      `portrait ${portraitKey} and ${landscapeKey} share a render-cache key`)
  }
}
const landscapeCacheKeys = LANDSCAPE_TEMPLATE_KEYS.map((key) => cacheKey("cyc", "ceo_review", 1, key))
assert.equal(new Set(landscapeCacheKeys).size, LANDSCAPE_TEMPLATE_KEYS.length)

// ── the page format: portrait A4, landscape A4, presentation 16:9 ──────────

// The switch's three buttons, in the words agreed for them.
assert.deepEqual(PAGE_FORMAT_LABELS, {
  portrait: "Portrait (A4)",
  landscape: "Landscape (A4)",
  presentation: "Presentation (16:9)",
})

// Only an explicit "presentation" is the 16:9 sheet; a record from before the
// format existed (no key) or anything else is A4.
assert.equal(landscapeFormatOf({ landscape_format: "presentation" }), "presentation")
assert.equal(landscapeFormatOf({ landscape_format: "a4" }), "a4")
assert.equal(landscapeFormatOf({ landscape_format: "16:9" }), "a4")
assert.equal(landscapeFormatOf({}), "a4")
assert.equal(landscapeFormatOf(null), "a4")

// Which button is pressed. A portrait report that once was a presentation is
// portrait — the remembered sheet waits for the next landscape spell.
assert.equal(pageFormatOf({ orientation: "portrait", landscape_format: "presentation" }), "portrait")
assert.equal(pageFormatOf({ orientation: "landscape" }), "landscape")
assert.equal(pageFormatOf({ orientation: "landscape", landscape_format: "a4" }), "landscape")
assert.equal(pageFormatOf({ orientation: "landscape", landscape_format: "presentation" }), "presentation")
assert.equal(pageFormatOf(undefined), "portrait")

// What each button saves. Portrait leaves the landscape sheet alone.
assert.deepEqual(selectionForPageFormat("portrait"), { orientation: "portrait" })
assert.deepEqual(selectionForPageFormat("landscape"), { orientation: "landscape", landscape_format: "a4" })
assert.deepEqual(selectionForPageFormat("presentation"),
  { orientation: "landscape", landscape_format: "presentation" })
// …and saving a button reads back as that button.
for (const format of ["portrait", "landscape", "presentation"] as const) {
  assert.equal(pageFormatOf(selectionForPageFormat(format)), format)
}

// The presentation sheet is PowerPoint's 16:9; A4 and portrait are unchanged.
assert.deepEqual(pageSize("landscape", "presentation"), { width: 960, height: 540 })
assert.deepEqual(pageSize("landscape", "a4"), pageSize("landscape"))
assert.deepEqual(pageSize("portrait", "presentation"), pageSize("portrait"))

// The same landscape page on the two sheets never shares a cache key, and an
// A4 key is exactly what it was before the format existed.
for (const key of LANDSCAPE_TEMPLATE_KEYS) {
  assert.equal(keyForFormat(key, "a4"), key)
  const a4 = cacheKey("cyc", "ceo_review", 1, keyForFormat(key, "a4"))
  const wide = cacheKey("cyc", "ceo_review", 1, keyForFormat(key, "presentation"))
  assert.notEqual(a4, wide, `${key} shares a render-cache key across the two sheets`)
  // Still under the section's prefix, so revokeSection / revokeCycle reach it.
  assert.ok(wide.startsWith("cyc|ceo_review|"))
}

// sectionOpenerChoice: one section's own title page, per page shape, else
// null (it opens on the report's title page).
const picks = {
  section_divider_keys: { risk: "numeral", old: "landscape_split" },
  landscape_section_divider_keys: { risk: "landscape_split" },
}
assert.equal(sectionOpenerChoice(undefined, "risk", "portrait"), null)
assert.equal(sectionOpenerChoice({}, "risk", "portrait"), null)
assert.equal(sectionOpenerChoice(picks, "risk", "portrait"), "numeral")
assert.equal(sectionOpenerChoice(picks, "risk", "landscape"), "landscape_split")
assert.equal(sectionOpenerChoice(picks, "strategy", "portrait"), null)
// A key of the other page shape is never offered as this one's pick.
assert.equal(sectionOpenerChoice(picks, "old", "portrait"), null)

// sectionOpenerOptions: every title page for the page shape, none of the other's.
assert.deepEqual(sectionOpenerOptions("portrait").map((o) => o.key), [...PORTRAIT_OPENER_KEYS])
assert.deepEqual(sectionOpenerOptions("landscape").map((o) => o.key), [...LANDSCAPE_OPENER_KEYS])
for (const option of [...sectionOpenerOptions("portrait"), ...sectionOpenerOptions("landscape")]) {
  assert.ok(option.name, `${option.key} has no name`)
}

console.log("orientation: all checks passed")
