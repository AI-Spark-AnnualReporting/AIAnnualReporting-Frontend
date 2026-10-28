/**
 * Starting points for a custom page template request: complete designs a PM
 * can pick, and single ideas they can add to their own words.
 *
 * WHY THE TEXTS READ THE WAY THEY DO. A request is not read as a whole: the
 * brief model splits it into one "wish" per sentence, and after printing a
 * vision model judges every wish, strictly, on pictures of the sheets
 * (AIAnnualReporting custom_template_service.py). So:
 *   - one visible, self-contained idea per sentence;
 *   - page words ("every page", "alternate", "from page to page", "spread")
 *     make the designer compose every page, not just the first;
 *   - "Spread the key figures / quotes ..." and "an image area on every page"
 *     are measured by code. The tables print on extra pages at the end, which
 *     can't each carry an image, so with tables those sentences say "most";
 *   - never the section title: the report prints it on the section's own
 *     opener page, and the designed pages print without it;
 *   - never left/right (they mirror in Arabic), "running off"/"bleed"
 *     (content past the sheet shrinks the whole section), drop caps or
 *     italics (Arabic, and no italic faces are installed), "hairline" (the
 *     judge sees 72-dpi pictures), text "in the accent colour" (pale accents
 *     fail the readability check);
 *   - only the content the section really has, and no page rhythm for a
 *     section whose text fits on about one page.
 * customTemplateStartingPoints.test.ts pins every one of these.
 *
 * Pure, with type-only imports, so `node` can run its test directly.
 */

import type { CustomPaper } from "@/lib/api/createDesign"
import type { SectionBlocks, SectionTableBlock } from "@/lib/api/sectionBlocks"

/** What the section really prints, counted the way the engine counts it. */
export interface ContentCounts {
  /** Paragraphs and subheadings that have text. */
  paragraphs: number
  /** Key figures with a value. */
  figures: number
  /** Quotes with text. */
  quotes: number
  /** Tables with at least one column and one row. */
  tables: number
  /** About how many pages the text fills (the backend's estimate_sheets). */
  pages: number
}

/** A test on the content that decides whether a sentence, row or design applies. */
export type ContentTest = (counts: ContentCounts) => boolean

/** One sentence of a starting point; it always applies when `when` is absent. */
export interface Sentence {
  text: string
  when?: ContentTest
}

/** A complete design: a full request, put together for the section's content. */
export interface Preset {
  id: string
  name: string
  tagline: string
  /** Offered only on these sheets (on every sheet when absent). */
  papers?: CustomPaper[]
  /** Offered only when this holds (always when absent). */
  offerWhen?: ContentTest
  sentences: Sentence[]
}

/** A complete design as the panel shows it, with its text already put together. */
export interface PresetCard {
  id: string
  name: string
  tagline: string
  text: string
}

/** A row of idea chips as the panel shows it: only the ideas that apply. */
export interface IdeaRow {
  id: string
  label: string
  /** Choosing one idea in the row takes the row's other ideas out. */
  pickOne: boolean
  ideas: string[]
}

/** A row of idea chips before the section's content has been applied. */
export interface IdeaRowDefinition {
  id: string
  label: string
  pickOne: boolean
  when?: ContentTest
  ideas: Sentence[]
}

// --------------------------------------------------------------------------
// counting the content
// --------------------------------------------------------------------------

/** Characters of text one designed page holds (the backend's _CHARS_PER_DESIGNED_SHEET). */
const CHARS_PER_PAGE = 2600
const CHARS_PER_PRESENTATION_PAGE = 2000

/** The trimmed text, or "" for anything that is not a string. */
function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

/** Whether a table prints: the engine drops one with no columns or no rows. */
function tablePrints(table: SectionTableBlock | null | undefined): boolean {
  const columns = table?.columns
  const rows = table?.rows
  return Array.isArray(columns) && columns.length > 0 && Array.isArray(rows) && rows.length > 0
}

/**
 * Characters of body text (subheadings left out): the backend's
 * prose_characters, which its page estimate divides by.
 */
export function proseCharacters(blocks: SectionBlocks | null | undefined): number {
  let total = 0
  for (const block of blocks?.narrative_blocks ?? []) {
    const text = cleanText(block?.text)
    if (text && block.kind !== "heading") total += text.length
  }
  return total
}

/**
 * Count what the section prints, with the engine's filters (page_filler._blocks):
 * a figure needs a value, a quote needs text, a table needs columns and rows.
 */
