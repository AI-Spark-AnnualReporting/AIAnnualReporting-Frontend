/**
 * Self-check for the custom template starting points. No framework — run it with:
 *   node lib/customTemplateStartingPoints.test.ts
 *
 * The texts are the product here, so what is pinned is that every design, for
 * every mix of content and every sheet, stays inside what the designer and its
 * judge can actually deliver: one idea per sentence, page words, nothing about
 * content the section lacks, no "every page" image promise once there are
 * table pages, and none of the words that break in print, in InDesign or in
 * Arabic. Then that adding and removing an idea never touches the PM's words.
 */

import assert from "node:assert/strict"
import type { CustomPaper } from "./api/createDesign.ts"
import type { SectionBlocks } from "./api/sectionBlocks.ts"
import {
  IDEA_ROWS,
  PRESETS,
  TABLES_SENTENCE,
  activeCardId,
  addSentence,
  countContent,
  hasSentence,
  ideaRowsFor,
  presetCardsFor,
  presetSentences,
  presetText,
  presetsFor,
  removeSentence,
  toggleIdea,
  type ContentCounts,
  type IdeaRow,
} from "./customTemplateStartingPoints.ts"

const MAX = 2000
const PAPERS: CustomPaper[] = ["portrait", "landscape", "presentation"]

function counts(over: Partial<ContentCounts> = {}): ContentCounts {
  return { paragraphs: 12, figures: 0, quotes: 0, tables: 0, pages: 3, ...over }
}

/** Every mix of content the tests walk through. */
function everyMix(): ContentCounts[] {
  const mixes: ContentCounts[] = []
  const text = [
    { paragraphs: 0, pages: 1 },
    { paragraphs: 4, pages: 1 },
    { paragraphs: 20, pages: 3 },
  ]
  for (const figures of [0, 1, 2, 3, 7, 9]) {
    for (const quotes of [0, 1, 2]) {
      for (const tables of [0, 1, 2]) {
        for (const t of text) mixes.push({ ...t, figures, quotes, tables })
      }
    }
  }
  return mixes
}

// ---------------------------------------------------------------------------
// counting the content the way the engine prints it
// ---------------------------------------------------------------------------

{
  const zero = { paragraphs: 0, figures: 0, quotes: 0, tables: 0, pages: 1 }
  assert.deepEqual(countContent(null, "portrait"), zero)
  assert.deepEqual(countContent(undefined, "portrait"), zero)
  assert.deepEqual(countContent({} as SectionBlocks, "portrait"), zero)

  const long = "x".repeat(2700)
  const blocks = {
    section_code: "s",
    narrative_blocks: [
      { kind: "heading", text: "Overview" },
      { kind: "paragraph", text: long },
      { kind: "paragraph", text: "   " },
      null,
    ],
    numeric_data: [
      { label: "Revenue", value_current: "$104.7 billion" },
      { label: "Blank", value_current: "  " },
      { label: "Missing", value_current: null },
    ],
    pull_quotes: [{ text: "We delivered." }, { text: "" }],
    tables: [
      { title: "A", columns: ["", "2025"], rows: [["x", "1"]] },
      { title: "No rows", columns: ["", "2025"], rows: [] },
      { title: "No columns", columns: [], rows: [["x"]] },
      { title: "Empty row", columns: ["x"], rows: [[]] },
    ],
  } as unknown as SectionBlocks
  const portrait = countContent(blocks, "portrait")
  assert.equal(portrait.paragraphs, 2, "a heading counts, a blank paragraph does not")
  assert.equal(portrait.figures, 1, "a figure needs a value")
  assert.equal(portrait.quotes, 1, "a quote needs text")
  assert.equal(portrait.tables, 2, "a table needs columns and rows")
  assert.equal(portrait.pages, 2, "2,700 characters run past one 2,600-character page")
  assert.equal(countContent(blocks, "presentation").pages, 2)
  const short = { ...blocks, narrative_blocks: [{ kind: "paragraph", text: "x".repeat(2100) }] }
  assert.equal(countContent(short as SectionBlocks, "portrait").pages, 1)
  assert.equal(countContent(short as SectionBlocks, "presentation").pages, 2, "16:9 pages hold less")
}

