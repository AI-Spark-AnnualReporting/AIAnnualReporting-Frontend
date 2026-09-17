// The subsections of a section body.
//
// Subsections are not data anywhere — they are headings inside the section's
// markdown `content`, which is the source of truth for the body. The section
// writer is told to "break the section into 2 to 6 subsections", each starting
// with a `### ` heading, and the backend normalises anything shallower down to
// `###` on save. So `###` is what a freshly written section carries.
//
// Any depth is accepted anyway: hand-written and imported bodies predate that
// normalisation and carry `#` or `##` (the Chairman's Statement is exactly
// that), and the backend's own outline builder recognises `#` through `######`
// too. Reading fewer levels than the renderer does would hide headings from the
// rail that appear in the finished report.

/** One heading found in a section body. */
export interface Subsection {
  /** Heading text, without the leading #s. */
  title: string
  /** Heading depth, 1-6. */
  level: number
  /** Index into the body's lines — where to splice a new heading in. */
  line: number
}

// Same shape as the ATX matcher in lib/report-format.ts: up to three leading
// spaces, 1-6 #s, whitespace, the text, then an optional closing run of #s.
const ATX = /^(\s{0,3})(#{1,6})[ \t]+(.*\S)[ \t]*#*[ \t]*$/

/**
 * Every heading in a section body, in document order.
 *
 * Returns [] for an empty body, and for a body that is one unbroken run of
 * prose — which is what sections written before the subsection instruction
 * shipped look like.
 */
export function subsectionsOf(content: string | null | undefined): Subsection[] {
  if (!content) return []
  const out: Subsection[] = []
  const lines = content.split("\n")
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(ATX)
    if (m) out.push({ title: m[3].trim(), level: m[2].length, line: i })
  }
  return out
}

/**
 * The DOM id given to a rendered subsection heading, so the rail can scroll to
 * it.
 *
 * Derived from the heading text rather than its position, so it survives the
 * section being re-rendered or re-ordered. Two sections could produce the same
 * id, but only one section's body is on screen at a time, so it stays unique
 * where it matters.
 *
 * Both the rail and ProsePreview call this — a slug computed twice in two
 * places is a link that breaks the first time one of them changes.
 */
export function headingAnchorId(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
  // Arabic headings slug to something non-empty; a heading of only punctuation
  // does not, and an id of "sub-" collides with every other such heading.
  return `sub-${slug || "heading"}`
}

/** Where a new subsection goes, relative to the ones already there. */
export type Placement =
  | { at: "top" }
  | { at: "bottom" }
  | { at: "after"; title: string }

/**
 * Insert a heading into a body at the chosen place.
 *
 * Used for manual and extract sections, where there is no AI to write the
 * prose — the PM gets the heading and writes under it. AI sections take the
 * refine path instead, which rewrites the whole body.
 *
 * The heading is written at the depth the body already uses, so a `##` body
 * does not end up with one stray `###` in the middle of it.
 */
export function insertSubsection(
  content: string | null | undefined,
  name: string,
  placement: Placement,
): string {
  const body = content ?? ""
  const existing = subsectionsOf(body)
  const depth = existing.length ? existing[0].level : 3
  const heading = `${"#".repeat(depth)} ${name.trim()}`

  if (!body.trim()) return heading

  const lines = body.split("\n")

  if (placement.at === "bottom") return `${body.trimEnd()}\n\n${heading}`

  // Top means before the first heading, not line 0: a body may open with a
  // lead-in paragraph, which the writer is explicitly allowed to produce, and
  // that paragraph belongs to the section rather than to any subsection.
  if (placement.at === "top") {
    if (!existing.length) return `${body.trimEnd()}\n\n${heading}`
    return spliceAt(lines, existing[0].line, heading)
  }

  // After a named heading: insert before whichever heading follows it, so the
  // new one lands at the end of that subsection's prose rather than before it.
  const idx = existing.findIndex((s) => s.title === placement.title)
  if (idx === -1) return `${body.trimEnd()}\n\n${heading}`
  const next = existing[idx + 1]
  if (!next) return `${body.trimEnd()}\n\n${heading}`
  return spliceAt(lines, next.line, heading)
}

function spliceAt(lines: string[], at: number, heading: string): string {
  const before = lines.slice(0, at).join("\n").trimEnd()
  const after = lines.slice(at).join("\n").trimStart()
  return `${before}\n\n${heading}\n\n${after}`.trim()
}

/**
 * The refine instruction that adds a subsection to an AI-written section.
 *
 * Refine rewrites the whole body, so the instruction has to do two jobs: say
 * where the new heading goes, and stop the model touching the others. Rule 4 of
 * the refiner's system prompt already reproduces existing headings verbatim
 * unless the instruction asks otherwise — this says what to add without asking
 * for anything else to move.
 */