export function countContent(
  blocks: SectionBlocks | null | undefined,
  paper: CustomPaper,
): ContentCounts {
  let paragraphs = 0
  for (const block of blocks?.narrative_blocks ?? []) {
    if (cleanText(block?.text)) paragraphs += 1
  }

  let figures = 0
  for (const figure of blocks?.numeric_data ?? []) {
    if (cleanText(figure?.value_current)) figures += 1
  }

  let quotes = 0
  for (const quote of blocks?.pull_quotes ?? []) {
    if (cleanText(quote?.text)) quotes += 1
  }

  let tables = 0
  for (const table of blocks?.tables ?? []) {
    if (tablePrints(table)) tables += 1
  }

  const perPage = paper === "presentation" ? CHARS_PER_PRESENTATION_PAGE : CHARS_PER_PAGE
  const pages = Math.max(1, Math.ceil(proseCharacters(blocks) / perPage))
  return { paragraphs, figures, quotes, tables, pages }
}

// --------------------------------------------------------------------------
// the content tests the texts use
// --------------------------------------------------------------------------

function hasFigures(counts: ContentCounts): boolean {
  return counts.figures > 0
}

function hasThreeOrMoreFigures(counts: ContentCounts): boolean {
  return counts.figures >= 3
}

/** A band across one page holds a handful of figures, not fifteen. */
function hasFewFigures(counts: ContentCounts): boolean {
  return counts.figures > 0 && counts.figures <= 8
}

function hasQuotes(counts: ContentCounts): boolean {
  return counts.quotes > 0
}

function hasTables(counts: ContentCounts): boolean {
  return counts.tables > 0
}

function noTables(counts: ContentCounts): boolean {
  return counts.tables === 0
}

function hasParagraphs(counts: ContentCounts): boolean {
  return counts.paragraphs > 0
}

/** Rhythm across pages ("alternate", "from page to page") needs two or more. */
function hasSeveralPages(counts: ContentCounts): boolean {
  return counts.pages >= 2
}

// --------------------------------------------------------------------------
// the texts
// --------------------------------------------------------------------------

/** Ends every complete design when the section has tables; also the first table idea. */
export const TABLES_SENTENCE = "Set the tables at the end with a brand-coloured header row."