// ---------------------------------------------------------------------------
// which designs are offered
// ---------------------------------------------------------------------------

{
  const ids = PRESETS.map((preset) => preset.id)
  assert.equal(new Set(ids).size, ids.length, "design ids are unique")

  const rich = counts({ figures: 7, quotes: 2 })
  assert.deepEqual(presetsFor("presentation", rich).map((p) => p.id),
    ["keynote", "numbers", "classic", "shapes", "magazine", "split", "momentum", "gallery"])
  assert.ok(!presetsFor("portrait", rich).some((p) => p.id === "keynote"), "keynote is 16:9 only")
  assert.ok(!presetsFor("landscape", rich).some((p) => p.id === "keynote"))
  assert.ok(presetsFor("portrait", counts({ figures: 3 })).some((p) => p.id === "numbers"))
  assert.ok(!presetsFor("portrait", counts({ figures: 2 })).some((p) => p.id === "numbers"),
    "numbers as heroes needs three or more figures")

  for (const paper of PAPERS) {
    for (const mix of everyMix()) {
      assert.ok(presetsFor(paper, mix).length >= 6, `at least 6 designs on ${paper}`)
    }
  }
}

// ---------------------------------------------------------------------------
// every design, for every mix and sheet, stays inside what can be delivered
// ---------------------------------------------------------------------------

const PAGE_WORDS = /every (page|slide)|alternat|from page to page|spread|most (pages|slides)/i
const RHYTHM = /alternat|from page to page|swap/i
const IMAGE_EVERY = /image[^.]*\b(every|each) (page|slide)\b|\b(every|each) (page|slide)\b[^.]*image/i
// Words that break in print, in InDesign or in Arabic, or that the judge or the
// designer cannot honour — see the module header for why each one is here.
const BANNED = new RegExp(
  "\\b(left|right|bleeds?|off the edge|running off|corners?|page edges|top edge|bottom edge|" +
    "along the bottom|titles?|headings?|italics?|drop cap|hairlines?|charts?|graphs?|icons?|" +
    "photos?|gradients?|captions?|numbering|accent|big type)\\b",
  "i",
)

function assertSentenceShape(sentence: string, where: string): void {
  assert.ok(/^[A-Z]/.test(sentence), `${where}: starts with a capital: ${sentence}`)
  assert.ok(sentence.endsWith("."), `${where}: ends with a full stop: ${sentence}`)
  assert.ok(!/[.!?] /.test(sentence.slice(0, -1)), `${where}: one sentence only: ${sentence}`)
  assert.ok(!sentence.includes("  "), `${where}: no double spaces: ${sentence}`)
  const banned = sentence.match(BANNED)
  assert.equal(banned, null, `${where}: banned word "${banned?.[0]}" in: ${sentence}`)
}

