/**
 * Self-check for the loss-badge formatter. No framework — run it with:
 *   node lib/createDesignLoss.test.ts
 *
 * It exists because this string is the only warning a PM gets before picking
 * a layout that silently drops half their figures.
 */

import assert from "node:assert/strict"
import { lossText, losesContent, placedText, placementText } from "./createDesignLoss.ts"

// Nothing dropped is silence, not "0 figures not shown".
assert.equal(lossText({}), "")
assert.equal(lossText(null), "")
assert.equal(lossText({ numeric_data: 0, tables: 0 }), "")
assert.equal(losesContent({}), false)

// Figures read as a ratio when we know how many were placed.
assert.equal(lossText({ numeric_data: 39 }, { stat: 8 }), "47 figures → 8 shown")
assert.equal(lossText({ numeric_data: 4 }, { stat: 7 }), "11 figures → 7 shown")
// …and as an absolute when the template placed none.
assert.equal(lossText({ numeric_data: 5 }), "5 figures not shown")
assert.equal(lossText({ numeric_data: 1 }), "1 figure not shown")

// Singular vs plural.
assert.equal(lossText({ tables: 1 }), "1 table not shown")
assert.equal(lossText({ tables: 3 }), "3 tables not shown")
assert.equal(lossText({ narrative_blocks: 2 }), "2 paragraphs not shown")
assert.equal(lossText({ pull_quotes: 1 }), "1 quote not shown")

// Two clauses join; three or more truncate rather than run off the card.
assert.equal(lossText({ tables: 1, narrative_blocks: 2 }), "1 table not shown · 2 paragraphs not shown")
assert.ok(lossText({ numeric_data: 3, tables: 1, narrative_blocks: 2 }).endsWith(" …"))
assert.equal(lossText({ numeric_data: 3, tables: 1, narrative_blocks: 2, pull_quotes: 1 }).split("·").length, 2)

// Junk from the wire must not throw.
assert.equal(lossText({ numeric_data: "lots" as unknown as number }), "")
assert.equal(lossText({ tables: -2 }), "")
assert.equal(lossText(undefined), "")

// What was placed.
assert.equal(placedText({ stat: 5, para: 12 }), "5 figures · 12 paragraphs")
assert.equal(placedText({ para: 1 }), "1 paragraph")
assert.equal(placedText({}), "")
assert.equal(placedText(null), "")

console.log("createDesignLoss: all checks passed")

// --- placement: the normal state is now a positive confirmation ------------
assert.equal(placedText({ stat: 17, table: 2, para: 40, quote: 4 }),
  "17 figures · 2 tables · 40 paragraphs · 4 quotes")
// para and lede are the same thing to a reader; kpi_stat_grid uses lede.
assert.equal(placedText({ para: 3, lede: 2 }), "5 paragraphs")
assert.equal(placementText({ stat: 1, para: 2 }), "All 1 figure · 2 paragraphs placed")
assert.equal(placementText({}), "Nothing to place in this section")
assert.equal(placementText(null), "Nothing to place in this section")