/** The complete designs, in the order the panel offers them. */
export const PRESETS: Preset[] = [
  {
    id: "keynote",
    name: "Keynote slides",
    tagline: "Bold keynote slides: big moments, a brand-colour band and roomy text.",
    papers: ["presentation"],
    sentences: [
      { text: "Design every slide in the style of a confident keynote presentation." },
      { text: "Run a thick band of brand colour down one side edge of every slide.", when: noTables },
      { text: "Run a thick band of brand colour down one side edge of every slide of text.", when: hasTables },
      { text: "Put an image area on every slide.", when: noTables },
      { text: "Put an image area on most slides.", when: hasTables },
      { text: "Alternate two or three slide layouts, so the deck has rhythm.", when: hasSeveralPages },
      { text: "Set the text in two roomy columns." },
      { text: "Spread the key figures through the slides, each set very large as a big moment.", when: hasFigures },
      { text: "Spread the quotes through the slides, each set very large as a big moment.", when: hasQuotes },
    ],
  },
  {
    id: "numbers",
    name: "Numbers as heroes",
    tagline: "Your key figures as giant numbers on blocks of brand colour, like posters.",
    offerWhen: hasThreeOrMoreFigures,
    sentences: [
      { text: "Make the key figures the heroes of this section, like a series of bold posters." },
      { text: "Spread the key figures through the section as giant numbers." },
      { text: "Set each giant number inside a bold block of brand colour that reaches the side edge of the page." },
      { text: "Move the giant numbers to a different place from page to page.", when: hasSeveralPages },
      { text: "Keep the text calm and easy to read, in one or two columns." },
      { text: "Put an image area on every page.", when: noTables },
      { text: "Put an image area on most pages.", when: hasTables },
      { text: "Spread the quotes through the section, each set large in a serif.", when: hasQuotes },
    ],
  },
  {
    id: "bento",
    name: "Bento tiles",
    tagline: "Rounded tiles of text, pictures and colour, fitted together like a bento box.",
    sentences: [
      {
        text: "Design every page as a bento box of rounded tiles in different sizes, fitted together with even gaps.",
        when: noTables,
      },
      {
        text: "Design every page of text as a bento box of rounded tiles in different sizes, fitted together with even gaps.",
        when: hasTables,
      },
      { text: "Give every page at least one image tile and one solid brand-colour tile.", when: noTables },
      { text: "Give most pages an image tile and a solid brand-colour tile.", when: hasTables },
      { text: "Alternate two or three tile arrangements from page to page.", when: hasSeveralPages },
      { text: "Make the first page the most striking, with the largest image tile." },
      {
        text: "Spread the key figures across the pages, each in its own tile with the number large.",
        when: hasFigures,
      },
      { text: "Spread the quotes across the pages, each set large in its own brand-coloured tile.", when: hasQuotes },
      { text: "Keep the text tiles roomy and easy to read." },
    ],
  },
  {
    id: "shapes",
    name: "Shape play",
    tagline: "Pictures cut into circles, diamonds and arches, with big brand-colour shapes.",
    sentences: [
      {
        text:
          "Make this section playful, with one or two large brand-colour shapes beside the text, " +
          "such as a half-circle or a triangle against the side edge.",
      },
      { text: "Cut the image areas into bold shapes such as circles, diamonds and arches, instead of rectangles." },
      { text: "Put an image area on every page.", when: noTables },
      { text: "Put an image area on most pages.", when: hasTables },
      {
        text: "Alternate two or three page layouts, so the shapes move around from page to page.",
        when: hasSeveralPages,
      },
      {
        text: "Spread the key figures through the section, each inside a brand-coloured circle like a badge.",
        when: hasFigures,
      },
      { text: "Spread the quotes through the section, each set large beside a big brand-colour shape.", when: hasQuotes },
      { text: "Keep the text calm and easy to read, in one or two columns." },
    ],
  },
  {
    id: "magazine",
    name: "Magazine feature",
    tagline: "A business-magazine feature: a big opening picture, columns and pull quotes.",
    sentences: [
      { text: "Lay this section out like a feature in a business magazine." },
      { text: "Open with a wide image area across the top half of the first page, reaching both side edges." },
      { text: "Set the first paragraph large, as an introduction." },
      { text: "Set the text in narrow magazine columns with a thin brand-colour rule between them." },
      { text: "Put an image area on every page, in a different place each time.", when: noTables },
      { text: "Put an image area on most pages, in a different place each time.", when: hasTables },
      { text: "Spread the quotes through the section as big serif pull quotes.", when: hasQuotes },
      {
        text: "Gather the key figures in a slim strip down one side of the pages, with the numbers set large.",
        when: hasFigures,
      },
    ],
  },
  {
    id: "split",
    name: "Split screen",
    tagline: "Every page split in two: a block of brand colour and the text, swapping sides.",
    sentences: [
      {
        text:
          "Split every page into two halves: one a solid block of brand colour reaching the side edge " +
          "of the page, the other white and holding the text.",
        when: noTables,
      },
      {
        text:
          "Split every page of text into two halves: one a solid block of brand colour reaching the side " +
          "edge of the page, the other white and holding the text.",
        when: hasTables,
      },
      { text: "Swap the coloured half and the text half from page to page.", when: hasSeveralPages },
      { text: "Keep the coloured half bold and uncluttered." },
      { text: "Put an image area on every page.", when: noTables },
      { text: "Put an image area on most pages.", when: hasTables },
      { text: "Keep the text calm and easy to read, in one or two columns." },
      {
        text: "Spread the quotes through the section, each set very large inside a coloured half.",
        when: hasQuotes,
      },
      {
        text: "Spread the key figures through the section, each set large inside a coloured half.",
        when: hasFigures,
      },
    ],
  },
  {
    id: "momentum",
    name: "Momentum",
    tagline: "Forward motion: brand-colour bands with slanted ends, and slanted picture shapes.",
    sentences: [
      { text: "Give this section a feeling of forward motion and growth." },
      { text: "Run a bold band of brand colour with slanted ends across every page.", when: noTables },
      { text: "Run a bold band of brand colour with slanted ends across every page of text.", when: hasTables },
      { text: "Set the band at a different height from page to page.", when: hasSeveralPages },
      { text: "Cut the image areas into slanted parallelograms." },
      { text: "Put an image area on every page.", when: noTables },
      { text: "Put an image area on most pages.", when: hasTables },
      { text: "Keep the text level, on white and easy to read." },
      {
        text: "Spread the key figures through the section, each set large on a band of brand colour.",
        when: hasFigures,
      },
      { text: "Spread the quotes through the section, each set large beside a band.", when: hasQuotes },
    ],
  },
  {
    id: "gallery",
    name: "Quiet gallery",
    tagline: "Calm and premium: white space, arched picture windows and one elegant column.",
    sentences: [
      { text: "Make this section calm, premium and confident, like a gallery catalogue." },
      { text: "Set the text in one comfortable column, off-centre, with a wide margin beside it." },
      { text: "Shape the image areas as tall arches, like gallery windows." },
      { text: "Put an image area on every page.", when: noTables },
      { text: "Put an image area on most pages.", when: hasTables },
      { text: "Place the image area on alternating sides of the page from page to page.", when: hasSeveralPages },
      { text: "Use the brand colour quietly, in thin rules and small blocks, never in large coloured areas." },
      { text: "Spread the quotes through the section, hung in the wide margin in a refined serif.", when: hasQuotes },
      {
        text: "Spread the key figures through the section, set in the wide margin as large, elegant numerals.",
        when: hasFigures,
      },
    ],
  },
]