{
  const allTexts = new Set<string>()
  for (const paper of PAPERS) {
    for (const mix of everyMix()) {
      for (const preset of presetsFor(paper, mix)) {
        const where = `${preset.id} on ${paper} ${JSON.stringify(mix)}`
        const sentences = presetSentences(preset, mix)
        const text = presetText(preset, mix)
        allTexts.add(text)

        assert.ok(sentences.length >= 4 && sentences.length <= 9, `${where}: 4-9 sentences, got ${sentences.length}`)
        assert.ok(text.length <= 1000, `${where}: ${text.length} characters`)
        assert.equal(new Set(sentences).size, sentences.length, `${where}: no sentence twice`)
        for (const sentence of sentences) assertSentenceShape(sentence, where)

        assert.ok(PAGE_WORDS.test(text), `${where}: has page words`)
        if (mix.figures === 0) assert.ok(!/key figure|giant number|numeral/i.test(text), `${where}: no figures`)
        if (mix.quotes === 0) assert.ok(!/\bquotes?\b/i.test(text), `${where}: no quotes`)
        if (mix.tables === 0) {
          assert.ok(!/\btables?\b/i.test(text), `${where}: no tables`)
        } else {
          assert.equal(sentences[sentences.length - 1], TABLES_SENTENCE, `${where}: tables sentence last`)
          for (const sentence of sentences) {
            assert.ok(!IMAGE_EVERY.test(sentence), `${where}: no image on every page with tables: ${sentence}`)
          }
        }
        if (mix.pages < 2) {
          for (const sentence of sentences) {
            assert.ok(!RHYTHM.test(sentence), `${where}: no page rhythm on one page: ${sentence}`)
          }
        }
      }
      const cards = presetCardsFor(paper, mix)
      assert.equal(new Set(cards.map((c) => c.text)).size, cards.length, "every card's text differs")
    }
  }
  assert.ok(allTexts.size > 100, "the designs really change with the content")

  // One exact text, so a wording change is a deliberate one.
  const split = PRESETS.find((p) => p.id === "split")!
  assert.equal(
    presetText(split, counts({ paragraphs: 12, pages: 3 })),
    "Split every page into two halves: one a solid block of brand colour reaching the side edge " +
      "of the page, the other white and holding the text. Swap the coloured half and the text half " +
      "from page to page. Keep the coloured half bold and uncluttered. Put an image area on every " +
      "page. Keep the text calm and easy to read, in one or two columns.",
  )
}

// ---------------------------------------------------------------------------
// idea rows
// ---------------------------------------------------------------------------

{
  const rowIds = (mix: ContentCounts) => ideaRowsFor(mix).map((row) => row.id)
  assert.deepEqual(rowIds(counts({ figures: 3, quotes: 2, tables: 1 })),
    ["pictures", "figures", "quotes", "text", "pages", "feel", "tables"])
  assert.deepEqual(rowIds(counts()), ["pictures", "text", "pages", "feel"])
  assert.ok(!rowIds(counts({ paragraphs: 0, pages: 1 })).includes("text"))

  const pictures = (mix: ContentCounts) => ideaRowsFor(mix).find((row) => row.id === "pictures")!.ideas
  assert.ok(pictures(counts()).some((idea) => idea.includes("on every page")))
  assert.ok(!pictures(counts({ tables: 1 })).some((idea) => idea.includes("on every page")))
  assert.ok(pictures(counts({ tables: 1 })).some((idea) => idea.includes("on most pages")))

  const figures = (mix: ContentCounts) => ideaRowsFor(mix).find((row) => row.id === "figures")!.ideas
  assert.ok(figures(counts({ figures: 8 })).some((idea) => idea.includes("wide band")))
  assert.ok(!figures(counts({ figures: 9 })).some((idea) => idea.includes("wide band")),
    "nine figures don't fit one band")

  const pages = (mix: ContentCounts) => ideaRowsFor(mix).find((row) => row.id === "pages")!.ideas
  assert.ok(!pages(counts({ pages: 1 })).some((idea) => RHYTHM.test(idea) || idea.includes("Mirror")))

  const ideas = IDEA_ROWS.flatMap((row) => row.ideas.map((idea) => idea.text))
  assert.equal(new Set(ideas).size, ideas.length, "no idea twice")
  for (const idea of ideas) assertSentenceShape(idea, "idea")
  assert.ok(IDEA_ROWS.every((row) => row.ideas.length >= 2), "every row offers a choice")

  // hasSentence finds an idea by its exact words, so no idea may sit inside a
  // longer sentence (it would show as "in" when only the longer one is).
  const presetLines = PRESETS.flatMap((preset) => preset.sentences.map((s) => s.text))
  for (const idea of ideas) {
    for (const other of [...ideas, ...presetLines, TABLES_SENTENCE]) {
      assert.ok(other === idea || !other.includes(idea), `"${idea}" sits inside "${other}"`)
    }
  }
}

// ---------------------------------------------------------------------------
// adding and removing one sentence
// ---------------------------------------------------------------------------

