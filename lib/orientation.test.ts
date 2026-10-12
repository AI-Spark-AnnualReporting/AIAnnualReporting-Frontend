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
  LANDSCAPE_DESIGN_KEY,
  LANDSCAPE_TEMPLATE_KEY,
  countPicked,
  landscapeOptions,
  orientationOf,
  pageSize,
  pickedKey,
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
]
const PORTRAIT_COVER_KEYS = ["statement", "band", "panel", "monolith"]
const PORTRAIT_TOC_KEYS = ["classic", "columns", "spread", "index", "brand_band"]
const PORTRAIT_DIVIDER_KEYS = ["rule", "banded", "full", "figure", "numeral"]

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

// landscapeOptions: one card, the landscape template, nothing recommended.
const options = landscapeOptions()
assert.equal(options.length, 1)
assert.deepEqual(options[0], {
  key: LANDSCAPE_TEMPLATE_KEY,
  recommended: false,
  reason: null,
  counts: {},
  dropped: {},
})
// A fresh list each call, so a caller editing one cannot change the next.
assert.notEqual(landscapeOptions(), landscapeOptions())

// The landscape keys are outside every portrait menu. This is what lets the
// render cache and the cover/contents preview queries go without an
// orientation in their keys: a different key IS a different entry.
assert.ok(!PORTRAIT_PAGE_KEYS.includes(LANDSCAPE_TEMPLATE_KEY))
assert.ok(!PORTRAIT_COVER_KEYS.includes(LANDSCAPE_DESIGN_KEY))
assert.ok(!PORTRAIT_TOC_KEYS.includes(LANDSCAPE_DESIGN_KEY))
assert.ok(!PORTRAIT_DIVIDER_KEYS.includes(LANDSCAPE_DESIGN_KEY))

// …and so the same page, drawn in each orientation, never shares a cache key.
for (const portraitKey of PORTRAIT_PAGE_KEYS) {
  const unit = { template_key: portraitKey, landscape_template_key: LANDSCAPE_TEMPLATE_KEY }
  const portraitCacheKey = cacheKey("cyc", "ceo_review", 1, pickedKey(unit, "portrait")!)
  const landscapeCacheKey = cacheKey("cyc", "ceo_review", 1, pickedKey(unit, "landscape")!)
  assert.notEqual(portraitCacheKey, landscapeCacheKey,
    `portrait ${portraitKey} and landscape share a render-cache key`)
}

console.log("orientation: all checks passed")
