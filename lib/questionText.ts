/**
 * Generated questions arrive as "Topic — the actual question?". Everywhere a
 * question is shown the topic reads as a tag and the rest as the question.
 *
 * A question without that prefix (hand-written, or a dash used mid-sentence —
 * hence the length cap on the topic) keeps its text whole.
 */
// A plain hyphen counts too — nobody types an em dash — but only when spaced,
// so a hyphenated topic ("Non-financial risks — …") still splits at the dash.
const TOPIC = /^\s*([^—–\n]{1,60}?)\s*(?:[—–]|-)\s+(\S[\s\S]*)$/

/** Inverse of `splitQuestion` — no topic gives the bare question back. */
export function joinQuestion(topic: string, question: string): string {
  const t = topic.trim()
  return t ? `${t} — ${question.trim()}` : question.trim()
}

export const TOPIC_PLACEHOLDER = "Topic, e.g. Workforce Demographics"
export const QUESTION_PLACEHOLDER = "The question itself, e.g. What is the current headcount by department?"

/** `{ topic: null }` when the text carries no topic prefix. */
export function splitQuestion(text: string): { topic: string | null; question: string } {
  const m = TOPIC.exec(text)
  return m ? { topic: m[1], question: m[2] } : { topic: null, question: text }
}
