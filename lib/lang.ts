// Lightweight client-side language check for Arabic vs English.
// Arabic and English use different alphabets, so a simple letter-script ratio
// separates them reliably without any network call. Used to warn (not block)
// when a PM types in a language that doesn't match the cycle's content_language.

import type { ContentLanguage } from "@/types"

function isArabicLetter(ch: string): boolean {
  const c = ch.codePointAt(0) ?? 0
  return (
    (c >= 0x0600 && c <= 0x06ff) || // Arabic
    (c >= 0x0750 && c <= 0x077f) || // Arabic Supplement
    (c >= 0x08a0 && c <= 0x08ff) || // Arabic Extended-A
    (c >= 0xfb50 && c <= 0xfdff) || // Presentation Forms-A
    (c >= 0xfe70 && c <= 0xfeff) // Presentation Forms-B
  )
}

function isLatinLetter(ch: string): boolean {
  return (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z")
}

// How much of the text must be in the cycle's language to be accepted.
// 0.7 = at least 70% of letters must match; up to 30% other-language is allowed
// (covers quoted terms, names, units). Bump to 0.8 for stricter.
export const MIN_CORRECT_RATIO = 0.7
// Below this many letters there isn't enough signal to judge — never block.
const MIN_LETTERS = 12

function letterCounts(text: string): { arabic: number; latin: number } {
  let arabic = 0
  let latin = 0
  for (const ch of text || "") {
    if (isArabicLetter(ch)) arabic++
    else if (isLatinLetter(ch)) latin++
  }
  return { arabic, latin }
}

// "arabic" | "english" | "ambiguous" (mixed) | "unknown" (too little text).
export function detectScriptLanguage(
  text: string,
  minLetters = MIN_LETTERS,
  decisiveRatio = MIN_CORRECT_RATIO,
): "arabic" | "english" | "ambiguous" | "unknown" {
  const { arabic, latin } = letterCounts(text)
  const total = arabic + latin
  if (total < minLetters) return "unknown"
  const ratio = arabic / total
  if (ratio >= decisiveRatio) return "arabic"
  if (ratio <= 1 - decisiveRatio) return "english"
  return "ambiguous"
}

// True if the text is OK to submit for `expected`: either too little text to
// judge, or at least MIN_CORRECT_RATIO of its letters are in `expected`.
export function isLanguageAcceptable(
  text: string,
  expected: ContentLanguage,
): boolean {
  const { arabic, latin } = letterCounts(text)
  const total = arabic + latin
  if (total < MIN_LETTERS) return true
  const correct = expected === "arabic" ? arabic : latin
  return correct / total >= MIN_CORRECT_RATIO
}

// Warning string when `text` isn't acceptable for `expected`, else null.
// Permissive: empty/too-short text never warns (avoids nagging).
export function languageMismatchWarning(
  text: string,
  expected: ContentLanguage,
): string | null {
  if (isLanguageAcceptable(text, expected)) return null
  const want = expected === "arabic" ? "Arabic" : "English"
  return `This cycle's language is ${want} — please write mostly in ${want} (at least ${Math.round(
    MIN_CORRECT_RATIO * 100,
  )}%).`
}