{
  const S = "Use one wide column."
  assert.equal(addSentence("", S), S)
  assert.equal(addSentence("   \n", S), S)
  assert.equal(addSentence("Foo.", S), `Foo. ${S}`)
  assert.equal(addSentence("Foo. \n", S), `Foo. ${S}`)
  assert.equal(addSentence("big pictures", S), `big pictures. ${S}`, "a full stop keeps two wishes apart")
  assert.equal(addSentence("هل يمكن؟", S), `هل يمكن؟ ${S}`)
  assert.equal(addSentence("Like this:", S), `Like this: ${S}`)

  assert.equal(removeSentence(`A. ${S} B.`, S), "A. B.")
  assert.equal(removeSentence(`${S} B.`, S), "B.")
  assert.equal(removeSentence(`A. ${S}`, S), "A.")
  assert.equal(removeSentence(S, S), "")
  assert.equal(removeSentence(`${S} A. ${S}`, S), "A.")
  assert.equal(removeSentence("A.\nB. " + S, S), "A.\nB.", "the PM's line breaks are kept")
  assert.equal(removeSentence("  my own words  ", S), "  my own words  ", "nothing to remove: untouched")
  assert.ok(hasSentence(`A. ${S}`, S) && !hasSentence("A.", S))
}

{
  const any: IdeaRow = { id: "any", label: "Any", pickOne: false, ideas: ["One idea.", "Two idea."] }
  const one: IdeaRow = { id: "one", label: "One", pickOne: true, ideas: ["Calm.", "Bold."] }

  assert.equal(toggleIdea("Mine.", any, "One idea.", MAX), "Mine. One idea.")
  assert.equal(toggleIdea("Mine. One idea.", any, "One idea.", MAX), "Mine.")
  assert.equal(toggleIdea("Mine. One idea.", any, "Two idea.", MAX), "Mine. One idea. Two idea.")
  assert.equal(toggleIdea("Mine. Calm.", one, "Bold.", MAX), "Mine. Bold.", "pick one swaps")
  assert.equal(toggleIdea("Mine. Bold.", one, "Bold.", MAX), "Mine.")

  const full = "x".repeat(MAX - 2) + "."
  assert.equal(toggleIdea(full, any, "One idea.", MAX), null, "does not fit")
  const exact = "x".repeat(MAX - "One idea.".length - 2) + "."
  assert.equal(toggleIdea(exact, any, "One idea.", MAX)?.length, MAX, "exactly the limit is fine")
  assert.equal(toggleIdea(`${"x".repeat(MAX - 10)}. One idea.`.slice(-MAX), any, "One idea.", MAX)?.endsWith("x."), true,
    "taking one out always fits")
  const swapRoom = `${"x".repeat(MAX - 8)}. Calm.`
  assert.ok(toggleIdea(swapRoom, one, "Bold.", MAX) !== null, "a swap frees the room it needs")
}

{
  // Picking any idea after any design, then taking it out again, gives back
  // exactly the design's text.
  for (const paper of PAPERS) {
    for (const mix of [counts(), counts({ figures: 7, quotes: 2, tables: 1 })]) {
      for (const card of presetCardsFor(paper, mix)) {
        for (const row of ideaRowsFor(mix).filter((r) => !r.pickOne)) {
          for (const idea of row.ideas) {
            if (hasSentence(card.text, idea)) continue
            const added = toggleIdea(card.text, row, idea, MAX)
            assert.ok(added !== null)
            assert.equal(toggleIdea(added!, row, idea, MAX), card.text, `${card.id} + ${idea}`)
          }
        }
      }
    }
  }
}

{
  const cards = presetCardsFor("portrait", counts())
  assert.equal(activeCardId(cards[0].text, cards), cards[0].id)
  assert.equal(activeCardId(`  ${cards[1].text}\n`, cards), cards[1].id)
  assert.equal(activeCardId(`${cards[0].text} More.`, cards), null)
  assert.equal(activeCardId("", cards), null)
}

console.log("customTemplateStartingPoints: all checks passed")