export function addSubsectionInstruction(
  name: string,
  placement: Placement,
): string {
  const where =
    placement.at === "top"
      ? "as the first subsection, before the existing ones"
      : placement.at === "bottom"
        ? "as the last subsection, after the existing ones"
        : `immediately after the "${placement.title}" subsection`
  return (
    `Add one new subsection titled "${name.trim()}", placed ${where}. ` +
    `Write its prose from the source material, in the same voice and at a ` +
    `similar length to the subsections around it. Leave every existing ` +
    `heading and its prose exactly as they are.`
  )
}

export function demo() {
  const body = [
    "A lead-in paragraph before any heading.",
    "",
    "### Operational Risk",
    "",
    "Prose about operational risk.",
    "",
    "### Geopolitical Exposure",
    "",
    "Prose about geopolitics.",
  ].join("\n")

  const found = subsectionsOf(body)
  console.assert(found.length === 2, "two headings found")
  console.assert(found[0].title === "Operational Risk", "first heading read")
  console.assert(found[1].level === 3, "depth read")

  // Flat prose — what a section written before the instruction shipped looks like.
  console.assert(subsectionsOf("One run of prose.").length === 0, "no headings")
  console.assert(subsectionsOf("").length === 0, "empty body")
  console.assert(subsectionsOf(null).length === 0, "null body")

  // Hand-written bodies use other depths and must still be read.
  console.assert(
    subsectionsOf("## Message of the Chairman\n\nText.")[0].title ===
      "Message of the Chairman",
    "## heading read",
  )

  // Bottom appends.
  console.assert(
    subsectionsOf(insertSubsection(body, "Cyber", { at: "bottom" })).map(
      (s) => s.title,
    ).join("|") === "Operational Risk|Geopolitical Exposure|Cyber",
    "bottom goes last",
  )

  // Top goes before the first heading but AFTER the lead-in paragraph.
  const topped = insertSubsection(body, "Cyber", { at: "top" })
  console.assert(
    subsectionsOf(topped).map((s) => s.title).join("|") ===
      "Cyber|Operational Risk|Geopolitical Exposure",
    "top goes first",
  )
  console.assert(
    topped.startsWith("A lead-in paragraph"),
    "the lead-in paragraph stays above the first heading",
  )

  // After a named heading lands between it and the next one.
  console.assert(
    subsectionsOf(
      insertSubsection(body, "Cyber", { at: "after", title: "Operational Risk" }),
    ).map((s) => s.title).join("|") ===
      "Operational Risk|Cyber|Geopolitical Exposure",
    "after lands in the middle",
  )

  // An unknown anchor falls back to the end rather than dropping the heading.
  console.assert(
    subsectionsOf(
      insertSubsection(body, "Cyber", { at: "after", title: "Gone" }),
    ).length === 3,
    "unknown anchor still inserts",
  )

  // Depth follows the body it is joining.
  console.assert(
    insertSubsection("## Existing\n\nText.", "New", { at: "bottom" }).includes(
      "## New",
    ),
    "matches the body's heading depth",
  )

  // A body with no prose at all becomes just the heading.
  console.assert(
    insertSubsection("", "First", { at: "bottom" }) === "### First",
    "empty body yields the heading alone",
  )

  const instruction = addSubsectionInstruction("Cyber", {
    at: "after",
    title: "Operational Risk",
  })
  console.assert(
    instruction.includes('"Cyber"') &&
      instruction.includes('"Operational Risk"') &&
      instruction.includes("Leave every existing heading"),
    "instruction names the subsection, the anchor, and protects the rest",
  )

  // Anchors are stable, slug punctuation away, and survive non-Latin text.
  console.assert(
    headingAnchorId("Operational Risk") === "sub-operational-risk",
    "slug lowercases and hyphenates",
  )
  console.assert(
    headingAnchorId("Dear Shareholders,") === "sub-dear-shareholders",
    "trailing punctuation does not leave a dangling hyphen",
  )
  console.assert(
    headingAnchorId("H.E. Yasir O. Al-Rumayyan") ===
      headingAnchorId("H.E. Yasir O. Al-Rumayyan"),
    "same title gives the same id",
  )
  console.assert(
    headingAnchorId("إدارة المخاطر").startsWith("sub-") &&
      headingAnchorId("إدارة المخاطر") !== "sub-heading",
    "Arabic headings keep their letters rather than slugging to nothing",
  )
  console.assert(
    headingAnchorId("***") === "sub-heading",
    "a heading with no letters still gets a usable id",
  )

  console.log("sectionOutline: all checks passed")
}