/**
 * The idea chips, in rows. A sentence that also appears in a complete design
 * is the same on purpose: after that design is picked, its chip shows as in.
 */
export const IDEA_ROWS: IdeaRowDefinition[] = [
  {
    id: "pictures",
    label: "Pictures",
    pickOne: false,
    ideas: [
      { text: "Put an image area on every page, in a different place each time.", when: noTables },
      { text: "Put an image area on most pages, in a different place each time.", when: hasTables },
      { text: "Open with a wide image area across the top half of the first page, reaching both side edges." },
      { text: "Cut the image areas into shapes such as circles, diamonds and arches." },
    ],
  },
  {
    id: "figures",
    label: "Key figures",
    pickOne: true,
    when: hasFigures,
    ideas: [
      { text: "Spread the key figures through the section, each set huge like a poster." },
      {
        text: "Put the key figures in a wide band of brand colour across the first page, above the text.",
        when: hasFewFigures,
      },
      { text: "Spread the key figures through the section, each inside a brand-coloured circle like a badge." },
    ],
  },
  {
    id: "quotes",
    label: "Quotes",
    pickOne: true,
    when: hasQuotes,
    ideas: [
      { text: "Spread the quotes through the section, each set large between the paragraphs." },
      { text: "Hang the quotes in a wide side margin, in the brand colour." },
      { text: "Spread the quotes through the section, each on its own solid panel of brand colour." },
    ],
  },
  {
    id: "text",
    label: "Text",
    pickOne: true,
    when: hasParagraphs,
    ideas: [
      { text: "Set the text in two columns with a thin brand-colour rule between them." },
      { text: "Set the text in three narrow columns, like a newspaper." },
      { text: "Set the text in one wide, calm column with generous margins." },
    ],
  },
  {
    id: "pages",
    label: "Pages",
    pickOne: false,
    ideas: [
      { text: "Alternate two or three page layouts through the section.", when: hasSeveralPages },
      { text: "Make the first page the boldest, with a big block of brand colour and a large image area." },
      { text: "Mirror the layout on every other page, like the facing pages of a book.", when: hasSeveralPages },
      { text: "Start the text with a large introduction paragraph.", when: hasParagraphs },
    ],
  },
  {
    id: "feel",
    label: "Feel",
    pickOne: true,
    ideas: [
      { text: "Keep the design calm and premium, with lots of white space and thin rules." },
      { text: "Make the design bold and confident, with solid blocks of brand colour and strong contrast." },
      {
        text:
          "Make the design playful, with big brand-colour circles and half-moons beside the text, " +
          "against the side edges.",
      },
    ],
  },
  {
    id: "tables",
    label: "Tables",
    pickOne: false,
    when: hasTables,
    ideas: [
      { text: TABLES_SENTENCE },
      { text: "Line up the numbers in the tables." },
      { text: "Give the tables generous row spacing." },
      { text: "Shade every other table row in a light tint of the brand colour." },
    ],
  },
]

// --------------------------------------------------------------------------
// putting the texts together for one section
// --------------------------------------------------------------------------

/** Whether a sentence applies to this content. */
function applies(sentence: Sentence, counts: ContentCounts): boolean {
  return !sentence.when || sentence.when(counts)
}

