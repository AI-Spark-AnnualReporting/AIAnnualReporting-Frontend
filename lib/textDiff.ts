/**
 * Word-level comparison of two texts, for the kickoff History panel.
 *
 * Finds the longest run of words both texts share in order (the classic
 * "longest common subsequence"), then walks it: words only in the old text are
 * "removed", words only in the new one are "added", the rest are "same".
 * Whitespace is kept as its own token so paragraphs survive.
 *
 * No library: the texts are a brief or a concept message, a few hundred words,
 * so the plain table below is small and fast enough.
 */

export interface DiffPart {
  type: "same" | "added" | "removed"
  text: string
}

/** Split into words, the whitespace between them, and punctuation, keeping
 *  all three. Punctuation is its own piece: glued to its word, adding
 *  ", Loyalty programs" after "campaigns" read as "campaigns" removed and
 *  "campaigns," added. */
function tokenize(text: string): string[] {
  return text.split(/(\s+|[,.;:!?])/).filter((t) => t.length > 0)
}

/** Add a token to the result, merging it into the previous part when they
 *  share a type, so the output is a few long runs rather than one per word. */
function push(parts: DiffPart[], type: DiffPart["type"], text: string): void {
  const last = parts[parts.length - 1]
  if (last && last.type === type) {
    last.text += text
  } else {
    parts.push({ type, text })
  }
}

/** Compare two texts word by word. */
export function wordDiff(before: string, after: string): DiffPart[] {
  const a = tokenize(before)
  const b = tokenize(after)

  // lengths[i][j] = how many tokens a[i..] and b[j..] have in common, in order.
  const lengths: number[][] = []
  for (let i = 0; i <= a.length; i++) {
    lengths.push(new Array(b.length + 1).fill(0))
  }
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      if (a[i] === b[j]) {
        lengths[i][j] = lengths[i + 1][j + 1] + 1
      } else {
        lengths[i][j] = Math.max(lengths[i + 1][j], lengths[i][j + 1])
      }
    }
  }

  // Walk the table from the start, taking shared tokens where we can.
  const parts: DiffPart[] = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      push(parts, "same", a[i])
      i++
      j++
    } else if (lengths[i + 1][j] >= lengths[i][j + 1]) {
      push(parts, "removed", a[i])
      i++
    } else {
      push(parts, "added", b[j])
      j++
    }
  }
  while (i < a.length) {
    push(parts, "removed", a[i])
    i++
  }
  while (j < b.length) {
    push(parts, "added", b[j])
    j++
  }
  return parts
}

/** True when the comparison found any change at all. */
export function hasChanges(parts: DiffPart[]): boolean {
  return parts.some((p) => p.type !== "same")
}
