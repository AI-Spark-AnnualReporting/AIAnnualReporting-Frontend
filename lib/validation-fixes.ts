import { createContext } from "react"

import type { ReportValidation } from "@/lib/api/pm"

/* Turning a validation finding into a fix on the Build page.
 *
 * The validation page offers one of three actions per finding, by what the
 * finding needs:
 *   ai     - a wording problem the AI can fix: opens the section with an
 *            instruction ready in the refine box.
 *   edit   - needs a person (a real figure, a decision): opens the section.
 *   choose - nothing covers it yet: the PM picks a section first.
 * The Executive Summary is never offered one: it is rewritten by the AI at
 * every assembly, so it is fixed by fixing the sections it is written from. */

// Validation stores the summary under this code; the Build rail uses its own.
export const VALIDATION_SUMMARY_CODE = "executive_summary"

export type FixAction =
  | { kind: "ai"; sectionCode: string; label: string; instruction: string }
  | { kind: "edit"; sectionCode: string; label: string }
  | { kind: "choose"; text: string; instruction: string; manual?: boolean }

/** What the "Choose section & fix" pop-up carries to the Build page. */
export interface ChooseTarget {
  text: string
  instruction: string
  /** A to-do for the PM, shown on the Build page but kept out of the refine box. */
  manual?: boolean
}

/**
 * The Build page, opened on one section, optionally with an instruction ready.
 * A manual one travels as `todo` instead of `fix`: the Build page shows it but
 * does not put it in the refine box.
 */
export function buildFixHref(
  cycleId: string,
  sectionCode: string,
  instruction?: string,
  manual = false,
): string {
  const params = new URLSearchParams({ section: sectionCode })
  if (instruction) params.set(manual ? "todo" : "fix", instruction)
  return `/pm/cycles/${cycleId}/build?${params.toString()}`
}

/** Refine instruction for banned words found in one section. */
export function bannedWordsInstruction(words: string[]): string {
  const quoted = words.map((w) => `"${w}"`).join(", ")
  return `Replace ${quoted} in this section with plain wording the house style allows. Keep the meaning and everything else unchanged.`
}

/** Refine instruction for a point this section repeats from others. */
export function redundancyInstruction(otherTitles: string[], detail: string): string {
  const others = otherTitles.join(", ")
  return `This section repeats a point already made in ${others}: ${detail} Remove or shorten the repeated point here. Keep everything else unchanged.`
}

/**
 * To-do for a brief ask no section covers. Done by hand, not by the AI: an
 * ask is uncovered because nobody supplied the facts, so an AI fix could only
 * write a filler sentence that the next validation rejects.
 */
export function briefAskTodo(ask: string): string {
  return `Add this ask from the strategic brief by hand, with real details (names, dates, numbers): "${ask}"`
}

/** Refine instruction for a concept message no section carries. */
export function conceptInstruction(title: string): string {
  return `Add a sentence that carries the concept message "${title}", where it fits naturally. Do not invent facts. Keep everything else unchanged.`
}

/** A string matched literally inside a regular expression. */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * Pattern for a figure as findings store it ("2380", "15.4") that also matches
 * it as the report writes it ("2,380", Arabic separators), but never as part
 * of a longer number.
 */
function figurePattern(value: string): string {
  const digits = [...value].map((ch) => (ch === "." ? "\\." : escapeRegExp(ch)))
  return `(?<![\\d.,])${digits.join("[,\\u066C]?")}(?!\\d)`
}

/**
 * Pattern for a word or phrase, whole words only when it starts or ends with a
 * word character - so "due to" does not light up inside "overdue to".
 */
function phrasePattern(phrase: string): string {
  const body = escapeRegExp(phrase.trim())
  const start = /^\w/.test(phrase.trim()) ? "\\b" : ""
  const end = /\w$/.test(phrase.trim()) ? "\\b" : ""
  return `${start}${body}${end}`
}

/**
 * What to highlight in each section's preview on the Build page, as regex
 * sources: banned words, left-in instruction lines, and the figures flagged as
 * unsourced or disagreeing. Repetition is not here - the finding names the
 * sections, not a sentence.
 *
 * @returns {section_code: [regex source]}.
 */
export function highlightsBySection(validation: ReportValidation): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  const add = (code: string, source: string) => {
    if (!code || !source) return
    if (!out[code]) out[code] = []
    if (!out[code].includes(source)) out[code].push(source)
  }

  for (const v of validation.voice) {
    add(v.section_code, phrasePattern(v.phrase))
  }
  for (const i of validation.instruction_text) {
    // The stored line is raw markdown; the preview shows it without the list
    // marker, heading hashes or bold stars.
    const line = i.line.replace(/^[\s#>*\-\d.]+/, "").replace(/\*\*|__/g, "").trim()
    if (line) add(i.section_code, escapeRegExp(line))
  }
  for (const u of validation.untraced) {
    if (u.value) add(u.section_code, figurePattern(u.value))
  }
  for (const c of validation.conflicts) {
    for (const s of c.sections ?? []) {
      if (s.value) add(s.section_code, figurePattern(s.value))
    }
  }
  return out
}

/** One case-insensitive pattern for a section's highlights, or null for none. */
export function highlightRegex(sources: string[] | undefined): RegExp | null {
  if (!sources || sources.length === 0) return null
  return new RegExp(sources.map((s) => `(?:${s})`).join("|"), "gi")
}

/** Tells the refine box which section the PM arrived to fix, and with what. */
export const FixPrefillContext = createContext<{ sectionCode: string; text: string } | null>(null)

/**
 * One line per finding, grouped by the section it is in. Read by the Build
 * page's banner and the section counts in its rail.
 *
 * Brief gaps and uncarried concept messages belong to no section, so they
 * never appear here. Banned words in sections the house style does not govern
 * are left out, the same as the validation page does.
 *
 * @returns {section_code: [finding line]}.
 */
export function findingsBySection(validation: ReportValidation): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  const add = (code: string, line: string) => {
    if (!code) return
    if (!out[code]) out[code] = []
    out[code].push(line)
  }

  const toneExempt = new Set(
    (validation.coverage?.excluded ?? []).filter((e) => !e.tone).map((e) => e.section_code),
  )

  for (const u of validation.untraced) {
    add(u.section_code, `Figure with no recorded source: ${u.value}`)
  }
  for (const i of validation.instruction_text) {
    add(i.section_code, `Instruction left in place of an answer: "${i.line}"`)
  }
  for (const v of validation.voice) {
    if (!toneExempt.has(v.section_code)) add(v.section_code, `Word the house style rules out: "${v.phrase}"`)
  }
  for (const c of validation.conflicts) {
    for (const s of c.sections ?? []) {
      add(s.section_code, `Figure that disagrees with another section: ${c.measure} (${s.value} here)`)
    }
  }
  for (const r of validation.redundancy) {
    for (const code of r.sections) {
      const others = r.sections
        .filter((other) => other !== code)
        .map((other) => validation.sections?.[other]?.title || other)
      add(code, `Repeats a point also made in ${others.join(", ")}: ${r.detail}`)
    }
  }
  return out
}