/** Whether a complete design is offered on this sheet for this content. */
function isOffered(preset: Preset, paper: CustomPaper, counts: ContentCounts): boolean {
  if (preset.papers && !preset.papers.includes(paper)) return false
  if (preset.offerWhen && !preset.offerWhen(counts)) return false
  return true
}

/** The complete designs offered on this sheet for this content, in order. */
export function presetsFor(paper: CustomPaper, counts: ContentCounts): Preset[] {
  return PRESETS.filter((preset) => isOffered(preset, paper, counts))
}

/** A design's sentences for this content, with the tables sentence last when there are tables. */
export function presetSentences(preset: Preset, counts: ContentCounts): string[] {
  const sentences = preset.sentences
    .filter((sentence) => applies(sentence, counts))
    .map((sentence) => sentence.text)
  if (hasTables(counts)) sentences.push(TABLES_SENTENCE)
  return sentences
}

/** A design's full request for this content. */
export function presetText(preset: Preset, counts: ContentCounts): string {
  return presetSentences(preset, counts).join(" ")
}

/** The cards the panel shows: every offered design with its text put together. */
export function presetCardsFor(paper: CustomPaper, counts: ContentCounts): PresetCard[] {
  return presetsFor(paper, counts).map((preset) => ({
    id: preset.id,
    name: preset.name,
    tagline: preset.tagline,
    text: presetText(preset, counts),
  }))
}

/** The card whose text is exactly the request (ignoring outer spaces), or null. */
export function activeCardId(text: string, cards: PresetCard[]): string | null {
  const request = text.trim()
  if (!request) return null
  const card = cards.find((candidate) => candidate.text === request)
  return card ? card.id : null
}

/** The idea rows for this content: rows and ideas the section can't use are left out. */
export function ideaRowsFor(counts: ContentCounts): IdeaRow[] {
  const rows: IdeaRow[] = []
  for (const row of IDEA_ROWS) {
    if (row.when && !row.when(counts)) continue
    const ideas = row.ideas.filter((idea) => applies(idea, counts)).map((idea) => idea.text)
    if (ideas.length === 0) continue
    rows.push({ id: row.id, label: row.label, pickOne: row.pickOne, ideas })
  }
  return rows
}

// --------------------------------------------------------------------------
// adding and removing one sentence
// --------------------------------------------------------------------------

/** Punctuation that already ends a sentence, so nothing needs adding before the next. */
const SENTENCE_ENDINGS = [".", "!", "?", "؟", "…", ":"]

/** Whether the request already holds this exact sentence. */
export function hasSentence(text: string, sentence: string): boolean {
  return text.includes(sentence)
}

/**
 * The request with one more sentence at the end.
 *
 * A full stop is added first when the PM's last sentence has none: the brief
 * makes one wish per sentence, so an idea must never merge into theirs.
 */
export function addSentence(text: string, sentence: string): string {
  const current = text.trimEnd()
  if (!current.trim()) return sentence
  const lastCharacter = current[current.length - 1]
  const ended = SENTENCE_ENDINGS.includes(lastCharacter)
  return `${current}${ended ? "" : "."} ${sentence}`
}

/**
 * The request without a sentence: every copy of it, each with ONE of the
 * spaces that joined it (the one before it, else the one after), so the rest
 * of the PM's words and line breaks stay exactly as they were.
 */
export function removeSentence(text: string, sentence: string): string {
  if (!sentence || !text.includes(sentence)) return text
  let result = text
  let index = result.indexOf(sentence)
  while (index !== -1) {
    let start = index
    let end = index + sentence.length
    if (start > 0 && result[start - 1] === " ") {
      start -= 1
    } else if (result[end] === " ") {
      end += 1
    }
    result = result.slice(0, start) + result.slice(end)
    index = result.indexOf(sentence)
  }
  return result.trim()
}

/**
 * The request after clicking one idea chip: taken out when it is in, added
 * when it is not (in a pick-one row, the row's other ideas go first).
 * Returns null when adding it would go past `maxChars`.
 */
export function toggleIdea(
  text: string,
  row: IdeaRow,
  idea: string,
  maxChars: number,
): string | null {
  if (hasSentence(text, idea)) return removeSentence(text, idea)
  let next = text
  if (row.pickOne) {
    for (const other of row.ideas) {
      if (other !== idea) next = removeSentence(next, other)
    }
  }
  next = addSentence(next, idea)
  return next.length > maxChars ? null : next
}
